"use client";
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, PRESETS, renderImage, toSvg } from "@/lib/renderers";
import { loadImage, cropImage, DEFAULT_CROP } from "@/lib/image-processing";
export function HeroArtwork() {
  const [svg, setSvg] = useState("");
  const [view, setView] = useState<"finished" | "template">("finished");
  useEffect(() => {
    let disposed = false;
    loadImage("/references/black-dog.jpg").then((image) => {
      const { pixels } = cropImage(
        image,
        { ...DEFAULT_CROP, zoom: 1.1 },
        0.8,
        800,
      );
      const geometry = renderImage(
        { data: pixels.data, width: pixels.width, height: pixels.height },
        {
          ...DEFAULT_SETTINGS,
          ...PRESETS.portrait,
          widthMm: 400,
          heightMm: 500,
          brightness: 0.08,
          mode: "dots",
        },
      );
      if (!disposed) setSvg(toSvg(geometry, view));
    });
    return () => {
      disposed = true;
    };
  }, [view]);
  return (
    <div className="hero-artwork">
      <div className="hero-canvas">
        <div
          className="hero-canvas-inner"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <div className="original-photo">
        <img
          src="/references/black-dog.jpg"
          alt="Original photograph of a black Labrador"
        />
        <span>It started with this.</span>
      </div>
      <div className="hero-preview-toggle">
        <button
          className={view === "finished" ? "active" : ""}
          aria-pressed={view === "finished"}
          onClick={() => setView("finished")}
        >
          Finished canvas
        </button>
        <button
          className={view === "template" ? "active" : ""}
          aria-pressed={view === "template"}
          onClick={() => setView("template")}
        >
          Printed template
        </button>
      </div>
      <span className="hero-side-note">YOUR PHOTO. EVERY LITTLE DOT.</span>
      <div className="hero-art-caption">
        <span>01 / Signature Dots</span>
        <span>A digital rendering study</span>
      </div>
    </div>
  );
}
