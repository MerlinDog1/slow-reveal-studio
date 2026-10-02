"use client";
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/catalog";
import {
  cropImage,
  loadImage,
  DEFAULT_CROP,
  type Crop,
} from "@/lib/image-processing";

type Status = {
  id: string;
  paymentStatus: "paid" | "pending";
  reviewStatus: string;
  amountPence?: number;
  tracking?: string;
  dimensionsMm?: { width: number; height: number };
  replacement?: {
    requestId?: string;
    revisionId?: string;
    note?: string;
    allowed: boolean;
    processing: boolean;
    directUploads: boolean;
  };
  proof?: {
    revisionId: string;
    hash?: string;
    requiresApproval: boolean;
    approved: boolean;
  };
};
type ProofView = "finished" | "template";
type Submission = {
  submissionId: string;
  requestId: string;
  expectedRevisionId: string;
  rightsConfirmed: true;
  crop: Crop;
  source:
    { dataUrl: string; name: string } | { uploadId: string; token: string };
};
async function responseJson(response: Response) {
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ??
        "The studio could not complete this request. Please try again.",
    );
  return result;
}
export function OrderStatus({ id }: { id: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState("");
  const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
  const [cropped, setCropped] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proofViews, setProofViews] = useState<
    Partial<Record<ProofView, string>>
  >({});
  const [loaded, setLoaded] = useState<Partial<Record<ProofView, boolean>>>({});
  const [proofConsent, setProofConsent] = useState(false);
  const [proofError, setProofError] = useState("");
  const [proofReload, setProofReload] = useState(0);
  const submission = useRef<Submission | null>(null);
  const selection = useRef(0);
  async function refresh(access = token) {
    try {
      const result = await responseJson(
        await fetch(`/api/orders/${id}`, {
          headers: { Authorization: `Bearer ${access}` },
          cache: "no-store",
          referrerPolicy: "no-referrer",
        }),
      );
      setStatus(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order unavailable.");
    }
  }
  useEffect(() => {
    const access =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(access);
    void refresh(access);
    const timer = setInterval(() => void refresh(access), 15000);
    return () => clearInterval(timer);
  }, [id]);
  useEffect(() => {
    let cancelled = false;
    setCropped("");
    if (dataUrl)
      void loadImage(dataUrl)
        .then((image) => {
          const dimensions = status?.dimensionsMm;
          const preview = cropImage(
            image,
            crop,
            dimensions ? dimensions.width / dimensions.height : 0.75,
            600,
          ).canvas.toDataURL("image/jpeg", 0.9);
          if (!cancelled) setCropped(preview);
        })
        .catch(() => {
          if (!cancelled)
            setError("This image could not be opened. Choose another photo.");
        });
    return () => {
      cancelled = true;
    };
  }, [
    dataUrl,
    crop,
    status?.dimensionsMm?.width,
    status?.dimensionsMm?.height,
  ]);
  const revisionId = status?.proof?.revisionId;
  const proofHash = status?.proof?.hash;
  const needsProof = status?.proof?.requiresApproval;
  useEffect(() => {
    let cancelled = false;
    const blobs: string[] = [];
    setLoaded({});
    setProofViews({});
    setProofConsent(false);
    setProofError("");
    if (needsProof && revisionId && proofHash && token) {
      void Promise.all(
        (["finished", "template"] as const).map(async (view) => {
          const route = `/api/orders/${id}/proof?revision=${encodeURIComponent(revisionId)}&view=${view}`;
          const headers = { Authorization: `Bearer ${token}` };
          const ticket = await responseJson(
            await fetch(`${route}&format=url`, {
              headers,
              cache: "no-store",
              referrerPolicy: "no-referrer",
            }),
          );
          if (ticket.hash !== proofHash || ticket.revisionId !== revisionId)
            throw new Error(
              "Your proof changed. Refresh the order and review both views again.",
            );
          let url = ticket.url as string | null;
          if (!url) {
            const response = await fetch(route, {
              headers,
              cache: "no-store",
              referrerPolicy: "no-referrer",
            });
            if (!response.ok) await responseJson(response);
            if (response.headers.get("X-Studio-Proof-Hash") !== proofHash)
              throw new Error("Your proof changed. Reload both views.");
            url = URL.createObjectURL(await response.blob());
            if (cancelled) {
              URL.revokeObjectURL(url);
              return;
            }
            blobs.push(url);
          }
          if (!cancelled) setProofViews((old) => ({ ...old, [view]: url! }));
        }),
      ).catch((e) => {
        if (!cancelled)
          setProofError(
            e instanceof Error
              ? e.message
              : "Proof unavailable. Reload both views.",
          );
      });
    }
    return () => {
      cancelled = true;
      blobs.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [id, revisionId, proofHash, needsProof, token, proofReload]);
  async function choosePhoto(next: File | undefined) {
    const version = ++selection.current;
    submission.current = null;
    setFile(null);
    setDataUrl("");
    setRights(false);
    setMessage("");
    setError("");
    setCrop(DEFAULT_CROP);
    if (!next) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(next.type) ||
      next.size > 8 * 1024 * 1024
    ) {
      setError("Choose a JPG, PNG or WebP photo smaller than 8 MB.");
      return;
    }
    try {
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("The photo could not be read."));
        reader.readAsDataURL(next);
      });
      const image = await loadImage(source);
      if (image.naturalWidth * image.naturalHeight > 40_000_000)
        throw new Error("Choose a photograph with at most 40 megapixels.");
      if (version === selection.current) {
        setFile(next);
        setDataUrl(source);
      }
    } catch (e) {
      if (version === selection.current)
        setError(
          e instanceof Error ? e.message : "The photo could not be read.",
        );
    }
  }
  function adjustCrop(next: Crop) {
    submission.current = null;
    setCrop(next);
  }
  async function sendReplacement() {
    const request = status?.replacement;
    if (
      !file ||
      !dataUrl ||
      !rights ||
      !request?.allowed ||
      !request.requestId ||
      !request.revisionId
    )
      return;
    setBusy(true);
    setError("");
    setMessage("Preparing your private replacement and its production proof…");
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      if (
        submission.current?.requestId !== request.requestId ||
        submission.current?.expectedRevisionId !== request.revisionId
      )
        submission.current = null;
      if (!submission.current) {
        let source: Submission["source"] = { dataUrl, name: file.name };
        if (request.directUploads) {
          const ticket = await responseJson(
            await fetch(`/api/orders/${id}/replacement/upload`, {
              method: "POST",
              headers,
              referrerPolicy: "no-referrer",
              body: JSON.stringify({
                requestId: request.requestId,
                expectedRevisionId: request.revisionId,
                mime: file.type,
                bytes: file.size,
              }),
            }),
          );
          const uploaded = await fetch(ticket.url, {
            method: "PUT",
            headers: ticket.headers,
            body: file,
            credentials: "omit",
            referrerPolicy: "no-referrer",
          });
          if (!uploaded.ok)
            throw new Error(
              "The private photo upload failed. Please try again.",
            );
          source = { uploadId: ticket.uploadId, token: ticket.token };
        }
        submission.current = {
          submissionId: crypto.randomUUID(),
          requestId: request.requestId,
          expectedRevisionId: request.revisionId,
          rightsConfirmed: true,
          crop,
          source,
        };
      }
      const result = await responseJson(
        await fetch(`/api/orders/${id}/replacement`, {
          method: "POST",
          headers,
          referrerPolicy: "no-referrer",
          body: JSON.stringify(submission.current),
        }),
      );
      setMessage(
        result.state === "processing"
          ? "Your replacement is processing. This page will update when its proof is ready."
          : "Your alternate photo is saved. Review both proof views below before approving the artwork.",
      );
      if (result.state === "saved") {
        setFile(null);
        setDataUrl("");
        setRights(false);
        submission.current = null;
      }
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The replacement could not be saved.",
      );
      setMessage("");
    } finally {
      setBusy(false);
    }
  }
  async function approveProof() {
    if (
      !proofConsent ||
      !loaded.finished ||
      !loaded.template ||
      !revisionId ||
      !proofHash ||
      proofError
    )
      return;
    setBusy(true);
    setError("");
    try {
      await responseJson(
        await fetch(`/api/orders/${id}/proof`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          referrerPolicy: "no-referrer",
          body: JSON.stringify({ revisionId, proofHash, proofApproved: true }),
        }),
      );
      setMessage(
        "Your proof approval is saved. The studio still needs to review this revision before printing.",
      );
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The proof approval could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const processing = busy || !!status?.replacement?.processing;
  return (
    <div className="prose-card">
      {error && (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {status ? (
        <>
          <h2>
            {status.paymentStatus === "paid"
              ? "Your payment is confirmed."
              : "Waiting for payment confirmation."}
          </h2>
          <p>
            {status.paymentStatus === "paid"
              ? "Your artwork enters a human review before printing. We’ll send updates as your kit takes shape."
              : "This page does not confirm payment. We’re waiting for a verified payment notification from Stripe."}
          </p>
          <div className="summary-row">
            <span>Order</span>
            <span>SRS-{id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="summary-row">
            <span>Production status</span>
            <span>{status.reviewStatus.replaceAll("-", " ")}</span>
          </div>
          {status.amountPence !== undefined && (
            <div className="summary-row">
              <span>Paid</span>
              <span>{formatPrice(status.amountPence)}</span>
            </div>
          )}
          {status.tracking && <p>Carrier / tracking: {status.tracking}</p>}
          {status.replacement?.allowed && (
            <section
              aria-labelledby="replacement-heading"
              style={{ marginTop: 32 }}
            >
              <h3 id="replacement-heading">Send an alternate photo</h3>
              <p>
                The studio needs a different photo before printing. Your paid
                original stays preserved. Your size, style, ink and
                personalisation stay the same; you can adjust this photo’s crop.
              </p>
              {status.replacement.note && (
                <p className="inline-warning">
                  Studio note: {status.replacement.note}
                </p>
              )}
              {status.replacement.processing && (
                <p role="status">
                  Your photo is being processed. This page will update when its
                  proof is ready.
                </p>
              )}
              <label>
                Alternate photograph (JPG, PNG or WebP, up to 8 MB)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={processing}
                  onChange={(event) =>
                    void choosePhoto(event.target.files?.[0])
                  }
                />
              </label>
              {cropped && (
                <>
                  <img
                    src={cropped}
                    alt="Crop of your alternate photo"
                    style={{
                      display: "block",
                      maxHeight: 420,
                      maxWidth: "100%",
                      margin: "20px auto",
                    }}
                  />
                  <fieldset
                    disabled={processing}
                    style={{ border: 0, padding: 0 }}
                  >
                    <legend>Adjust your crop</legend>
                    <label>
                      Zoom
                      <input
                        type="range"
                        min="1"
                        max="4"
                        step="0.05"
                        value={crop.zoom}
                        onChange={(event) =>
                          adjustCrop({
                            ...crop,
                            zoom: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Horizontal position
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.02"
                        value={crop.x}
                        onChange={(event) =>
                          adjustCrop({ ...crop, x: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Vertical position
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.02"
                        value={crop.y}
                        onChange={(event) =>
                          adjustCrop({ ...crop, y: Number(event.target.value) })
                        }
                      />
                    </label>
                    <button
                      className="button light"
                      type="button"
                      onClick={() =>
                        adjustCrop({
                          ...crop,
                          rotation: (crop.rotation + 90) % 360,
                        })
                      }
                    >
                      Rotate 90°
                    </button>
                  </fieldset>
                </>
              )}
              <label style={{ display: "block", marginTop: 20 }}>
                <input
                  type="checkbox"
                  checked={rights}
                  disabled={processing}
                  onChange={(event) => setRights(event.target.checked)}
                />{" "}
                I own this photo or have permission to use it, including
                permission from the people shown.
              </label>
              <button
                className="button"
                disabled={processing || !file || !cropped || !rights}
                onClick={() => void sendReplacement()}
                style={{ marginTop: 20 }}
              >
                {processing
                  ? "Preparing proof…"
                  : "Save alternate photo and prepare proof"}
              </button>
            </section>
          )}
          {status.proof?.requiresApproval && (
            <section aria-labelledby="proof-heading" style={{ marginTop: 32 }}>
              <h3 id="proof-heading">Review your replacement proof</h3>
              <p>
                These are the saved production views for this revision. Check
                the crop, detail, ink and any personalisation in both views.
                They are digital previews; the studio still checks print
                suitability.
              </p>
              {proofError && (
                <p className="inline-warning" role="alert">
                  {proofError}
                </p>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                  gap: 20,
                }}
              >
                {(["finished", "template"] as const).map((view) => (
                  <figure
                    key={`${revisionId}-${proofReload}-${view}`}
                    style={{ margin: 0 }}
                  >
                    <figcaption>
                      {view === "finished"
                        ? "Finished artwork"
                        : "Printed guide template"}
                    </figcaption>
                    {proofViews[view] ? (
                      <img
                        src={proofViews[view]}
                        alt={
                          view === "finished"
                            ? "Saved finished replacement artwork"
                            : "Saved replacement guide template"
                        }
                        referrerPolicy="no-referrer"
                        style={{
                          width: "100%",
                          maxHeight: 500,
                          objectFit: "contain",
                          background: "#fff",
                        }}
                        onLoad={() =>
                          setLoaded((old) => ({ ...old, [view]: true }))
                        }
                        onError={() => {
                          setLoaded((old) => ({ ...old, [view]: false }));
                          setProofError(
                            "A proof image could not load. Reload both views before approving.",
                          );
                        }}
                      />
                    ) : (
                      <p role="status">Loading proof…</p>
                    )}
                  </figure>
                ))}
              </div>
              <button
                className="button light"
                onClick={() => setProofReload((value) => value + 1)}
                disabled={busy}
                style={{ marginTop: 20 }}
              >
                Reload both proof views
              </button>
              {status.proof.approved ? (
                <p role="status">
                  You approved this proof. Studio print approval is still a
                  separate review.
                </p>
              ) : (
                <>
                  <label style={{ display: "block", marginTop: 20 }}>
                    <input
                      type="checkbox"
                      checked={proofConsent}
                      onChange={(event) =>
                        setProofConsent(event.target.checked)
                      }
                      disabled={
                        busy ||
                        !loaded.finished ||
                        !loaded.template ||
                        !!proofError
                      }
                    />{" "}
                    I have reviewed both views and approve this replacement
                    artwork for studio review.
                  </label>
                  <button
                    className="button"
                    onClick={() => void approveProof()}
                    disabled={
                      busy ||
                      !proofConsent ||
                      !loaded.finished ||
                      !loaded.template ||
                      !!proofError
                    }
                    style={{ marginTop: 20 }}
                  >
                    Approve replacement proof
                  </button>
                </>
              )}
            </section>
          )}
        </>
      ) : (
        <p role="status">Checking your order…</p>
      )}
      <button
        className="button light"
        style={{ marginTop: 20 }}
        onClick={() => void refresh()}
      >
        Refresh status
      </button>
    </div>
  );
}
