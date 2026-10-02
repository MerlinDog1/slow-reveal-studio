"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import { drawArtwork, type DrawingOptions } from "@/lib/draw-artwork";
import type { RenderGeometry } from "@/lib/renderers";
import { downsamplePreview, previewRasterPlan } from "@/lib/preview-sampling";

export const PreviewCameraContext = createContext("");
export function ArtworkCanvas({
  geometry,
  variant = "finished",
  colour,
  progress,
  safeArea,
}: { geometry: RenderGeometry } & DrawingOptions) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const camera = useContext(PreviewCameraContext);
  useEffect(() => {
    const element = host.current,
      target = canvas.current;
    if (!element || !target) return;
    const draw = () => {
      const paper = element.getBoundingClientRect();
      const viewport =
        element
          .closest(".preview-viewport, .physical-scroll")
          ?.getBoundingClientRect() ?? paper;
      const left = Math.max(0, viewport.left - paper.left),
        top = Math.max(0, viewport.top - paper.top);
      const width = Math.min(
          paper.width - left,
          viewport.right - paper.left - left,
        ),
        height = Math.min(
          paper.height - top,
          viewport.bottom - paper.top - top,
        );
      if (width <= 0 || height <= 0 || !paper.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const plan =
        variant === "finished"
          ? previewRasterPlan(
              width,
              height,
              dpr,
              Number(camera.split(":")[0]) || 1,
            )
          : null;
      target.width = plan?.width ?? Math.max(1, Math.ceil(width * dpr));
      target.height = plan?.height ?? Math.max(1, Math.ceil(height * dpr));
      Object.assign(target.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
      const sampled = plan ? document.createElement("canvas") : target;
      if (plan) {
        sampled.width = plan.sampleWidth;
        sampled.height = plan.sampleHeight;
      }
      const ctx = sampled.getContext("2d", { willReadFrequently: !!plan })!;
      const scale = paper.width / geometry.widthMm;
      const ratioX = sampled.width / width,
        ratioY = sampled.height / height;
      ctx.setTransform(
        scale * ratioX,
        0,
        0,
        scale * ratioY,
        -left * ratioX,
        -top * ratioY,
      );
      drawArtwork(ctx, geometry, {
        variant,
        colour,
        progress,
        safeArea,
        pixelsPerMm: scale,
        bounds: {
          x: left / scale,
          y: top / scale,
          width: width / scale,
          height: height / scale,
        },
      });
      if (plan) {
        const pixels = ctx.getImageData(0, 0, sampled.width, sampled.height);
        const averaged = downsamplePreview(
          pixels.data,
          plan.width,
          plan.height,
          plan.samples,
        );
        target
          .getContext("2d")!
          .putImageData(new ImageData(averaged, plan.width, plan.height), 0, 0);
        sampled.width = sampled.height = 0;
      }
      element.dataset.previewSampling = plan
        ? `${plan.samples}x-area`
        : "geometry";
    };
    let frame = requestAnimationFrame(draw);
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
    };
  }, [geometry, variant, colour, progress, safeArea, camera]);
  return (
    <div
      ref={host}
      className="artwork-canvas"
      role="img"
      aria-label={`${variant} artwork, ${geometry.stats.markCount.toLocaleString()} marks`}
    >
      <canvas ref={canvas} aria-hidden="true" />
    </div>
  );
}
