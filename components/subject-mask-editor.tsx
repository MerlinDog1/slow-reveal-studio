"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  assertSubjectMaskBinding,
  decodeSubjectMaskData,
  maskRasterDimensions,
  normalizeSubjectMask,
  type SubjectMask,
  type SubjectMaskBinding,
} from "@/lib/subject-mask";
import {
  paintMaskStroke,
  snapshotSubjectMaskDraft,
  type MaskPoint,
} from "@/lib/browser-subject-mask";

export type SubjectMaskEditorProps = {
  /** A local URL of the current cropped photo, not the uncropped original. */
  sourceUrl: string;
  binding: SubjectMaskBinding;
  value?: SubjectMask;
  onApply: (mask: SubjectMask) => void;
  onClose: () => void;
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};
const fieldStyle: CSSProperties = { display: "grid", gap: 8 };
const clamp = (value: number, limit: number) =>
  Math.max(0, Math.min(limit - 1, value));

/** Draft-only editor. Closing discards edits; Apply returns a freshly validated mask. */
export function SubjectMaskEditor({
  sourceUrl,
  binding,
  value,
  onApply,
  onClose,
}: SubjectMaskEditorProps) {
  const helpId = useId();
  const statusId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const alphaRef = useRef<Uint8Array>(new Uint8Array());
  const historyRef = useRef<Uint8Array[]>([]);
  const pointerRef = useRef<{ id: number; point: MaskPoint } | null>(null);
  const keyboardPaintingRef = useRef(false);
  const cursorRef = useRef<MaskPoint>({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);
  const [mode, setMode] = useState<"keep" | "remove">("keep");
  const [brushPercent, setBrushPercent] = useState(10);
  const [feather, setFeather] = useState(value?.feather ?? 0);
  const [overlay, setOverlay] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [undoCount, setUndoCount] = useState(0);
  const [keptPercent, setKeptPercent] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  const [keyboardPainting, setKeyboardPainting] = useState(false);
  const [cursor, setCursor] = useState<MaskPoint>({ x: 0, y: 0 });
  const { width, height } = maskRasterDimensions(
    binding.widthMm,
    binding.heightMm,
  );
  const radius = Math.max(1, (Math.min(width, height) * brushPercent) / 200);
  const bindingKey = JSON.stringify(binding);

  const refreshCount = useCallback(() => {
    const alpha = alphaRef.current;
    let kept = 0;
    for (const value of alpha) kept += value / 255;
    setKeptPercent(
      alpha.length ? Math.round((kept / alpha.length) * 10000) / 100 : 0,
    );
    setHasSelection(kept > 0);
    setUndoCount(historyRef.current.length);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const photo = imageRef.current;
    if (!canvas || !ctx || !photo || alphaRef.current.length !== width * height)
      return;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(photo, 0, 0, width, height);
    if (overlay) {
      const layer = overlayRef.current ?? document.createElement("canvas");
      overlayRef.current = layer;
      layer.width = width;
      layer.height = height;
      const layerContext = layer.getContext("2d");
      if (layerContext) {
        const pixels = layerContext.createImageData(width, height);
        for (let i = 0; i < alphaRef.current.length; i++) {
          const kept = alphaRef.current[i] / 255;
          pixels.data[i * 4] = 25;
          pixels.data[i * 4 + 1] = Math.round(25 + kept * 155);
          pixels.data[i * 4 + 2] = Math.round(25 + kept * 115);
          pixels.data[i * 4 + 3] = Math.round(80 + kept * 25);
        }
        layerContext.putImageData(pixels, 0, 0);
        ctx.drawImage(layer, 0, 0);
      }
    }
    const point = cursorRef.current;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = mode === "keep" ? "#163f35" : "#9c3d2b";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(point.x - 1, point.y - 1, 2, 2);
  }, [width, height, overlay, radius, mode]);

  const scheduleDraw = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    imageRef.current = null;
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, width, height);
    pointerRef.current = null;
    keyboardPaintingRef.current = false;
    setKeyboardPainting(false);
    historyRef.current = [];
    try {
      if (value) {
        const normalized = normalizeSubjectMask(value);
        assertSubjectMaskBinding(normalized, JSON.parse(bindingKey));
        alphaRef.current = decodeSubjectMaskData(normalized).slice();
        setFeather(normalized.feather);
      } else {
        alphaRef.current = new Uint8Array(width * height);
        setFeather(0);
      }
      cursorRef.current = {
        x: Math.floor(width / 2),
        y: Math.floor(height / 2),
      };
      setCursor(cursorRef.current);
      refreshCount();
      if (
        !sourceUrl.startsWith("blob:") &&
        !/^data:image\/(png|jpeg|webp);base64,/.test(sourceUrl)
      )
        throw new Error(
          "Open the current local photo crop before painting a mask.",
        );
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        imageRef.current = image;
        setReady(true);
      };
      image.onerror = () => {
        if (active)
          setError(
            "The cropped photo could not be opened. Close this editor and try again.",
          );
      };
      image.src = sourceUrl;
    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "The saved mask could not be opened.",
      );
    }
    return () => {
      active = false;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // The serialized binding resets the draft only when its actual crop/source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sourceUrl,
    bindingKey,
    value?.data,
    value?.feather,
    width,
    height,
    refreshCount,
  ]);

  useEffect(() => {
    if (ready) scheduleDraw();
  }, [ready, scheduleDraw]);

  function remember() {
    historyRef.current = [
      ...historyRef.current.slice(-19),
      alphaRef.current.slice(),
    ];
    setUndoCount(historyRef.current.length);
  }
  function finishKeyboardPaint() {
    keyboardPaintingRef.current = false;
    setKeyboardPainting(false);
    refreshCount();
  }
  function moveCursor(point: MaskPoint) {
    cursorRef.current = point;
    setCursor(point);
    scheduleDraw();
  }
  function paint(from: MaskPoint, to: MaskPoint) {
    paintMaskStroke(alphaRef.current, width, height, from, to, radius, mode);
    scheduleDraw();
  }
  function pointerPoint(event: PointerEvent<HTMLCanvasElement>): MaskPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * width, width),
      y: clamp(((event.clientY - rect.top) / rect.height) * height, height),
    };
  }
  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!ready || event.button !== 0 || pointerRef.current) return;
    event.preventDefault();
    finishKeyboardPaint();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPoint(event);
    pointerRef.current = { id: event.pointerId, point };
    remember();
    moveCursor(point);
    paint(point, point);
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!ready) return;
    const active = pointerRef.current;
    if (active && active.id !== event.pointerId) return;
    if (!active && keyboardPaintingRef.current) return;
    const point = pointerPoint(event);
    if (active) {
      event.preventDefault();
      paint(active.point, point);
      pointerRef.current = { ...active, point };
    }
    moveCursor(point);
  }
  function pointerEnd(event: PointerEvent<HTMLCanvasElement>) {
    const active = pointerRef.current;
    if (active?.id !== event.pointerId) return;
    if (event.type === "pointerup") {
      const point = pointerPoint(event);
      paint(active.point, point);
      moveCursor(point);
    }
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    refreshCount();
  }
  function undo() {
    finishKeyboardPaint();
    const previous = historyRef.current.pop();
    if (previous) alphaRef.current = previous;
    refreshCount();
    scheduleDraw();
  }
  function keyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!ready || pointerRef.current) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.repeat) return;
      if (keyboardPaintingRef.current) finishKeyboardPaint();
      else {
        remember();
        keyboardPaintingRef.current = true;
        setKeyboardPainting(true);
        paint(cursorRef.current, cursorRef.current);
        refreshCount();
      }
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) {
        remember();
        paint(cursorRef.current, cursorRef.current);
        refreshCount();
      }
      return;
    }
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      setBrushPercent((value) =>
        Math.max(2, Math.min(30, value + (event.key === "[" ? -2 : 2))),
      );
      return;
    }
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : Math.max(1, Math.round(radius / 2));
    const previous = cursorRef.current;
    const next = {
      x: clamp(previous.x + direction[0] * step, width),
      y: clamp(previous.y + direction[1] * step, height),
    };
    if (keyboardPaintingRef.current) {
      paint(previous, next);
      refreshCount();
    }
    moveCursor(next);
  }
  function apply() {
    finishKeyboardPaint();
    try {
      const mask = snapshotSubjectMaskDraft(alphaRef.current, binding, feather);
      onApply(mask);
    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "The mask could not be applied.",
      );
    }
  }

  return (
    <section
      aria-label="Manual subject mask editor"
      style={{ padding: "8px 20px 24px", display: "grid", gap: 20 }}
    >
      <p style={{ margin: 0, maxWidth: 850 }}>
        Paint the subject you want to keep. Green areas are kept; the rest can
        fade with mask strength in the lab. This is your manual selection, with
        no automatic subject detection or photo upload.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          gap: 24,
          alignItems: "start",
        }}
      >
        <div
          style={{
            minWidth: 0,
            display: "grid",
            gap: 10,
            justifyItems: "center",
          }}
        >
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            tabIndex={ready ? 0 : -1}
            role="application"
            aria-label="Paint subject mask"
            aria-roledescription="keyboard and pointer drawing canvas"
            aria-describedby={`${helpId} ${statusId}`}
            aria-disabled={!ready}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}
            onLostPointerCapture={pointerEnd}
            onKeyDown={keyboard}
            onBlur={finishKeyboardPaint}
            style={{
              display: "block",
              width: `min(100%, calc(58dvh * ${width / height}))`,
              height: "auto",
              aspectRatio: `${width} / ${height}`,
              background: "#e7e1d6",
              border: "1px solid var(--line, #cec6b7)",
              touchAction: "none",
              cursor: "crosshair",
              maxWidth: "100%",
            }}
          >
            Use the keep and remove brushes to select your subject.
          </canvas>
          <p id={statusId} style={{ margin: 0, fontSize: 13 }}>
            Cursor {Math.round((cursor.x / Math.max(1, width - 1)) * 100)}%
            across, {Math.round((cursor.y / Math.max(1, height - 1)) * 100)}%
            down.{" "}
            {keyboardPainting
              ? "Arrow painting is on."
              : "Arrow painting is off."}
          </p>
          {!ready && !error && <p role="status">Opening your cropped photo…</p>}
        </div>
        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          <div role="group" aria-label="Brush action" style={rowStyle}>
            <button
              type="button"
              className={`button small${mode === "keep" ? "" : " light"}`}
              disabled={!ready}
              aria-pressed={mode === "keep"}
              onClick={() => {
                finishKeyboardPaint();
                setMode("keep");
              }}
            >
              Keep subject
            </button>
            <button
              type="button"
              className={`button small${mode === "remove" ? "" : " light"}`}
              disabled={!ready}
              aria-pressed={mode === "remove"}
              onClick={() => {
                finishKeyboardPaint();
                setMode("remove");
              }}
            >
              Remove area
            </button>
          </div>
          <label style={fieldStyle}>
            Brush diameter: {brushPercent}% of the short edge
            <input
              type="range"
              min={2}
              max={30}
              step={1}
              value={brushPercent}
              disabled={!ready}
              onChange={(event) => setBrushPercent(Number(event.target.value))}
            />
          </label>
          <label style={fieldStyle}>
            Feather edge: {(feather * 100).toFixed(1)}%
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={Math.round(feather * 1000) / 10}
              disabled={!ready}
              onChange={(event) => setFeather(Number(event.target.value) / 100)}
            />
            <small>
              Softens the edge after Apply. The overlay shows your painted
              selection before feathering.
            </small>
          </label>
          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={overlay}
              disabled={!ready}
              onChange={(event) => setOverlay(event.target.checked)}
            />
            Show selection overlay
          </label>
          <div style={rowStyle}>
            <button
              type="button"
              className="button light small"
              disabled={!ready || undoCount === 0}
              onClick={undo}
            >
              Undo ({undoCount})
            </button>
            <button
              type="button"
              className="button light small"
              disabled={!ready || !hasSelection}
              onClick={() => {
                finishKeyboardPaint();
                remember();
                alphaRef.current.fill(0);
                refreshCount();
                scheduleDraw();
              }}
            >
              Clear selection
            </button>
          </div>
          <p aria-live="polite" style={{ margin: 0 }}>
            {keptPercent}% of the crop is selected.{" "}
            {!hasSelection
              ? "Paint an area to keep before applying."
              : "Changes stay in this draft until Apply."}
          </p>
          <p id={helpId} style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            Keyboard: focus the canvas and use arrow keys to move; Shift +
            arrows moves one pixel. Space paints at the cursor. Enter turns
            painting while moving on or off. [ and ] change brush size. Ctrl or
            Command + Z undoes a stroke. Leaving the canvas stops arrow
            painting. Undo remembers the last 20 strokes.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" style={{ margin: 0, color: "#923f2e" }}>
          {error}
        </p>
      )}
      <div style={{ ...rowStyle, justifyContent: "flex-end" }}>
        <button type="button" className="button light" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button"
          disabled={!ready || !hasSelection || !!error}
          onClick={apply}
        >
          Apply mask
        </button>
      </div>
    </section>
  );
}
