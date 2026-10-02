"use client";
import { useEffect, useRef, useState } from "react";
import { type RenderGeometry } from "@/lib/renderers";
import { drawArtwork } from "@/lib/draw-artwork";
import { downloadBlob } from "@/lib/export-artwork";
import { PreviewDialog } from "./preview-dialog";

export function RevealPlayer({
  geometry: g,
  downloadable = false,
}: {
  geometry: RenderGeometry;
  downloadable?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    raf = useRef(0),
    fraction = useRef(1);
  const [progress, setProgress] = useState(1),
    [playing, setPlaying] = useState(false),
    [recording, setRecording] = useState(false),
    [notice, setNotice] = useState(""),
    [closeUp, setCloseUp] = useState(false);
  const paint = (value: number) => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext("2d")!;
    ctx.setTransform(
      element.width / g.widthMm,
      0,
      0,
      element.height / g.heightMm,
      0,
      0,
    );
    drawArtwork(ctx, g, {
      progress: value,
      pixelsPerMm: element.width / g.widthMm,
    });
  };
  useEffect(() => {
    fraction.current = 1;
    setProgress(1);
    setPlaying(false);
    paint(1);
    return () => {
      cancelAnimationFrame(raf.current);
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
        recorder.current.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [g]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(),
      lastPaint = 0;
    const tick = (now: number) => {
      const step = Math.min(100, now - last);
      last = now;
      fraction.current = Math.min(1, fraction.current + step / 14000);
      if (now - lastPaint >= 50 || fraction.current >= 1) {
        paint(fraction.current);
        setProgress(fraction.current);
        lastPaint = now;
      }
      if (fraction.current < 1) raf.current = requestAnimationFrame(tick);
      else {
        setPlaying(false);
        if (recorder.current?.state === "recording") recorder.current.stop();
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, g]);
  function play() {
    if (fraction.current >= 1) {
      fraction.current = 0;
      setProgress(0);
      paint(0);
    }
    setPlaying((old) => !old);
  }
  function record() {
    if (
      !canvas.current ||
      typeof MediaRecorder === "undefined" ||
      !canvas.current.captureStream
    ) {
      setNotice(
        "Video recording is unavailable in this browser. The interactive reveal still works.",
      );
      return;
    }
    const mime = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) {
      setNotice("No supported video encoder in this browser.");
      return;
    }
    try {
      const stream = canvas.current.captureStream(20),
        parts: Blob[] = [];
      const active = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 5000000,
      });
      recorder.current = active;
      active.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data);
      };
      active.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (parts.length)
          downloadBlob(
            new Blob(parts, { type: mime }),
            `my-slow-reveal.${mime.includes("mp4") ? "mp4" : "webm"}`,
          );
      };
      active.onerror = () => {
        setNotice("Video encoding stopped. Try playback or another browser.");
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setPlaying(false);
      };
      fraction.current = 0;
      setProgress(0);
      paint(0);
      active.start();
      setRecording(true);
      setPlaying(true);
      setNotice(
        "Recording locally. Keep this window visible until the reveal finishes.",
      );
    } catch {
      setNotice("This browser could not start video recording.");
    }
  }
  return (
    <div className="reveal-player">
      <div
        className="reveal-frame"
        style={{ aspectRatio: `${g.widthMm}/${g.heightMm}` }}
      >
        <canvas
          ref={canvas}
          width={900}
          height={Math.round((900 * g.heightMm) / g.widthMm)}
          aria-label="Artwork revealed mark by mark"
          style={{
            transform: closeUp
              ? `scale(${1 + 2 * (1 - progress) ** 2})`
              : undefined,
          }}
        />
      </div>
      <label className="range-field">
        Reveal · {Math.round(progress * g.stats.markCount).toLocaleString()} /{" "}
        {g.stats.markCount.toLocaleString()} marks
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          disabled={recording}
          onChange={(e) => {
            const value = Number(e.target.value);
            setPlaying(false);
            fraction.current = value;
            setProgress(value);
            paint(value);
          }}
        />
      </label>
      <div className="tool-actions">
        <button disabled={recording} onClick={play}>
          {playing ? "Pause" : progress === 1 ? "Replay" : "Play"}
        </button>
        <label className="check-label">
          <input
            type="checkbox"
            checked={closeUp}
            onChange={(e) => setCloseUp(e.target.checked)}
          />
          Pull back from detail
        </label>
        {downloadable && (
          <button disabled={recording} onClick={record}>
            {recording ? "Recording…" : "Download reveal video"}
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="fine-print">
          {notice}
        </p>
      )}
      <p className="fine-print">
        Digital reveal from the saved marks. Video exports the full artwork
        without the optional camera effect. Playback starts only when you choose
        Play.
      </p>
    </div>
  );
}
export function RevealStudio({ geometry }: { geometry: RenderGeometry }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Animate my artwork</button>
      <PreviewDialog
        open={open}
        title="Your own slow reveal"
        onClose={() => setOpen(false)}
      >
        {open && <RevealPlayer geometry={geometry} downloadable />}
      </PreviewDialog>
    </>
  );
}
