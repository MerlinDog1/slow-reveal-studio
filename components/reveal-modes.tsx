"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { RenderMode } from "@/lib/renderers/types";

const studies = [
  {
    id: "colour-blend",
    name: "Colour Blend",
    gesture: "One dot, one colour",
    description:
      "Little circles of colour mix into a picture when you step back.",
  },
  {
    id: "tv-weave",
    name: "TV Weave",
    gesture: "A rhythm of tiny dashes",
    description:
      "Rows of short strokes build the image, like a woven colour screen.",
  },
  {
    id: "fibonacci",
    name: "Fibonacci Spiral",
    gesture: "Follow the sunflower pattern",
    description:
      "Colour dots follow sweeping spirals. The picture lives in their colours.",
  },
  {
    id: "cross-stitch",
    name: "Cross Stitch",
    gesture: "Two strokes. A little cross.",
    description:
      "A regular grid keeps its shape, even in blank areas. Fill the numbered crosses.",
  },
] as const;

export function RevealModes({
  availableModes,
}: {
  availableModes: RenderMode[];
}) {
  const [view, setView] = useState<"template" | "finished">("template");
  const visible = studies.filter((study) => availableModes.includes(study.id));
  if (!visible.length) return null;
  return (
    <section className="reveal-section section" id="choose-your-reveal">
      <div className="reveal-heading">
        <div>
          <span className="eyebrow">A little mystery in every mark</span>
          <h2>
            Let the picture
            <br />
            <em>take its time.</em>
          </h2>
        </div>
        <div className="reveal-intro">
          <p>
            Love the moment when it suddenly comes into focus? These styles
            build the image through colour. Start with the guide, then peek at
            what it becomes.
          </p>
          <div
            className="reveal-toggle"
            role="group"
            aria-label="View reveal studies"
          >
            <button
              type="button"
              aria-pressed={view === "template"}
              onClick={() => setView("template")}
            >
              The guide
            </button>
            <button
              type="button"
              aria-pressed={view === "finished"}
              onClick={() => setView("finished")}
            >
              The finished picture
            </button>
          </div>
        </div>
      </div>
      <div className="reveal-grid">
        {visible.map((study, index) => (
          <article className="reveal-card" key={study.id}>
            <Link
              href={`/lab/${study.id}`}
              className="reveal-art"
              aria-label={`Explore ${study.name}`}
            >
              <img
                src={`/marketing/reveal/${study.id}-${view}.webp`}
                width={640}
                height={800}
                loading="lazy"
                alt={`${study.name}: ${view === "template" ? "numbered guide" : "finished digital portrait"}, rendered from the same photograph and geometry`}
              />
              <span className="reveal-art-label">
                {study.id === "cross-stitch"
                  ? "New study"
                  : `Study 0${index + 1}`}
              </span>
              <span className="reveal-art-arrow">
                <ArrowUpRight size={19} />
              </span>
            </Link>
            <span className="reveal-gesture">{study.gesture}</span>
            <h3>
              <Link href={`/lab/${study.id}`}>{study.name}</Link>
            </h3>
            <p>{study.description}</p>
          </article>
        ))}
      </div>
      <div className="reveal-footnote">
        <p>
          Same photograph, four digital studies. Number patterns can still give
          clues; try your photo in the lab. Physical results need testing.
        </p>
        <Link className="text-link" href="/create">
          Find your favourite <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}
