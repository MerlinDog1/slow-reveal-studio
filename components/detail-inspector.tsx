"use client";
import { useState } from "react";
import { type RenderGeometry } from "@/lib/renderers";
import { ArtworkCanvas } from "./artwork-canvas";
import { PreviewDialog } from "./preview-dialog";

export function DetailInspector({
  geometry: g,
  photo,
}: {
  geometry: RenderGeometry;
  photo: string | null;
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("detail"),
    [x, setX] = useState(50),
    [y, setY] = useState(50),
    [ruler, setRuler] = useState(378);
  const zoom = 5;
  return (
    <>
      <button onClick={() => setOpen(true)}>Detail & true size</button>
      <PreviewDialog
        open={open}
        title="Look a little closer"
        onClose={() => setOpen(false)}
      >
        <div className="tool-actions">
          {["detail", "physical", "room"].map((value) => (
            <button
              key={value}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {value === "detail"
                ? "Linked magnifier"
                : value === "physical"
                  ? "Actual-size view"
                  : "On a wall"}
            </button>
          ))}
        </div>
        {tab === "detail" && (
          <>
            <p>
              Move across the picture to compare the same detail in all three
              views.
            </p>
            <div className="detail-loupes">
              {["original", "finished", "template"].map((view) => (
                <div key={view}>
                  <strong>{view}</strong>
                  <div
                    className="loupe-window physical-scroll"
                    style={{ aspectRatio: `${g.widthMm}/${g.heightMm}` }}
                    onPointerMove={(e) => {
                      if (e.pointerType === "mouse" || e.buttons) {
                        const b = e.currentTarget.getBoundingClientRect();
                        setX(
                          Math.max(
                            0,
                            Math.min(
                              100,
                              ((e.clientX - b.left) / b.width) * 100,
                            ),
                          ),
                        );
                        setY(
                          Math.max(
                            0,
                            Math.min(
                              100,
                              ((e.clientY - b.top) / b.height) * 100,
                            ),
                          ),
                        );
                      }
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        width: `${zoom * 100}%`,
                        height: `${zoom * 100}%`,
                        left: `${-x * (zoom - 1)}%`,
                        top: `${-y * (zoom - 1)}%`,
                      }}
                      key={`${x}:${y}`}
                    >
                      {view === "original" ? (
                        <img src={photo ?? ""} alt="Original photo detail" />
                      ) : (
                        <ArtworkCanvas
                          geometry={g}
                          variant={view as "finished" | "template"}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <label className="range-field">
              Across
              <input
                type="range"
                min={0}
                max={100}
                value={x}
                onChange={(e) => setX(Number(e.target.value))}
              />
            </label>
            <label className="range-field">
              Down
              <input
                type="range"
                min={0}
                max={100}
                value={y}
                onChange={(e) => setY(Number(e.target.value))}
              />
            </label>
          </>
        )}
        {tab === "physical" && (
          <>
            <p>
              Hold a real ruler against this line. Adjust until it measures
              exactly 100 mm. Recalibrate after changing browser zoom or
              screens.
            </p>
            <div className="screen-ruler" style={{ width: ruler }}>
              100 mm
            </div>
            <label className="range-field">
              Ruler calibration
              <input
                type="range"
                min={150}
                max={850}
                value={ruler}
                onChange={(e) => setRuler(Number(e.target.value))}
              />
            </label>
            <div className="physical-scroll physical-paper">
              <div
                style={{
                  position: "relative",
                  width: (g.widthMm * ruler) / 100,
                  height: (g.heightMm * ruler) / 100,
                }}
              >
                <ArtworkCanvas geometry={g} variant="template" />
              </div>
            </div>
            <p className="fine-print">
              Approximate physical size after manual calibration. Verify printed
              dimensions with the sample sheet.
            </p>
          </>
        )}
        {tab === "room" && (
          <>
            <div className="room-mockup">
              <div
                className="room-art"
                style={{
                  width: `${(g.widthMm / 3000) * 100}%`,
                  aspectRatio: `${g.widthMm}/${g.heightMm}`,
                }}
              >
                <ArtworkCanvas geometry={g} />
              </div>
              <div className="room-sofa" />
              <div className="room-floor" />
            </div>
            <p className="fine-print">
              Illustrative 3-metre wall with a 2-metre sofa. Canvas:{" "}
              {g.widthMm / 10} × {g.heightMm / 10} cm. A scale mockup, not a
              manufactured sample.
            </p>
          </>
        )}
      </PreviewDialog>
    </>
  );
}
