"use client";
import { useEffect, useRef, useState } from "react";
import { ArtworkCanvas } from "./artwork-canvas";
import { PreviewDialog } from "./preview-dialog";
import { cropImage, loadImage, type Crop } from "@/lib/image-processing";
import {
  type RenderGeometry,
  type RenderMode,
  type RenderSettings,
  isOpticalMode,
  usesOpticalColour,
} from "@/lib/renderers";
import { MOSAIC_MARKER_PALETTE } from "@/lib/mosaic-palette";
import { defaultOpticalPalette } from "@/lib/optical-palette";
import type { SubjectMask } from "@/lib/subject-mask";

const names: Partial<Record<RenderMode, string>> = {
  dots: "Signature Dots",
  fibonacci: "Fibonacci Spiral",
  mosaic: "Mosaic Fill",
  "line-amplification": "Line Study",
  "colour-blend": "Colour Blend",
  "tv-weave": "TV Weave",
};
type Study = {
  name: string;
  settings: RenderSettings;
  crop: Crop;
  geometry?: RenderGeometry;
  error?: string;
};
export function ComparisonBoard({
  source,
  settings,
  crop,
  mask,
  modes,
  apply,
}: {
  source: string;
  settings: RenderSettings;
  crop: Crop;
  mask?: SubjectMask;
  modes: RenderMode[];
  apply: (settings: RenderSettings, crop: Crop) => void;
}) {
  const [kind, setKind] = useState<"modes" | "crops" | "colours" | null>(null),
    [items, setItems] = useState<Study[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const worker = useRef<Worker | null>(null);
  useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    setBusy(true);
    setError("");
    setItems([]);
    const next: Study[] =
      kind === "modes"
        ? modes.map((mode) => ({
            name: names[mode] ?? mode,
            crop,
            settings: {
              ...settings,
              mode,
              linePattern: "horizontal",
              palette: isOpticalMode(mode)
                ? (settings.palette ?? defaultOpticalPalette())
                : mode === "fibonacci" || mode === "mosaic"
                  ? settings.palette
                  : undefined,
              invert: false,
            },
          }))
        : kind === "crops"
          ? [1, 1.35, 1.75].map((zoom) => ({
              name:
                zoom === 1
                  ? "Room to breathe"
                  : zoom === 1.35
                    ? "A closer look"
                    : "Focus on the subject",
              settings,
              crop: { ...crop, zoom: Math.min(4, zoom * crop.zoom) },
            }))
          : (settings.mode === "mosaic" ? [8, 16, 32] : [8, 16]).map(
              (count) => ({
                name: `${count} colours`,
                crop,
                settings: {
                  ...settings,
                  palette: MOSAIC_MARKER_PALETTE.slice(0, count),
                  invert: false,
                },
              }),
            );
    setItems(next);
    void loadImage(source)
      .then((image) => {
        if (cancelled) return;
        const w = new Worker(
          new URL("../workers/comparison.worker.ts", import.meta.url),
        );
        worker.current = w;
        w.onmessage = ({ data }) => {
          if (cancelled) return;
          if (data.done) {
            setBusy(false);
            w.terminate();
            return;
          }
          setItems((old) =>
            old.map((item, index) =>
              index === data.index
                ? { ...item, geometry: data.geometry, error: data.error }
                : item,
            ),
          );
        };
        w.onerror = () => {
          setError("Comparison stopped. Please try again.");
          setBusy(false);
          w.terminate();
        };
        w.postMessage({
          items: next.map((item) => {
            const { pixels } = cropImage(
              image,
              item.crop,
              item.settings.widthMm / item.settings.heightMm,
              1000,
            );
            return {
              ...item,
              input: {
                width: pixels.width,
                height: pixels.height,
                data: pixels.data,
              },
              subjectMask: mask,
            };
          }),
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
      worker.current?.terminate();
    };
  }, [kind, source, settings, crop, mask, modes]);
  return (
    <>
      <div className="tool-actions">
        <button onClick={() => setKind("modes")}>Compare styles</button>
        <button
          disabled={!!mask}
          title={
            mask ? "Clear the crop-bound selection to compare crops" : undefined
          }
          onClick={() => setKind("crops")}
        >
          Compare crops
        </button>
        <button
          disabled={
            !settings.palette ||
            (!usesOpticalColour(settings) && settings.mode !== "mosaic")
          }
          onClick={() => setKind("colours")}
        >
          Compare colour counts
        </button>
      </div>
      <PreviewDialog
        open={!!kind}
        title={
          kind === "crops"
            ? "Find your composition"
            : kind === "colours"
              ? "Colour and effort"
              : "One photograph, different possibilities"
        }
        onClose={() => setKind(null)}
      >
        <p className="fine-print">
          Actual rendered studies at the current canvas size. Making time
          remains an uncalibrated estimate.{" "}
          {kind === "crops" &&
            "These centred suggestions keep your current pan; inspect faces before choosing."}
        </p>
        {busy && <p role="status">Rendering comparisons…</p>}
        {error && <p role="alert">{error}</p>}
        <div className="study-grid">
          {items.map((item, i) => (
            <article key={i}>
              <div
                className="study-art"
                style={{
                  aspectRatio: `${settings.widthMm}/${settings.heightMm}`,
                }}
              >
                {item.geometry ? (
                  <ArtworkCanvas geometry={item.geometry} />
                ) : (
                  <span>{item.error ?? "Rendering…"}</span>
                )}
              </div>
              <h3>{item.name}</h3>
              <p>
                {item.geometry?.stats.markCount.toLocaleString() ?? "—"} marks ·{" "}
                {item.geometry
                  ? Math.round(
                      item.geometry.stats.estimatedCompletionMinutes / 60,
                    )
                  : "—"}{" "}
                estimated hours
              </p>
              <button
                className="button light"
                disabled={!item.geometry}
                onClick={() => {
                  apply(item.settings, item.crop);
                  setKind(null);
                }}
              >
                Use this study
              </button>
            </article>
          ))}
        </div>
      </PreviewDialog>
    </>
  );
}
