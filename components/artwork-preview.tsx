"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { PreviewDisplayContext } from "./preview-viewport";
import {
  downsamplePreview,
  previewRasterPlan,
  previewSvgAtSize,
} from "@/lib/preview-sampling";

/** Finished Fit views integrate subpixel marks; zoomed inspection and templates stay vector. */
export function ArtworkPreview({
  svg,
  finished,
}: {
  svg: string;
  finished: boolean;
}) {
  const display = useContext(PreviewDisplayContext);
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [pixelRatio, setPixelRatio] = useState(1);
  const [ready, setReady] = useState<object | null>(null);
  const plan = useMemo(
    () =>
      finished
        ? previewRasterPlan(size.width, size.height, pixelRatio, display.zoom)
        : null,
    [finished, size.width, size.height, display.zoom, pixelRatio],
  );
  const frame = useMemo(() => ({ svg, plan }), [svg, plan]);
  const rasterReady = !!plan && ready === frame;

  useEffect(() => {
    if (!wrapper.current) return;
    // Measure the artwork content, excluding its parent's paper border. Rescaling a
    // Fit raster by those two border pixels would introduce another aliasing pass.
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setPixelRatio(window.devicePixelRatio || 1);
    update();
    window.addEventListener("resize", update);
    const resolution = window.matchMedia(`(resolution: ${pixelRatio}dppx)`);
    resolution.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      resolution.removeEventListener("change", update);
    };
  }, [pixelRatio]);

  useEffect(() => {
    if (!plan || !svg) return;
    let cancelled = false;
    let url: string | undefined;
    let image: HTMLImageElement | undefined;
    let source: HTMLCanvasElement | undefined;
    // Wait for rapid slider/resize changes to settle before allocating a sample surface.
    const timeout = window.setTimeout(async () => {
      try {
        image = new Image();
        image.decoding = "async";
        url = URL.createObjectURL(
          new Blob(
            [previewSvgAtSize(svg, plan.sampleWidth, plan.sampleHeight)],
            { type: "image/svg+xml" },
          ),
        );
        image.src = url;
        await image.decode();
        if (cancelled || !canvas.current) return;
        source = document.createElement("canvas");
        source.width = plan.sampleWidth;
        source.height = plan.sampleHeight;
        const context = source.getContext("2d", { willReadFrequently: true });
        const target = canvas.current.getContext("2d");
        if (!context || !target) return;
        context.drawImage(image, 0, 0, source.width, source.height);
        const sampled = context.getImageData(0, 0, source.width, source.height);
        const averaged = downsamplePreview(
          sampled.data,
          plan.width,
          plan.height,
          plan.samples,
        );
        if (cancelled) return;
        canvas.current.width = plan.width;
        canvas.current.height = plan.height;
        target.putImageData(
          new ImageData(averaged, plan.width, plan.height),
          0,
          0,
        );
        setReady(frame);
      } catch {
        // A browser without SVG canvas support retains the exact vector preview.
      } finally {
        if (image) image.src = "";
        if (url) URL.revokeObjectURL(url);
        if (source) source.width = source.height = 0;
      }
    }, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (image) image.src = "";
      if (url) URL.revokeObjectURL(url);
      if (source) source.width = source.height = 0;
    };
  }, [svg, plan, frame]);

  return (
    <div
      ref={wrapper}
      className="rendered-svg"
      data-preview-sampling={rasterReady ? `${plan.samples}x-area` : "vector"}
      style={{ position: "relative" }}
    >
      <div
        style={{ width: "100%", height: "100%", opacity: rasterReady ? 0 : 1 }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <canvas
        ref={canvas}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: rasterReady ? "block" : "none",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
