"use client";
import { useEffect, useRef, useState } from "react";
import { type RenderGeometry, type RenderMode } from "@/lib/renderers";
import {
  type RestorableProject,
  validateRestorableProject,
} from "@/lib/studio-state";
import {
  saveLocalProject,
  getLocalProject,
  deleteLocalProject,
  type LocalProject,
} from "@/lib/browser-storage";
import { encodeProjectBackup, decodeProjectBackup } from "@/lib/project-backup";
import { downloadBlob } from "@/lib/export-artwork";
import { ComparisonBoard } from "./comparison-board";
import { MakingCompanion } from "./making-companion";
import { DetailInspector } from "./detail-inspector";
import { RevealStudio } from "./reveal-studio";

export function StudioWorkbench({
  geometry,
  photo,
  source,
  identity,
  modes,
  project,
  openProject,
  apply,
}: {
  geometry: RenderGeometry;
  photo: string | null;
  source: string;
  identity: string;
  modes: RenderMode[];
  project: LocalProject;
  openProject: (project: RestorableProject, needsReview: boolean) => void;
  apply: (
    settings: RestorableProject["settings"],
    crop: RestorableProject["crop"],
  ) => void;
}) {
  const [variants, setVariants] = useState<
      { id: string; name: string; thumb: string }[]
    >([]),
    [name, setName] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const key = `sr-variants-${identity}`;
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
      setVariants(
        Array.isArray(raw)
          ? raw
              .filter(
                (v) =>
                  v &&
                  typeof v.id === "string" &&
                  v.id.startsWith(`variant-${identity}-`) &&
                  typeof v.name === "string" &&
                  typeof v.thumb === "string" &&
                  v.thumb.startsWith("data:image/png;base64,"),
              )
              .slice(0, 6)
          : [],
      );
    } catch {
      setVariants([]);
    }
  }, [key, identity]);
  async function task(action: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "The project action failed.");
    } finally {
      setBusy(false);
    }
  }
  const saveVariants = (next: typeof variants) => {
    localStorage.setItem(key, JSON.stringify(next));
    setVariants(next);
  };
  async function keep() {
    if (variants.length >= 6)
      throw new Error(
        "Keep up to six alternatives per photograph. Remove one before adding another.",
      );
    const id = `variant-${identity}-${crypto.randomUUID()}`,
      title = name.trim().slice(0, 60) || `Study ${variants.length + 1}`;
    const { drawArtwork } = await import("@/lib/draw-artwork");
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = Math.round((240 * geometry.heightMm) / geometry.widthMm);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(240 / geometry.widthMm, 240 / geometry.widthMm);
    drawArtwork(ctx, geometry);
    await saveLocalProject({ ...project, id, name: title });
    try {
      saveVariants([
        ...variants,
        { id, name: title, thumb: canvas.toDataURL("image/png") },
      ]);
    } catch (e) {
      await deleteLocalProject(id);
      throw e;
    }
    setName("");
    setNotice("Alternative saved privately on this device.");
  }
  async function open(input: unknown) {
    const { project: valid, needsRendererReview } = validateRestorableProject(
      input,
      modes,
    );
    openProject(valid, needsRendererReview);
  }
  return (
    <section className="studio-workbench" aria-label="Explore and make">
      <div className="section-title">
        <h2>Explore. Compare. Make.</h2>
        <span>Your private workbench</span>
      </div>
      <ComparisonBoard
        source={source}
        settings={geometry.settings}
        crop={project.crop}
        mask={project.subjectMask as RestorableProject["subjectMask"]}
        modes={modes}
        apply={apply}
      />
      <div className="tool-actions">
        <DetailInspector geometry={geometry} photo={photo} />
        <MakingCompanion geometry={geometry} identity={identity} />
        <RevealStudio geometry={geometry} />
      </div>
      <details>
        <summary>Keep alternatives & project backups</summary>
        <p className="fine-print">
          Compare saved thumbnails, then reopen a favourite. Alternatives and
          originals stay on this device. A backup contains your private
          photograph; keep it somewhere safe.
        </p>
        <div className="variant-save">
          <label>
            Study name
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="Warm portrait, softer shadows…"
            />
          </label>
          <button
            className="button light"
            disabled={busy}
            onClick={() => task(keep)}
          >
            Keep this version
          </button>
        </div>
        <div className="variant-grid">
          {variants.map((v) => (
            <article key={v.id}>
              <img src={v.thumb} alt={v.name} />
              <strong>{v.name}</strong>
              <div className="tool-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    task(async () => {
                      const stored = await getLocalProject(v.id);
                      if (!stored)
                        throw new Error(
                          "This alternative is no longer on the device.",
                        );
                      await open(stored);
                    })
                  }
                >
                  Open
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    task(async () => {
                      await deleteLocalProject(v.id);
                      saveVariants(variants.filter((item) => item.id !== v.id));
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
        <div className="tool-actions">
          <button
            disabled={busy}
            onClick={() =>
              task(async () =>
                downloadBlob(
                  await encodeProjectBackup(project),
                  "my-slow-reveal.srproject",
                ),
              )
            }
          >
            Download project backup
          </button>
          <button disabled={busy} onClick={() => input.current?.click()}>
            Import project backup
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".srproject,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (file)
              void task(async () => open(await decodeProjectBackup(file)));
          }}
        />
      </details>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
