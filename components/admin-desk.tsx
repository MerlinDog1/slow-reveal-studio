"use client";
import { useRef, useState } from "react";
import {
  Check,
  LockKeyhole,
  LoaderCircle,
  ArrowDownToLine,
} from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { downloadBlob } from "@/lib/export-artwork";
import type { Order } from "@/lib/server/schema";
import { orderReviewDetails, hasUnappliedCrop } from "@/lib/order-review";
type Desk = {
  analytics?: {
    windowDays: number;
    rows: {
      mode: string;
      productId: string;
      event: string;
      count: number;
      sessions: number;
    }[];
  };
  orders: Order[];
  designCount: number;
  configuration: { persistence: string; storage: string };
  gates: { id: string; label: string; passed: boolean }[];
};
export function AdminDesk() {
  const inspection = useRef(0);
  const [proofReady, setProofReady] = useState(false);
  const [token, setToken] = useState("");
  const [data, setData] = useState<Desk | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [finished, setFinished] = useState<string | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [crop, setCrop] = useState<{
    zoom: number;
    x: number;
    y: number;
    rotation: number;
  }>({ zoom: 1, x: 0, y: 0, rotation: 0 });
  const review = selected ? orderReviewDetails(selected) : null;
  const cropDirty = Boolean(review && hasUnappliedCrop(crop, review.crop));
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await r.json();
      if (!r.ok)
        throw new Error(
          result.error ?? "The production desk could not be opened.",
        );
      setData(result);
      return result as Desk;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders.");
    } finally {
      setBusy(false);
    }
  }
  async function inspect(order: Order) {
    const inspectionId = ++inspection.current;
    setProofReady(false);
    setSelected(order);
    setNote("");
    setTracking(order.tracking ?? "");
    const latest = order.revisions.find(
      (r) => r.id === order.currentRevisionId,
    );
    setCrop(latest?.crop ?? order.originalSnapshot.design.crop);
    for (const url of [source, finished, template])
      if (url) URL.revokeObjectURL(url);
    setSource(null);
    setFinished(null);
    setTemplate(null);
    try {
      for (const [type, set] of [
        ["source", setSource],
        ["finished", setFinished],
        ["template", setTemplate],
      ] as const) {
        const r = await fetch(
          `/api/admin/orders/${order.id}/files?file=${type}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!r.ok) throw new Error("A private preview could not be opened.");
        const blob = await r.blob();
        if (inspectionId !== inspection.current) return;
        set(URL.createObjectURL(blob));
      }
      if (inspectionId === inspection.current) setProofReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview unavailable.");
    }
  }
  async function action(action: string, notificationId?: string) {
    if (!selected) return;
    if (cropDirty && (action === "approve" || action === "dispatch")) {
      setError(
        "Create revised artwork or undo the crop changes before approving or dispatching.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/admin/orders/${selected.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          note,
          revision: selected.currentRevisionId,
          ...(notificationId ? { notificationId } : {}),
          ...(action === "dispatch" ? { tracking } : {}),
          ...(action === "regenerate" ? { crop } : {}),
        }),
      });
      const result = await r.json();
      if (!r.ok)
        throw new Error(result.error ?? "The order could not be updated.");
      const refreshed = await load();
      const updated = refreshed?.orders.find((o) => o.id === selected.id);
      if (updated) await inspect(updated);
      if (result.notification?.message) setNotice(result.notification.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order update failed.");
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!selected) return;
    setBusy(true);
    try {
      const ticketResponse = await fetch(
        `/api/admin/orders/${selected.id}/files?file=archive&format=url`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!ticketResponse.ok)
        throw new Error("Production archive access failed.");
      const ticket = await ticketResponse.json();
      if (ticket.url) {
        const link = document.createElement("a");
        link.href = ticket.url;
        link.rel = "noreferrer";
        link.click();
        return;
      }
      const r = await fetch(
        `/api/admin/orders/${selected.id}/files?file=archive`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) throw new Error("Production package could not be downloaded.");
      downloadBlob(
        await r.blob(),
        `SRS-${selected.id.slice(0, 8)}-production.zip`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="prose-card">
        <LockKeyhole size={22} />
        <p>
          The production desk is private. Enter the administrator token
          configured for this studio. It stays in memory for this visit.
        </p>
        <form
          className="setup-form"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <input
            className="input"
            type="password"
            autoComplete="off"
            aria-label="Administrator token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Administrator token"
          />
          <button className="button" disabled={!token || busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : null}Open
            production desk
          </button>
        </form>
      </div>
      {error && (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="inline-warning" role="status">
          {notice}
        </p>
      )}
      {data && (
        <>
          <div className="section-title">
            <h2>Before the first print</h2>
            <span>{data.designCount} private designs</span>
          </div>
          <div className="config-grid">
            {data.gates.map((g) => (
              <div className="config-card" key={g.id}>
                <strong>
                  {g.passed ? "Connected / approved" : "Pending"}{" "}
                  {g.passed && <Check size={13} />}
                </strong>
                <p>{g.label}</p>
              </div>
            ))}
          </div>
          <p className="fine-print">
            Records: {data.configuration.persistence} · Assets:{" "}
            {data.configuration.storage}. Configuration presence does not
            replace a live connectivity test.
          </p>
          {data.analytics && (
            <details className="prose-card">
              <summary>
                Consented studio activity · last {data.analytics.windowDays}{" "}
                days
              </summary>
              {data.analytics.rows.length ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mode / size</th>
                      <th>Step</th>
                      <th>Events</th>
                      <th>Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.analytics.rows.map((row, i) => (
                      <tr key={i}>
                        <td>
                          {row.mode} / {row.productId}
                        </td>
                        <td>{row.event}</td>
                        <td>{row.count}</td>
                        <td>{row.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No opted-in activity has been collected.</p>
              )}
            </details>
          )}
          {!data.orders.length ? (
            <div className="empty-state">
              <h2>A quiet workbench.</h2>
              <p>
                Verified paid orders will appear here for artwork review.
                <br />
                There are no fabricated orders or payment confirmations.
              </p>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Received</th>
                  <th>Payment</th>
                  <th>Production</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id}>
                    <td>SRS-{o.id.slice(0, 8).toUpperCase()}</td>
                    <td>{new Date(o.createdAt).toLocaleDateString("en-GB")}</td>
                    <td>
                      {formatPrice(o.amountPence)} · {o.paymentStatus}
                    </td>
                    <td>{o.reviewStatus}</td>
                    <td>
                      <button
                        className="button small light"
                        onClick={() => inspect(o)}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {selected && (
            <section className="prose-card">
              <h2>Review SRS-{selected.id.slice(0, 8).toUpperCase()}</h2>
              <p>
                Current revision: {selected.currentRevisionId} ·{" "}
                {selected.reviewStatus}
              </p>
              {review?.customerProofPending && (
                <p className="inline-warning" role="status">
                  The customer must approve both proofs of this revised artwork
                  through their private order link before it can be approved for
                  print.
                </p>
              )}
              {selected.reviewStatus === "alternate-photo-requested" && (
                <p className="inline-warning" role="status">
                  An alternate photo is requested. Resolve that request and
                  review the revised artwork before print approval.
                </p>
              )}
              <div className="admin-previews">
                {[
                  [source, "Source photograph"],
                  [finished, "Finished artwork"],
                  [template, "Printable template"],
                ].map(([src, label]) => (
                  <figure key={label}>
                    {src && <img src={src} alt={label!} />}
                    <figcaption>{label}</figcaption>
                  </figure>
                ))}
              </div>
              <p>
                {review?.settings.widthMm} × {review?.settings.heightMm} mm ·{" "}
                {selected.originalSnapshot.design.mode} ·{" "}
                {selected.originalSnapshot.design.finishId} ·{" "}
                {selected.originalSnapshot.design.inkId}
              </p>
              {review && (
                <div className="review-details">
                  <h3>Selected kit</h3>
                  <p>
                    {review.kit.length
                      ? review.kit.join(" · ")
                      : "Check the production manifest for kit contents."}
                  </p>
                  {review.markCount !== undefined && (
                    <p>
                      {review.markCount.toLocaleString("en-GB")} marks in this
                      revision.
                    </p>
                  )}
                  {Boolean(review.settings.palette?.length) && (
                    <p>
                      Palette:{" "}
                      {review.settings.palette
                        ?.map((colour, i) => `${i + 1}: ${colour}`)
                        .join(" · ")}
                    </p>
                  )}
                  <h3>Personalised lettering</h3>
                  {review.text ? (
                    <>
                      <blockquote>{review.text}</blockquote>
                      <p>
                        {review.settings.text?.fontFamily === "sans-serif"
                          ? "Simple sans"
                          : "Classic serif"}{" "}
                        · {review.settings.text?.sizeMm ?? 7} mm requested ·{" "}
                        {review.settings.text?.placement?.replaceAll(
                          "-",
                          " ",
                        ) ?? "bottom centre"}
                        . Check final letter size in the proof when long text is
                        fitted.
                      </p>
                    </>
                  ) : (
                    <p>No personalised text.</p>
                  )}
                  <h3>Automated review advice</h3>
                  {review.warnings.length ? (
                    <ul>
                      {review.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No automated warnings were recorded. Inspect the source
                      and both proofs before approving.
                    </p>
                  )}
                </div>
              )}
              <div className="crop-inputs">
                {["zoom", "x", "y", "rotation"].map((key) => (
                  <label className="text-field" key={key}>
                    {key}
                    <input
                      type="number"
                      step={key === "rotation" ? 90 : 0.05}
                      min={key === "zoom" ? 1 : key === "rotation" ? 0 : -1}
                      max={key === "zoom" ? 4 : key === "rotation" ? 270 : 1}
                      value={crop[key as keyof typeof crop]}
                      onChange={(e) =>
                        setCrop((c) => ({
                          ...c,
                          [key]: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              {cropDirty && (
                <div className="inline-warning" role="status">
                  <p>
                    The crop changes are not in these previews yet. Create
                    revised artwork to apply them, then review the new proofs.
                  </p>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => review && setCrop(review.crop)}
                  >
                    Undo crop changes
                  </button>
                </div>
              )}
              <label className="text-field">
                Review note
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                />
              </label>
              <label className="text-field">
                Carrier and tracking reference
                <input
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  maxLength={200}
                />
              </label>
              <div className="admin-actions">
                <button
                  className="button"
                  disabled={
                    busy ||
                    !proofReady ||
                    cropDirty ||
                    review?.customerProofPending ||
                    selected.reviewStatus === "alternate-photo-requested" ||
                    selected.reviewStatus === "dispatched"
                  }
                  onClick={() => action("approve")}
                >
                  Approve for print
                </button>
                <button
                  className="button light"
                  disabled={busy}
                  onClick={() => action("hold")}
                >
                  Hold
                </button>
                <button
                  className="button light"
                  disabled={busy}
                  onClick={() => action("request-photo")}
                >
                  Request alternate photo
                </button>
                <button
                  className="button light"
                  disabled={busy}
                  onClick={() => action("regenerate")}
                >
                  Create revised artwork
                </button>
                <button
                  className="button light"
                  disabled={
                    busy ||
                    cropDirty ||
                    review?.customerProofPending ||
                    selected.reviewStatus !== "approved"
                  }
                  onClick={() => action("dispatch")}
                >
                  Mark dispatched
                </button>
                <button
                  className="button light"
                  disabled={busy || cropDirty}
                  onClick={download}
                >
                  <ArrowDownToLine size={15} />
                  Production package
                </button>
              </div>
              {Boolean(selected.notifications?.length) && (
                <div className="prose-card">
                  <h3>Customer emails</h3>
                  {selected.notifications?.map((notification) => (
                    <div key={notification.id} className="summary-row">
                      <span>
                        {notification.type.replaceAll("-", " ")} ·{" "}
                        {notification.status} · {notification.attempts} attempt
                        {notification.attempts === 1 ? "" : "s"}
                      </span>
                      {notification.status !== "sent" && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            action("retry-notification", notification.id)
                          }
                        >
                          Retry email
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <h3>Review history</h3>
              {selected.audit.map((a, i) => (
                <p className="fine-print" key={i}>
                  {new Date(a.at).toLocaleString("en-GB")} · {a.action} ·{" "}
                  {a.note}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
