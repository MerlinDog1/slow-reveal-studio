"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, LoaderCircle, Trash2 } from "lucide-react";
import {
  getLocalProject,
  saveLocalProject,
  deleteLocalProject,
  type LocalProject,
} from "@/lib/browser-storage";
import { PRODUCTS, FINISHES, INKS, SHIPPING, formatPrice } from "@/lib/catalog";
import { loadImage, cropImage } from "@/lib/image-processing";
import {
  track,
  getAnalyticsSessionId,
  markAnalyticsJourneyComplete,
  flushAnalytics,
} from "@/lib/analytics";
import { renderImage, toSvg, type RenderSettings } from "@/lib/renderers";
type SavedDesign = { id: string; token: string; url: string };
function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read photograph."));
    reader.readAsDataURL(blob);
  });
}
export function Basket() {
  const proofIdentity = useRef("");
  const [project, setProject] = useState<LocalProject | null>(null);
  const [svg, setSvg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [shippingId, setShippingId] = useState<string>("standard");
  const [design, setDesign] = useState<SavedDesign | null>(null);
  const [ready, setReady] = useState(false);
  const [directUploads, setDirectUploads] = useState(false);
  const [proof, setProof] = useState<string | null>(null);
  const [proofView, setProofView] = useState("finished");
  const [proofApproved, setProofApproved] = useState(false);
  const [proofLoaded, setProofLoaded] = useState(false);
  const [proofHash, setProofHash] = useState("");
  const [proofViews, setProofViews] = useState<string[]>([]);
  const [reference, setReference] = useState(false);
  const [rights, setRights] = useState(false);
  const [inkId, setInkId] = useState<string>("black");
  const [catalog, setCatalog] = useState<{
    products: (typeof PRODUCTS)[number][];
    finishes: (typeof FINISHES)[number][];
    shipping: (typeof SHIPPING)[number][];
  } | null>(null);
  useEffect(() => {
    getLocalProject("basket")
      .then(async (p) => {
        if (!p) return;
        setProject(p);
        const meta = JSON.parse(localStorage.getItem("sr-basket") ?? "{}");
        setInkId(meta.inkId ?? "black");
        setReference(!!meta.reference);
        const url = URL.createObjectURL(p.image);
        try {
          const image = await loadImage(url);
          const settings = p.settings as RenderSettings;
          const { pixels } = cropImage(
            image,
            p.crop,
            settings.widthMm / settings.heightMm,
          );
          setSvg(
            toSvg(
              renderImage(
                {
                  data: pixels.data,
                  width: pixels.width,
                  height: pixels.height,
                },
                settings,
              ),
              "finished",
            ),
          );
        } finally {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() =>
        setError(
          "This design could not be opened. Return to the studio and save it again.",
        ),
      )
      .finally(() => setLoading(false));
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((c) => {
        setReady(c.liveCheckoutEnabled === true);
        setDirectUploads(c.directUploads === true);
        setCatalog(c);
      })
      .catch(() => setReady(false));
  }, []);
  useEffect(() => {
    if (!design) return;
    let url: string | null = null;
    const controller = new AbortController();
    setProofLoaded(false);
    setProof(null);
    fetch(`/api/designs/${design.id}/preview?view=${proofView}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${design.token}` },
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error("The final production proof could not be loaded.");
        const hash = r.headers.get("X-Studio-Proof-Hash");
        if (!hash)
          throw new Error(
            "The proof could not be verified. Please reload your saved design.",
          );
        const blob = await r.blob();
        if (controller.signal.aborted) return;
        if (proofIdentity.current && proofIdentity.current !== hash) {
          setProofViews([proofView]);
          setProofApproved(false);
          setNotice(
            "The artwork has been updated. Please check both proof views again.",
          );
        } else {
          setProofViews((views) =>
            views.includes(proofView) ? views : [...views, proofView],
          );
        }
        proofIdentity.current = hash;
        setProofHash(hash);
        url = URL.createObjectURL(blob);
        setProof(url);
        setProofLoaded(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [design, proofView]);
  const product = (catalog?.products ?? PRODUCTS).find(
    (p) => p.id === project?.productId,
  );
  const finish = (catalog?.finishes ?? FINISHES).find(
    (f) => f.id === project?.finishId,
  );
  const shipping =
    (catalog?.shipping ?? SHIPPING).find((s) => s.id === shippingId) ??
    SHIPPING[0];
  const total =
    (product?.pricePence ?? 0) +
    (finish?.additionalPence ?? 0) +
    shipping.pricePence;
  async function savePrivate() {
    if (!project) return null;
    if (!rights) {
      setError(
        "Please confirm you have permission to use this photograph before saving it online.",
      );
      return null;
    }
    setBusy(true);
    setError("");
    try {
      const settings = project.settings as RenderSettings;
      let source:
        { dataUrl: string; name: string } | { uploadId: string; token: string };
      if (directUploads) {
        const ticketResponse = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mime: project.image.type,
            bytes: project.image.size,
          }),
        });
        const ticket = await ticketResponse.json();
        if (!ticketResponse.ok)
          throw new Error(
            ticket.error ?? "A private upload could not be prepared.",
          );
        const uploaded = await fetch(ticket.url, {
          method: "PUT",
          headers: ticket.headers,
          body: project.image,
        });
        if (!uploaded.ok)
          throw new Error(
            "Your private photo upload failed. Please try again.",
          );
        source = { uploadId: ticket.uploadId, token: ticket.token };
      } else {
        source = {
          dataUrl: await asDataUrl(project.image),
          name: project.name,
        };
      }
      const response = await fetch("/api/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: settings.mode,
          productId: project.productId,
          finishId: project.finishId,
          inkId,
          crop: project.crop,
          settings,
          source,
          rightsConfirmed: true,
          marketingConsent: false,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Your design could not be saved.");
      proofIdentity.current = "";
      setProofViews([]);
      setProofApproved(false);
      setProofHash("");
      setDesign(result);
      setNotice(
        "Your private design is saved. Keep its private link to reopen or delete it.",
      );
      return result as SavedDesign;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function checkout() {
    if (
      !design ||
      !proofApproved ||
      !proofLoaded ||
      proofViews.length < 2 ||
      !proofHash
    ) {
      setError(
        "Save your design and review its final production proof before checkout.",
      );
      return;
    }
    const saved = design;
    setBusy(true);
    track("checkout_started", {
      mode: (project?.settings as RenderSettings)?.mode,
      productId: project?.productId,
      step: "checkout",
    });
    try {
      const analyticsSessionId = getAnalyticsSessionId();
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: saved.id,
          token: saved.token,
          shippingId,
          proofApproved: true,
          proofHash,
          ...(analyticsSessionId
            ? { analyticsConsent: true, analyticsSessionId }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Checkout is unavailable.");
      markAnalyticsJourneyComplete();
      void flushAnalytics();
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout is unavailable.");
      setBusy(false);
    }
  }
  async function remove() {
    await deleteLocalProject("basket");
    localStorage.removeItem("sr-basket");
    setProject(null);
  }
  if (loading) return <p role="status">Opening your canvas…</p>;
  if (!project)
    return (
      <div className="empty-state">
        <h2>A memory is waiting.</h2>
        <p>Your kit basket is empty. Start with a photograph you love.</p>
        <Link href="/create" className="button">
          Create your canvas
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  return (
    <div className="basket-layout">
      <div>
        <div className="basket-art" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="fine-print">
          Digital finished-art preview. Physical results are not yet validated.
        </p>
        <button
          className="text-button"
          onClick={async () => {
            try {
              await saveLocalProject({ ...project, id: "current" });
              window.location.href = "/create?restore=1";
            } catch {
              setError(
                "This browser could not reopen the design. Please try again.",
              );
            }
          }}
        >
          Return to the studio
        </button>
      </div>
      <div className="basket-summary">
        <h2>Made for your wall.</h2>
        <p>{project.name}</p>
        <div className="summary-row">
          <span>
            {
              {
                dots: "Signature Dots",
                mosaic: "Colour Mosaic",
                contour: "Contour",
                "line-amplification": "Line Amplification",
              }[(project.settings as RenderSettings).mode]
            }{" "}
            · {(project.settings as RenderSettings).widthMm / 10} ×{" "}
            {(project.settings as RenderSettings).heightMm / 10} cm
          </span>
          <span>{formatPrice(product?.pricePence ?? 0)}</span>
        </div>
        <div className="summary-row">
          <span>{finish?.label}</span>
          <span>{formatPrice(finish?.additionalPence ?? 0)}</span>
        </div>
        <div className="summary-row">
          <span>Marker colour</span>
          <span>{INKS.find((i) => i.id === inkId)?.label}</span>
        </div>
        <label className="select-field">
          Delivery
          <select
            value={shippingId}
            onChange={(e) => setShippingId(e.target.value)}
          >
            {(catalog?.shipping ?? SHIPPING).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {formatPrice(s.pricePence)}
              </option>
            ))}
          </select>
        </label>
        <div className="summary-row total">
          <span>{ready ? "Total" : "Indicative total"}</span>
          <span>{formatPrice(total)}</span>
        </div>
        {!ready && (
          <div className="inline-warning" style={{ marginTop: 20 }}>
            The studio is in physical prototyping. Explore and save your design
            now; orders open once the canvas, ink and markers are approved.
          </div>
        )}
        {reference && (
          <p className="fine-print">
            This is a reference photograph for exploring the renderer. Use your
            own photograph for your personal kit.
          </p>
        )}
        <label className="check-label rights">
          <input
            type="checkbox"
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
          />
          I have permission to use this image and understand that saving
          privately uploads it for this design.
        </label>
        {ready && design ? (
          <button
            className="button full"
            disabled={
              busy ||
              reference ||
              !proofApproved ||
              !proofLoaded ||
              proofViews.length < 2
            }
            onClick={checkout}
          >
            {busy ? <LoaderCircle className="spin" size={16} /> : null}Continue
            to secure checkout
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            className="button full"
            disabled={busy || !!design}
            onClick={savePrivate}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : design ? (
              <Check size={16} />
            ) : null}
            {design ? "Private design saved" : "Save a private design"}
          </button>
        )}
        {design && (
          <section className="canonical-proof">
            <h3>Your final production proof</h3>
            <p className="fine-print">
              This server-generated proof is used for printing. Check both
              views, crop and lettering before continuing.
            </p>
            <div className="view-tabs">
              <button
                aria-pressed={proofView === "finished"}
                onClick={() => setProofView("finished")}
              >
                Finished
              </button>
              <button
                aria-pressed={proofView === "template"}
                onClick={() => setProofView("template")}
              >
                Template
              </button>
            </div>
            {proof ? (
              <img src={proof} alt={`Final ${proofView} production proof`} />
            ) : (
              <p role="status">Preparing the production proof…</p>
            )}
            <label className="check-label rights">
              <input
                type="checkbox"
                checked={proofApproved}
                disabled={!proofLoaded || proofViews.length < 2}
                onChange={(e) => setProofApproved(e.target.checked)}
              />
              I have checked both final views, the crop and lettering.
              {proofViews.length < 2 && " Open both views to confirm."}
            </label>
          </section>
        )}
        {design && (
          <div className="prose-card">
            <strong>Your private link</strong>
            <p>
              Anyone with this link can view or delete your design. Keep it
              somewhere private.
            </p>
            <Link href={design.url}>Open saved design</Link>
          </div>
        )}
        <p className="privacy-note">
          Guest creation. No marketing consent is collected.{" "}
          <Link href="/privacy">How your photographs are handled</Link>
        </p>
        <button className="text-button danger" onClick={remove}>
          <Trash2 size={14} />
          Remove from this device’s basket
        </button>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="inline-warning">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
