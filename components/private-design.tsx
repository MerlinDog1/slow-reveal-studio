"use client";
import { useEffect, useState } from "react";
import { saveLocalProject } from "@/lib/browser-storage";
import { type RenderSettings } from "@/lib/renderers";
import { type Crop } from "@/lib/image-processing";
type Design = {
  id: string;
  settings: RenderSettings;
  crop: Crop;
  productId: string;
  finishId: string;
  inkId: string;
  sourceUrl: string;
  expiresAt: string;
};
export function PrivateDesign({ id }: { id: string }) {
  const [token, setToken] = useState("");
  const [design, setDesign] = useState<Design | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [variant, setVariant] = useState("finished");
  useEffect(() => {
    const found =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(found);
    if (!found) {
      setError(
        "This private design needs the full link you received when saving it.",
      );
      setLoading(false);
      return;
    }
    fetch(`/api/designs/${id}`, {
      headers: { Authorization: `Bearer ${found}` },
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Design not found.");
        setDesign(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    if (!design || !token) return;
    let url: string | null = null;
    const controller = new AbortController();
    setPreview(null);
    fetch(`/api/designs/${id}/preview?view=${variant}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Preview unavailable.");
        const blob = await r.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, design, token, variant]);
  async function edit() {
    if (!design) return;
    setLoading(true);
    try {
      const r = await fetch(design.sourceUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("The source photo could not be opened.");
      await saveLocalProject({
        id: "current",
        name: "Your saved photograph",
        image: await r.blob(),
        settings: design.settings,
        crop: design.crop,
        productId: design.productId,
        finishId: design.finishId,
        updatedAt: new Date().toISOString(),
      });
      window.location.assign("/create?restore=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open design.");
      setLoading(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        "Delete this saved design and its private photo? Paid order records, if any, are handled separately.",
      )
    )
      return;
    try {
      const r = await fetch(`/api/designs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await r.json();
      if (!r.ok) {
        setError(result.error ?? "Delete failed.");
        return;
      }
      setDesign(null);
      setMessage("Your private design and its source have been deleted.");
    } catch {
      setError(
        "The design could not be deleted. Check your connection and try again.",
      );
    }
  }
  return (
    <>
      {loading && <p role="status">Opening your private design…</p>}
      {error && (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {design && (
        <div className="basket-layout">
          <div>
            <div className="view-tabs">
              <button
                aria-pressed={variant === "finished"}
                onClick={() => setVariant("finished")}
              >
                Finished
              </button>
              <button
                aria-pressed={variant === "template"}
                onClick={() => setVariant("template")}
              >
                Template
              </button>
            </div>
            {preview && (
              <img src={preview} alt={`Saved ${variant} artwork preview`} />
            )}
          </div>
          <div>
            <h2>A moment, kept safe.</h2>
            <p>
              This link is private. Anyone with the full link can access the
              design.
            </p>
            <p>
              Saved design expires{" "}
              {new Date(design.expiresAt).toLocaleDateString("en-GB")}.
            </p>
            <button className="button" onClick={edit} disabled={loading}>
              Continue in the studio
            </button>
            <br />
            <button className="text-button danger" onClick={remove}>
              Delete private design
            </button>
          </div>
        </div>
      )}
    </>
  );
}
