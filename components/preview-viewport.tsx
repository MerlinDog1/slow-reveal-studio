"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Minus, Plus, Maximize } from "lucide-react";

const LEVELS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16];
type Camera = { zoom: number; x: number; y: number };
const FIT: Camera = { zoom: 1, x: 0, y: 0 };
const clamp = (value: number, limit: number) =>
  Math.max(-limit, Math.min(limit, value));

/** View-only magnification: change SVG layout size, never the artwork/crop geometry. */
export function PreviewViewport({
  children,
  aspectRatio,
  caption,
  enabled,
  resetKey,
  comparison,
}: {
  children: ReactNode;
  aspectRatio: number;
  caption: ReactNode;
  enabled: boolean;
  resetKey: string;
  comparison?: { value: number; onChange: (value: number) => void };
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    camera: Camera;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>(FIT);
  const hintId = useId();
  const fitWidth = Math.max(
    1,
    Math.min(size.width - 40, (size.height - 40) * aspectRatio),
  );
  const fitHeight = fitWidth / aspectRatio;
  const bound = useCallback(
    (next: Camera): Camera => ({
      zoom: next.zoom,
      x: clamp(
        next.x,
        Math.max(0, (fitWidth * next.zoom - size.width) / 2 + 20),
      ),
      y: clamp(
        next.y,
        Math.max(0, (fitHeight * next.zoom - size.height) / 2 + 20),
      ),
    }),
    [fitWidth, fitHeight, size],
  );

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setCamera(FIT);
    drag.current = null;
    setDragging(false);
  }, [resetKey]);
  useEffect(() => {
    setCamera((current) => bound(current));
  }, [bound]);

  const zoomTo = useCallback(
    (zoom: number, anchor = { x: 0, y: 0 }) => {
      setCamera((current) => {
        if (zoom === 1) return FIT;
        const ratio = zoom / current.zoom;
        return bound({
          zoom,
          x: anchor.x - (anchor.x - current.x) * ratio,
          y: anchor.y - (anchor.y - current.y) * ratio,
        });
      });
    },
    [bound],
  );
  const stepZoom = useCallback(
    (direction: number, anchor?: { x: number; y: number }) => {
      const index = LEVELS.indexOf(camera.zoom);
      zoomTo(
        LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index + direction))],
        anchor,
      );
    },
    [camera.zoom, zoomTo],
  );

  useEffect(() => {
    const element = viewport.current;
    if (!element || !enabled) return;
    const wheel = (event: WheelEvent) => {
      // Ordinary scrolling still moves the page. Ctrl/trackpad pinch zooms this preview.
      if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      stepZoom(event.deltaY < 0 ? 1 : -1, {
        x: event.clientX - box.left - box.width / 2,
        y: event.clientY - box.top - box.height / 2,
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [enabled, stepZoom]);

  return (
    <div className="preview-magnifier">
      <div
        className="preview-zoom-bar"
        role="group"
        aria-label="Preview magnification"
      >
        <button
          type="button"
          className="preview-zoom-button"
          aria-label="Zoom out preview"
          title="Zoom out"
          disabled={!enabled || camera.zoom === 1}
          onClick={() => stepZoom(-1)}
        >
          <Minus size={17} />
        </button>
        <select
          aria-label="Preview zoom"
          value={camera.zoom}
          disabled={!enabled}
          onChange={(event) => zoomTo(Number(event.target.value))}
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level === 1 ? "100% · Fit" : `${level * 100}%`}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="preview-zoom-button"
          aria-label="Zoom in preview"
          title="Zoom in"
          disabled={!enabled || camera.zoom === 16}
          onClick={() => stepZoom(1)}
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          className="preview-fit-button"
          disabled={!enabled}
          onClick={() => setCamera(FIT)}
        >
          <Maximize size={14} />
          Fit
        </button>
        <span className="preview-zoom-hint">
          {camera.zoom > 1 ? "Drag to explore" : "Zoom in to see each mark"}
        </span>
      </div>
      {comparison && (
        <label className="preview-comparison-control">
          <span>Original</span>
          <input
            aria-label="Original and artwork comparison position"
            type="range"
            min={0}
            max={100}
            value={comparison.value}
            onChange={(event) =>
              comparison.onChange(Number(event.target.value))
            }
          />
          <span>Finished</span>
        </label>
      )}
      <div
        ref={viewport}
        className={`preview-viewport${camera.zoom > 1 ? " zoomed" : ""}${dragging ? " panning" : ""}`}
        role="region"
        aria-label="Magnified artwork"
        aria-describedby={hintId}
        tabIndex={enabled ? 0 : -1}
        onDragStart={(event) => {
          if (enabled) event.preventDefault();
        }}
        onPointerDown={(event) => {
          if (
            !enabled ||
            camera.zoom === 1 ||
            event.button !== 0 ||
            drag.current ||
            (event.target as Element).closest("button, input, select, a")
          )
            return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            camera,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start?.id !== event.pointerId) return;
          setCamera(
            bound({
              zoom: start.camera.zoom,
              x: start.camera.x + event.clientX - start.x,
              y: start.camera.y + event.clientY - start.y,
            }),
          );
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          drag.current = null;
          setDragging(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
        }}
        onKeyDown={(event) => {
          if (!enabled || event.target !== event.currentTarget) return;
          if (["+", "=", "-", "0", "Home"].includes(event.key)) {
            event.preventDefault();
            if (event.key === "0" || event.key === "Home") setCamera(FIT);
            else stepZoom(event.key === "-" ? -1 : 1);
          } else if (
            camera.zoom > 1 &&
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            const distance = event.shiftKey ? 160 : 48;
            setCamera((current) =>
              bound({
                ...current,
                x:
                  current.x +
                  (event.key === "ArrowLeft"
                    ? distance
                    : event.key === "ArrowRight"
                      ? -distance
                      : 0),
                y:
                  current.y +
                  (event.key === "ArrowUp"
                    ? distance
                    : event.key === "ArrowDown"
                      ? -distance
                      : 0),
              }),
            );
          }
        }}
      >
        <div
          className="preview-zoom-artwork"
          style={{
            width: fitWidth * camera.zoom,
            height: fitHeight * camera.zoom,
            left: "50%",
            top: "50%",
            marginLeft: (-fitWidth * camera.zoom) / 2,
            marginTop: (-fitHeight * camera.zoom) / 2,
            transform: `translate(${camera.x}px, ${camera.y}px)`,
            visibility: size.width ? "visible" : "hidden",
          }}
        >
          {children}
        </div>
      </div>
      <div className="preview-zoom-footer">
        <span className="dimension-line">{caption}</span>
        <p id={hintId}>
          View only · Drag or use arrow keys when zoomed. + / − to zoom, 0 to
          fit.
        </p>
      </div>
    </div>
  );
}
