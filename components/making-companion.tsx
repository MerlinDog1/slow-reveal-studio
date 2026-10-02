"use client";
import { useEffect, useMemo, useState } from "react";
import { type RenderGeometry } from "@/lib/renderers";
import { makingPlan } from "@/lib/making-plan";
import { sampleSheetSvg } from "@/lib/sample-sheet";
import { downloadBlob } from "@/lib/export-artwork";
import { ArtworkCanvas } from "./artwork-canvas";
import { PreviewViewport } from "./preview-viewport";
import { PreviewDialog } from "./preview-dialog";

export function MakingCompanion({
  geometry: g,
  identity,
}: {
  geometry: RenderGeometry;
  identity: string;
}) {
  const [open, setOpen] = useState(false),
    [colour, setColour] = useState(""),
    [region, setRegion] = useState(-1),
    [done, setDone] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  const plan = useMemo(() => makingPlan(g), [g]);
  const key = useMemo(() => {
    const text = JSON.stringify(g.settings);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++)
      hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return `sr-making-${identity}-${g.version}-${hash >>> 0}`;
  }, [identity, g.settings, g.version]);
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "[]");
      setDone(
        Array.isArray(value)
          ? value.filter((v) => typeof v === "string" && /^\d-\d$/.test(v))
          : [],
      );
    } catch {
      setDone([]);
    }
    setRegion(-1);
    setColour("");
  }, [key]);
  function toggle(id: string) {
    const next = done.includes(id)
      ? done.filter((v) => v !== id)
      : [...done, id];
    setDone(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setNotice("Progress could not be saved on this device.");
    }
  }
  const selected = plan.regions[region];
  const completedMarks = plan.regions
    .filter((r) => done.includes(r.id))
    .reduce((sum, r) => sum + r.marks, 0);
  const totalMarks = plan.regions.reduce((sum, r) => sum + r.marks, 0);
  const exportSample = () => {
    try {
      downloadBlob(
        new Blob(
          [
            sampleSheetSvg(
              g,
              selected
                ? {
                    x: selected.x + selected.width / 2,
                    y: selected.y + selected.height / 2,
                  }
                : undefined,
            ),
          ],
          { type: "image/svg+xml" },
        ),
        `slow-reveal-${g.mode}-actual-size-sample.svg`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Sample export failed.");
    }
  };
  return (
    <>
      <button onClick={() => setOpen(true)}>Making companion</button>
      <PreviewDialog
        open={open}
        title="A little at a time"
        onClose={() => setOpen(false)}
      >
        <p>
          Choose a colour, inspect its marks and work through a small section.
          Tick sections as you finish; progress stays on this device.
        </p>
        <div className="making-layout">
          <div>
            <PreviewViewport
              aspectRatio={g.widthMm / g.heightMm}
              caption="Numbers appear as you zoom in"
              enabled
              resetKey={key}
            >
              <div
                className="canvas-paper"
                style={{ aspectRatio: `${g.widthMm}/${g.heightMm}` }}
              >
                <ArtworkCanvas
                  geometry={g}
                  variant={colour ? "finished" : "template"}
                  colour={colour || undefined}
                />
                {selected && (
                  <div
                    className="making-region"
                    style={{
                      left: `${(selected.x / g.widthMm) * 100}%`,
                      top: `${(selected.y / g.heightMm) * 100}%`,
                      width: `${(selected.width / g.widthMm) * 100}%`,
                      height: `${(selected.height / g.heightMm) * 100}%`,
                    }}
                  />
                )}
              </div>
            </PreviewViewport>
          </div>
          <div>
            <label className="select-field">
              Pen to follow
              <select
                value={colour}
                onChange={(e) => setColour(e.target.value)}
              >
                <option value="">All numbered guides</option>
                {(g.settings.palette ?? [g.settings.inkColor]).map((c, i) => (
                  <option key={i} value={c}>
                    Pen {i + 1} · {c}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {completedMarks.toLocaleString()} / {totalMarks.toLocaleString()}{" "}
              marks in completed sections
            </p>
            <progress max={Math.max(1, totalMarks)} value={completedMarks} />
            <div className="region-grid">
              {plan.regions.map((r, i) => (
                <button
                  key={r.id}
                  aria-pressed={i === region}
                  onClick={() => setRegion(i)}
                >
                  {r.id}
                  {done.includes(r.id) ? " ✓" : ""}
                  <small>{r.marks.toLocaleString()} marks</small>
                </button>
              ))}
            </div>
            {selected && (
              <>
                <p>
                  Section {selected.id}: {selected.marks.toLocaleString()}{" "}
                  marks, {selected.colours.length} colours. Follow one colour at
                  a time, with a break between sections.
                </p>
                <button
                  className="button light"
                  onClick={() => toggle(selected.id)}
                >
                  {done.includes(selected.id)
                    ? "Mark section unfinished"
                    : "Section finished"}
                </button>
              </>
            )}
            {plan.smallLabels > 0 && (
              <p className="inline-warning">
                {plan.smallLabels.toLocaleString()} labels are below a
                provisional 1.2 mm letter-height check. Smallest:{" "}
                {plan.smallestLabelMm?.toFixed(2)} mm. Try a larger canvas,
                coarser detail, or an enlarged reference. Test a printed sample.
              </p>
            )}
            <div className="tool-actions">
              <button onClick={exportSample}>
                Download actual-size sample & practice strip
              </button>
              <a href="/trials" target="_blank" rel="noreferrer">
                Record a physical trial
              </a>
            </div>
            <p className="fine-print">
              Section counts are exact. Completion times, comfortable label size
              and pen coverage still need real making trials.
            </p>
            {notice && <p role="status">{notice}</p>}
          </div>
        </div>
      </PreviewDialog>
    </>
  );
}
