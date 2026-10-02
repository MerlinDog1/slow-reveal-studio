"use client";
import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/export-artwork";

type Trial = {
  id: string;
  date: string;
  mode: string;
  sample: string;
  marker: string;
  canvas: string;
  minutes: number;
  marks: number;
  penChanges: number;
  readability: string;
  coverage: string;
  drying: string;
  comfort: string;
  notes: string;
};
const blank = {
  mode: "Dots",
  sample: "",
  marker: "",
  canvas: "",
  minutes: 0,
  marks: 0,
  penChanges: 0,
  readability: "Not assessed",
  coverage: "Not assessed",
  drying: "Not assessed",
  comfort: "Not assessed",
  notes: "",
};
const storageKey = "sr-physical-trials-v1";
export function TrialRecorder() {
  const [draft, setDraft] = useState(blank),
    [records, setRecords] = useState<Trial[]>([]),
    [notice, setNotice] = useState(""),
    [timer, setTimer] = useState(false),
    [seconds, setSeconds] = useState(0),
    [swatches, setSwatches] = useState(""),
    [palette, setPalette] = useState<string[]>([]);
  const start = useRef(0);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(raw))
        setRecords(
          raw
            .filter(
              (t) =>
                t &&
                typeof t.id === "string" &&
                typeof t.notes === "string" &&
                Number.isFinite(t.minutes),
            )
            .slice(-100),
        );
    } catch {
      setNotice("Saved trials could not be read.");
    }
  }, []);
  useEffect(() => {
    if (!timer) return;
    start.current = performance.now();
    const interval = setInterval(
      () => setSeconds(Math.floor((performance.now() - start.current) / 1000)),
      1000,
    );
    return () => clearInterval(interval);
  }, [timer]);
  function save() {
    if (!draft.sample.trim() || !draft.marker.trim() || !draft.canvas.trim()) {
      setNotice(
        "Add a sample code, marker and canvas so the result can be repeated.",
      );
      return;
    }
    if (
      [draft.minutes, draft.marks, draft.penChanges].some(
        (n) => !Number.isFinite(n) || n < 0,
      )
    ) {
      setNotice("Use non-negative measured values.");
      return;
    }
    const next = [
      ...records,
      { ...draft, id: crypto.randomUUID(), date: new Date().toISOString() },
    ].slice(-100);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setRecords(next);
      setNotice(
        "Trial saved locally. This does not approve a product or enable checkout.",
      );
    } catch {
      setNotice(
        "Could not save locally. Export the current data before leaving.",
      );
    }
  }
  return (
    <>
      <div className="tool-actions">
        <a href="/production-coupons/srs-dot-coupons.pdf">
          Print the existing calibration coupons
        </a>
        <a href="/compatibility/coreldraw-import-studies.zip">
          Download CorelDRAW import studies
        </a>
        <button
          onClick={() => {
            if (timer) {
              setDraft((d) => ({
                ...d,
                minutes: Math.round(seconds / 6) / 10,
              }));
              setTimer(false);
            } else {
              setSeconds(0);
              setTimer(true);
            }
          }}
        >
          {timer
            ? `Stop timer · ${Math.floor(seconds / 60)}m ${seconds % 60}s`
            : "Start making timer"}
        </button>
      </div>
      <form
        className="trial-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          Mode
          <select
            value={draft.mode}
            onChange={(e) => setDraft({ ...draft, mode: e.target.value })}
          >
            {[
              "Dots",
              "Fibonacci Spiral",
              "Mosaic",
              "Line Study",
              "Colour Blend",
              "TV Weave",
              "Experimental engraving",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {(
          [
            ["sample", "Anonymous sample / session code"],
            ["marker", "Marker brand, code and nib"],
            ["canvas", "Canvas and printed-guide specification"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              required
              maxLength={180}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        {(
          [
            ["minutes", "Actual active minutes"],
            ["marks", "Marks completed"],
            ["penChanges", "Pen changes"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={0}
              max={1000000}
              step={key === "minutes" ? 0.1 : 1}
              value={draft[key]}
              onChange={(e) =>
                setDraft({ ...draft, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        {(
          [
            ["readability", "Number readability"],
            ["coverage", "Does the marker cover the guide?"],
            ["drying", "Drying / rub test"],
            ["comfort", "Comfort and enjoyment"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <select
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            >
              {["Not assessed", "Good", "Mixed", "Needs improvement"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
        ))}
        <label className="wide">
          Observations: pressure, bleed, drying time, fatigue, difficult
          features
          <textarea
            value={draft.notes}
            maxLength={3000}
            rows={4}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        <button className="button" type="submit">
          Save measured trial
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
      <details>
        <summary>Record measured pen swatches</summary>
        <p className="fine-print">
          Enter 2–32 distinct six-digit hex values from a measured or
          consistently photographed swatch chart. Record your
          lighting/instrument in the notes. Screen-picked colours alone are not
          calibration.
        </p>
        <label>
          Measured colours
          <textarea
            rows={3}
            value={swatches}
            onChange={(e) => setSwatches(e.target.value)}
            placeholder="#20354f, #bc8c45, …"
          />
        </label>
        <div className="tool-actions">
          <button
            onClick={() => {
              const values = [
                ...new Set(
                  swatches
                    .toLowerCase()
                    .split(/[\s,;]+/)
                    .filter(Boolean),
                ),
              ];
              if (
                values.length < 2 ||
                values.length > 32 ||
                values.some((v) => !/^#[a-f0-9]{6}$/.test(v))
              ) {
                setNotice("Use 2–32 distinct hex colours.");
                return;
              }
              setPalette(values);
              downloadBlob(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        format: "slow-reveal-pen-palette",
                        colours: values,
                        notes: draft.notes,
                        measuredByUser: true,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
                "my-pen-swatches.json",
              );
            }}
          >
            Download pen palette
          </button>
        </div>
        <div className="palette-locks">
          {palette.map((c) => (
            <span key={c} style={{ background: c, width: 24, height: 24 }} />
          ))}
        </div>
      </details>
      <div className="tool-actions">
        <button
          onClick={() =>
            downloadBlob(
              new Blob(
                [
                  JSON.stringify(
                    {
                      format: "slow-reveal-physical-trials",
                      version: 1,
                      records,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
              "physical-trials.json",
            )
          }
        >
          Export trial records
        </button>
      </div>
      <div className="trial-records">
        {records
          .slice()
          .reverse()
          .map((r) => (
            <article key={r.id}>
              <strong>
                {r.sample} · {r.mode}
              </strong>
              <p>
                {r.marks} marks / {r.minutes} measured minutes · {r.penChanges}{" "}
                pen changes
              </p>
              <p>
                {r.marker} · {r.canvas}
              </p>
              <p>{r.notes}</p>
            </article>
          ))}
      </div>
      <p className="fine-print">
        Use anonymous session codes. Nothing here is sent to a server. Physical
        approval, customer photography consent, durability and production
        sign-off are separate decisions.
      </p>
    </>
  );
}
