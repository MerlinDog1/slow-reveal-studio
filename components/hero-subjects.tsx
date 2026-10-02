"use client";
import { useEffect, useState } from "react";
import {
  type RenderGeometry,
  DEFAULT_SETTINGS,
  PRESETS,
} from "@/lib/renderers";
import { REFERENCE_IMAGES } from "@/lib/reference-images";
import { cropImage, loadImage, DEFAULT_CROP } from "@/lib/image-processing";
import { photoPalette } from "@/lib/photo-palette";
import { RevealPlayer } from "./reveal-studio";

export function HeroSubjects({ subject }: { subject: string }) {
  const [geometry, setGeometry] = useState<RenderGeometry | null>(null),
    [error, setError] = useState("");
  const reference = REFERENCE_IMAGES.find((ref) => ref.id === subject);
  useEffect(() => {
    if (!reference) return;
    let stopped = false;
    let worker: Worker | undefined;
    setGeometry(null);
    setError("");
    void loadImage(reference.src)
      .then((image) => {
        if (stopped) return;
        const { pixels } = cropImage(image, DEFAULT_CROP, 0.8, 1000);
        const palette = photoPalette(pixels, 16);
        worker = new Worker(
          new URL("../workers/render.worker.ts", import.meta.url),
        );
        worker.onmessage = ({ data }) => {
          if (stopped) return;
          setGeometry(data.geometry ?? null);
          setError(data.error ?? "");
          worker?.terminate();
        };
        worker.onerror = () => {
          setError("This study could not load. Try another subject.");
          worker?.terminate();
        };
        worker.postMessage(
          {
            id: 1,
            input: {
              width: pixels.width,
              height: pixels.height,
              data: pixels.data,
            },
            settings: {
              ...DEFAULT_SETTINGS,
              ...PRESETS.detailed,
              mode: "colour-blend",
              widthMm: 600,
              heightMm: 750,
              palette,
              colourCompensation: 0.35,
            },
          },
          [pixels.data.buffer],
        );
      })
      .catch(() => {
        if (!stopped) setError("This photo could not load.");
      });
    return () => {
      stopped = true;
      worker?.terminate();
    };
  }, [reference]);
  return (
    <div className="hero-subject-study">
      {geometry ? (
        <RevealPlayer geometry={geometry} />
      ) : (
        <p role="status">{error || "Finding the picture in the colours…"}</p>
      )}
      <p className="fine-print">
        Digital study · {reference?.credit} ·{" "}
        <a href={reference?.source} target="_blank" rel="noreferrer">
          Photo source
        </a>
        . Physical kit testing pending.
      </p>
    </div>
  );
}
