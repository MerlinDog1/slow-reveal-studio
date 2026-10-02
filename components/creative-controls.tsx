"use client";
import { useRef, useState } from "react";
import {
  type RenderSettings,
  usesOpticalColour,
  supportsPalette,
} from "@/lib/renderers";
import { loadImage } from "@/lib/image-processing";
import { photoPalette, PHOTO_STARTS } from "@/lib/photo-palette";

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <output>{Math.round(value * 100) / 100}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function CreativeControls({
  settings: s,
  update,
  photo,
}: {
  settings: RenderSettings;
  update: (patch: Partial<RenderSettings>) => void;
  photo: string | null;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [locks, setLocks] = useState<string[]>([]);
  const paletteInput = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(16);
  async function optimise() {
    if (!photo) return;
    setBusy(true);
    setMessage("");
    try {
      const image = await loadImage(photo),
        canvas = document.createElement("canvas");
      const scale = 160 / Math.max(image.naturalWidth, image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const palette = photoPalette(
        ctx.getImageData(0, 0, canvas.width, canvas.height),
        count,
        locks.filter((c) => s.palette?.includes(c)),
      );
      update({ palette, invert: false });
      setMessage(
        `${palette.length} colours chosen from this crop. Match them to real pens before making a kit.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not choose colours.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="creative-controls">
      <details className="tuning">
        <summary>Colour & composition</summary>
        <label className="select-field">
          Starting point
          <select
            defaultValue=""
            onChange={(e) => {
              const value =
                PHOTO_STARTS[e.target.value as keyof typeof PHOTO_STARTS];
              if (value) update(value);
            }}
          >
            <option value="" disabled>
              Choose for your photograph
            </option>
            {Object.keys(PHOTO_STARTS).map((key) => (
              <option key={key} value={key}>
                {key[0].toUpperCase() + key.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          Composition
          <select
            value={s.compositionShape ?? "rectangle"}
            onChange={(e) =>
              update({
                compositionShape: e.target
                  .value as RenderSettings["compositionShape"],
              })
            }
          >
            <option value="rectangle">Full canvas</option>
            <option value="circle">Circle</option>
            <option value="oval">Oval</option>
          </select>
        </label>
        <Slider
          label="Open shadow detail"
          value={s.shadowLift ?? 0}
          onChange={(shadowLift) => update({ shadowLift })}
        />
        {supportsPalette(s.mode) && (
          <>
            <label className="select-field">
              Colours from your photo
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {(s.mode === "mosaic" ? [2, 4, 8, 16, 32] : [2, 8, 16]).map(
                  (n) => (
                    <option key={n} value={n}>
                      {n} colours
                    </option>
                  ),
                )}
              </select>
            </label>
            <button
              className="button light full"
              disabled={!photo || busy}
              onClick={optimise}
            >
              {busy ? "Choosing colours…" : "Find my photo’s palette"}
            </button>
            {!!s.palette?.length && (
              <>
                <p className="fine-print">
                  Lock any favourite colours before choosing a new palette.
                </p>
                <div className="palette-locks">
                  {s.palette.map((colour, i) => (
                    <button
                      key={`${i}-${colour}`}
                      aria-label={`Lock colour ${i + 1}`}
                      aria-pressed={locks.includes(colour)}
                      style={{ borderColor: colour }}
                      onClick={() =>
                        setLocks((old) =>
                          old.includes(colour)
                            ? old.filter((c) => c !== colour)
                            : [...old, colour],
                        )
                      }
                    >
                      <i style={{ background: colour }} />
                      {i + 1}
                      {locks.includes(colour) ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="tool-actions">
              <button onClick={() => paletteInput.current?.click()}>
                Import pen swatches
              </button>
            </div>
            <input
              ref={paletteInput}
              hidden
              type="file"
              accept=".json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                try {
                  if (file.size > 16000)
                    throw new Error("Palette file is too large.");
                  const value = JSON.parse(await file.text());
                  const colours = value.colours;
                  if (
                    value.format !== "slow-reveal-pen-palette" ||
                    !Array.isArray(colours) ||
                    colours.length < 2 ||
                    colours.length > (s.mode === "mosaic" ? 32 : 16) ||
                    colours.some(
                      (c) =>
                        typeof c !== "string" || !/^#[a-f0-9]{6}$/i.test(c),
                    ) ||
                    new Set(colours.map((c) => c.toLowerCase())).size !==
                      colours.length
                  )
                    throw new Error(
                      "Use a distinct 2–16 colour palette (up to 32 for Mosaic).",
                    );
                  update({ palette: colours, invert: false });
                  setMessage(
                    "Your pen swatches are applied. Verify the resulting proof.",
                  );
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Could not import palette.",
                  );
                }
              }}
            />
            <div className="tool-actions">
              <button
                onClick={() =>
                  update({ palette: ["#182d45", "#c89c50"], invert: false })
                }
              >
                Navy & ochre
              </button>
              <button
                onClick={() =>
                  update({ palette: ["#53365c", "#d07a69"], invert: false })
                }
              >
                Plum & coral
              </button>
            </div>
            {usesOpticalColour(s) && (
              <Slider
                label="Compensate white gaps"
                value={s.colourCompensation ?? 0}
                onChange={(colourCompensation) =>
                  update({ colourCompensation })
                }
              />
            )}
            <p className="fine-print">
              Colour compensation estimates spatial mixing on white paper. It is
              not a calibrated ink simulation.
            </p>
          </>
        )}
        {message && (
          <p role="status" className="fine-print">
            {message}
          </p>
        )}
        {(s.mode === "fibonacci" ||
          (s.mode === "line-amplification" && s.linePattern === "spiral")) && (
          <>
            <p className="field-heading">Place the spiral centre</p>
            <div
              className="focal-picker"
              style={photo ? { backgroundImage: `url(${photo})` } : undefined}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const b = e.currentTarget.getBoundingClientRect();
                update({
                  spiralX: Math.max(
                    0,
                    Math.min(1, (e.clientX - b.left) / b.width),
                  ),
                  spiralY: Math.max(
                    0,
                    Math.min(1, (e.clientY - b.top) / b.height),
                  ),
                });
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const b = e.currentTarget.getBoundingClientRect();
                update({
                  spiralX: Math.max(
                    0,
                    Math.min(1, (e.clientX - b.left) / b.width),
                  ),
                  spiralY: Math.max(
                    0,
                    Math.min(1, (e.clientY - b.top) / b.height),
                  ),
                });
              }}
            >
              <span
                style={{
                  left: `${(s.spiralX ?? 0.5) * 100}%`,
                  top: `${(s.spiralY ?? 0.5) * 100}%`,
                }}
              >
                ＋
              </span>
            </div>
            <Slider
              label="Spiral centre across"
              value={s.spiralX ?? 0.5}
              onChange={(spiralX) => update({ spiralX })}
            />
            <Slider
              label="Spiral centre down"
              value={s.spiralY ?? 0.5}
              onChange={(spiralY) => update({ spiralY })}
            />
            <Slider
              label="Spiral rotation"
              value={s.spiralRotation ?? 0}
              max={360}
              step={1}
              onChange={(spiralRotation) => update({ spiralRotation })}
            />
            <button
              className="text-button"
              onClick={() =>
                update({ spiralX: 0.5, spiralY: 0.5, spiralRotation: 0 })
              }
            >
              Centre the spiral
            </button>
          </>
        )}
        {s.mode === "line-amplification" && (
          <>
            <label className="select-field">
              Line pattern
              <select
                value={s.linePattern ?? "horizontal"}
                onChange={(e) =>
                  update({
                    linePattern: e.target
                      .value as RenderSettings["linePattern"],
                  })
                }
              >
                <option value="horizontal">Horizontal study</option>
                <option value="spiral">Continuous spiral study</option>
                <option value="flow">Flowing engraving</option>
                <option value="crosshatch">Crosshatch engraving</option>
              </select>
            </label>
            <p className="fine-print">
              Experimental ribbons: highlights interrupt the ink; crosshatch
              layers intersect. Physical tracing and guide legibility need
              trials.
            </p>
          </>
        )}
      </details>
      <details className="tuning">
        <summary>Protect a focal area</summary>
        <p className="fine-print">
          Place this soft area over eyes, a face or another important detail.
          Adjustments use the original photograph.
        </p>
        <Slider
          label="Focal area across"
          value={s.focusX ?? 0.5}
          onChange={(focusX) => update({ focusX })}
        />
        <Slider
          label="Focal area down"
          value={s.focusY ?? 0.5}
          onChange={(focusY) => update({ focusY })}
        />
        <Slider
          label="Focal area size"
          value={s.focusRadius ?? 0.22}
          min={0.05}
          onChange={(focusRadius) => update({ focusRadius })}
        />
        <Slider
          label="Focal brightness"
          value={s.focusBrightness ?? 0}
          min={-0.5}
          max={0.5}
          onChange={(focusBrightness) => update({ focusBrightness })}
        />
        <Slider
          label="Protect focal detail"
          value={s.focusDetail ?? 0}
          onChange={(focusDetail) => update({ focusDetail })}
        />
        {!!s.palette?.length && supportsPalette(s.mode) && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={s.selectiveColour ?? false}
              onChange={(e) => update({ selectiveColour: e.target.checked })}
            />
            Keep colour around this area only
          </label>
        )}
        <button
          className="text-button"
          onClick={() =>
            update({
              focusBrightness: 0,
              focusDetail: 0,
              selectiveColour: false,
            })
          }
        >
          Reset focal adjustments
        </button>
      </details>
    </div>
  );
}
