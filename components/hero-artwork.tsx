"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Maximize2, Pause, Play, RotateCcw } from "lucide-react";
import { revealedCount, type HeroRevealData } from "@/lib/hero-reveal";
import { PreviewDialog } from "@/components/preview-dialog";
import { PreviewViewport } from "@/components/preview-viewport";
import study from "@/public/hero/manifest.json";

type View = "making" | "original" | "guide";

export function HeroArtwork() {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const nib = useRef<HTMLSpanElement>(null);
  const elapsed = useRef(0);
  const current = useRef(0);
  const drawn = useRef(0);
  const [data, setData] = useState<HeroRevealData>();
  const [motion, setMotion] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [view, setView] = useState<View>("making");
  const [cycle, setCycle] = useState(0);
  const [count, setCount] = useState(study.markCount);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/hero/macaw-dots.json?v=${study.files["macaw-dots.json"].sha256}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Hero unavailable");
        return response.json();
      })
      .then(setData)
      .catch(() => {
        /* The completed poster remains available if animation cannot load. */
      });
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setMotion(!preference.matches);
    const updateVisibility = () => setTabVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    preference.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.08 },
    );
    if (frame.current) observer.observe(frame.current);
    return () => {
      controller.abort();
      observer.disconnect();
      preference.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  const paint = useCallback(
    (to: number, reset = false) => {
      const element = canvas.current;
      const ctx = element?.getContext("2d");
      if (!data || !element || !ctx) return;
      ctx.setTransform(
        element.width / data.width,
        0,
        0,
        element.height / data.height,
        0,
        0,
      );
      if (reset) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, data.width, data.height);
        ctx.strokeStyle = "#dee0d5";
        ctx.lineWidth = 0.12;
        ctx.beginPath();
        for (const [x, y, radius] of data.dots) {
          ctx.moveTo(x + radius, y);
          ctx.arc(x, y, radius, 0, Math.PI * 2);
        }
        ctx.stroke();
        drawn.current = 0;
      }
      for (let i = drawn.current; i < to; i++) {
        const [x, y, radius, colour] = data.dots[i];
        ctx.fillStyle = data.palette[colour];
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      drawn.current = to;
      const last = data.dots[to - 1];
      if (last && nib.current) {
        nib.current.style.left = `${(last[0] / data.width) * 100}%`;
        nib.current.style.top = `${(last[1] / data.height) * 100}%`;
        nib.current.style.color = data.palette[last[3]];
      }
    },
    [data],
  );

  useEffect(() => {
    if (!data || motion === null) return;
    elapsed.current = 0;
    current.current = motion ? 0 : data.dots.length;
    setCount(current.current);
    setPlaying(motion);
    paint(current.current, true);
  }, [data, motion, cycle, paint]);

  useEffect(() => {
    const element = canvas.current;
    if (!data || !element) return;
    const resize = () => {
      const width = element.clientWidth;
      if (!width) return;
      const scale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
      element.width = Math.round(width * scale);
      element.height = Math.round(((width * data.height) / data.width) * scale);
      paint(current.current, true);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [data, paint]);

  useEffect(() => {
    if (
      !data ||
      !motion ||
      !playing ||
      !inView ||
      !tabVisible ||
      expanded ||
      view !== "making"
    )
      return;
    let raf = 0,
      previous = 0,
      lastUpdate = 0;
    const tick = (now: number) => {
      if (previous) elapsed.current += Math.min(now - previous, 80);
      previous = now;
      current.current = revealedCount(elapsed.current, data.dots.length);
      paint(current.current);
      if (now - lastUpdate > 100 || current.current === data.dots.length) {
        setCount(current.current);
        lastUpdate = now;
      }
      if (current.current < data.dots.length) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data, motion, playing, inView, tabVisible, view, expanded, paint]);

  const complete = count === study.markCount;
  const animated = Boolean(data && motion);
  const activeColour = data?.dots[Math.max(0, count - 1)]?.[3];
  const replay = () => {
    setView("making");
    setCycle((value) => value + 1);
  };

  return (
    <div
      className="colour-hero-art"
      aria-label="Colour Blend animated artwork study"
    >
      <div className="colour-hero-heading">
        <span>
          <i /> THE COLOUR STUDY
        </span>
        <span>NO. 001 — SCARLET MACAW</span>
      </div>
      <div className="colour-hero-stage">
        <div className="colour-hero-halo" aria-hidden="true" />
        <div className="colour-hero-paper" ref={frame}>
          <img
            src={
              view === "original"
                ? "/hero/macaw-source.webp"
                : view === "guide"
                  ? "/hero/macaw-template.webp"
                  : "/hero/macaw-finished.webp"
            }
            width={960}
            height={1200}
            fetchPriority="high"
            alt={
              view === "original"
                ? "AI-created scarlet macaw portrait with red, gold and blue feathers"
                : view === "guide"
                  ? "Numbered Colour Blend guide for the macaw"
                  : `Scarlet macaw made from ${study.markCount.toLocaleString("en-GB")} staggered coloured dots`
            }
          />
          <canvas
            ref={canvas}
            aria-hidden="true"
            className={
              animated && !complete && view === "making" ? "is-visible" : ""
            }
          />
          <span
            ref={nib}
            className="colour-hero-nib"
            hidden={!animated || !playing || complete || view !== "making"}
            aria-hidden="true"
          />
          <button
            className="colour-hero-enlarge"
            aria-label="Inspect artwork detail"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 size={16} />
            <span>See the detail</span>
          </button>
        </div>
        <button
          className="colour-hero-source"
          onClick={() => setView(view === "original" ? "making" : "original")}
          aria-pressed={view === "original"}
          aria-label="Compare original image"
        >
          <img src="/hero/macaw-source.webp" width={960} height={1200} alt="" />
          <span>
            It starts with a photo.
            <ArrowUpRight size={13} />
          </span>
        </button>
        <div className="colour-hero-note" aria-hidden="true">
          A little colour.
          <br />
          <em>A little at a time.</em>
        </div>
        <span className="colour-hero-side" aria-hidden="true">
          SMALL MARKS. SOMETHING EXTRAORDINARY.
        </span>
      </div>
      <div className="colour-hero-console">
        <div className="colour-hero-status">
          <span>
            {view === "original"
              ? "The inspiration"
              : view === "guide"
                ? "Your guide to every dot"
                : complete
                  ? "Every little dot, a picture."
                  : playing
                    ? "A picture is taking shape…"
                    : "Take your time."}
          </span>
          <span
            className="colour-hero-count"
            aria-label={`${count} of ${study.markCount} dots filled`}
          >
            <strong>{count.toLocaleString("en-GB")}</strong> /{" "}
            {study.markCount.toLocaleString("en-GB")} dots
          </span>
        </div>
        <div className="colour-hero-track" aria-hidden="true">
          <span style={{ width: `${(count / study.markCount) * 100}%` }} />
        </div>
        <div className="colour-hero-controls">
          <div className="colour-hero-views" aria-label="Artwork views">
            {(
              [
                ["making", "Artwork"],
                ["original", "Photo"],
                ["guide", "Guide"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                aria-pressed={view === key}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="colour-hero-playback">
            <button
              disabled={!animated}
              onClick={
                complete
                  ? replay
                  : () => {
                      setView("making");
                      setPlaying(view === "making" ? !playing : true);
                    }
              }
              aria-label={
                complete
                  ? "Play dot animation again"
                  : playing && view === "making"
                    ? "Pause dot animation"
                    : "Resume dot animation"
              }
            >
              {playing && !complete && view === "making" ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}
              <span>
                {complete
                  ? "Play"
                  : playing && view === "making"
                    ? "Pause"
                    : "Play"}
              </span>
            </button>
            <button
              disabled={!animated}
              onClick={replay}
              aria-label="Replay dot animation"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>
      <div className="colour-hero-footer">
        <span
          className="colour-hero-swatches"
          aria-label="Sixteen marker colours"
        >
          {study.palette.map((colour, i) => (
            <i
              key={colour}
              style={{ background: colour }}
              className={!complete && activeColour === i ? "is-current" : ""}
            />
          ))}
        </span>
        <span>Colour Blend · 16 colours</span>
      </div>
      <p className="colour-hero-disclosure">
        AI-created source · digital making study
      </p>
      <PreviewDialog
        open={expanded}
        onClose={() => setExpanded(false)}
        title="Every feather. Every little dot."
      >
        <PreviewViewport
          aspectRatio={0.8}
          enabled
          resetKey="macaw-detail"
          caption={`${study.markCount.toLocaleString("en-GB")} dots · 16 source-matched colours`}
        >
          <img
            className="colour-hero-detail-image"
            src={`/hero/macaw-finished.svg?v=${study.files["macaw-finished.svg"].sha256}`}
            alt="Detailed Colour Blend macaw artwork; zoom to inspect individual dots"
            width={1600}
            height={2000}
          />
        </PreviewViewport>
      </PreviewDialog>
    </div>
  );
}
