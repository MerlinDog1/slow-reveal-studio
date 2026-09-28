"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ArrowDownToLine } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { downloadBlob } from "@/lib/export-artwork";
import type { Order } from "@/lib/server/schema";
import { orderReviewDetails, hasUnappliedCrop } from "@/lib/order-review";
import { AdminPresets } from "./admin-presets";
type Desk = {
  identity: {
    kind: "supabase" | "local-token";
    userId: string;
    role: "reviewer" | "operator";
  };
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
export function AdminDesk({
  accessToken: token,
  onSignOut,
  onSessionEnded,
}: {
  accessToken: string;
  onSignOut: () => void;
  onSessionEnded: (message: string) => void;
}) {
  const inspection = useRef(0);
  const loadRequest = useRef(0);
  const previewUrls = useRef(new Set<string>());
  const [proofReady, setProofReady] = useState(false);
  const [data, setData] = useState<Desk | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [reload, setReload] = useState(0);
  const busy = loading || mutating;
  const loadingRef = useRef(false);
  const mutatingRef = useRef(false);
  const reloadAfterMutation = useRef(false);
  const currentToken = useRef(token);
  currentToken.current = token;
  const mounted = useRef(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const selectedOrder = useRef<Order | null>(null);
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
  useEffect(() => {
    if (mutatingRef.current) reloadAfterMutation.current = true;
    else void load(token);
    return () => {
      loadRequest.current++;
    };
  }, [token, reload]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inspection.current++;
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current.clear();
    };
  }, []);
  async function accessDenied(status: number, requestToken: string) {
    if (
      !mounted.current ||
      requestToken !== currentToken.current ||
      ![401, 403].includes(status)
    )
      return;
    if (status === 401) {
      onSessionEnded("Your administrator session ended. Sign in again.");
      return;
    }
    // A 403 can be a role downgrade rather than revoked membership. The guarded desk load
    // rechecks membership and invalidates older loads, without clearing a session on outages.
    await load(requestToken, true);
  }
  async function load(access = currentToken.current, afterMutation = false) {
    if (mutatingRef.current && !afterMutation) {
      reloadAfterMutation.current = true;
      return;
    }
    const request = ++loadRequest.current;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin", {
        headers: { Authorization: `Bearer ${access}` },
      });
      const result = await r.json();
      if (
        !mounted.current ||
        request !== loadRequest.current ||
        access !== currentToken.current
      )
        return;
      if (r.status === 401 || r.status === 403) {
        onSessionEnded(
          "Operator access ended. Sign in again or ask the studio owner to check your access.",
        );
        return;
      }
      if (!r.ok)
        throw new Error(
          result.error ?? "The production desk could not be opened.",
        );
      setData(result);
      const inspected = selectedOrder.current;
      if (inspected) {
        const fresh = (result as Desk).orders.find(
          (order) => order.id === inspected.id,
        );
        if (
          !fresh ||
          fresh.dataDeletedAt ||
          fresh.currentRevisionId !== inspected.currentRevisionId
        ) {
          clearInspection();
          setNotice(
            "The inspected artwork changed or is no longer available. Select Review on the current order before approving or downloading.",
          );
        } else {
          // Status and audit changes can refresh without discarding an unsaved crop or reusing a different proof.
          selectedOrder.current = fresh;
          setSelected(fresh);
        }
      }
      return result as Desk;
    } catch (e) {
      if (
        mounted.current &&
        request === loadRequest.current &&
        access === currentToken.current
      )
        setError(e instanceof Error ? e.message : "Could not load orders.");
    } finally {
      if (mounted.current && request === loadRequest.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }
  function clearInspection() {
    inspection.current++;
    selectedOrder.current = null;
    setSelected(null);
    setProofReady(false);
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
    setSource(null);
    setFinished(null);
    setTemplate(null);
  }
  function staleFile(response: Response) {
    if (response.status !== 409) return false;
    if (mounted.current) {
      clearInspection();
      setError(
        "The artwork revision changed. Refresh the production desk and review the latest proofs before downloading or approving.",
      );
    }
    return true;
  }
  async function inspect(order: Order, afterMutation = false) {
    if ((loadingRef.current || mutatingRef.current) && !afterMutation) return;
    const access = currentToken.current;
    const inspectionId = ++inspection.current;
    setProofReady(false);
    selectedOrder.current = order;
    setSelected(order);
    setNotice("");
    setNote("");
    setTracking(order.tracking ?? "");
    const latest = order.revisions.find(
      (r) => r.id === order.currentRevisionId,
    );
    setCrop(latest?.crop ?? order.originalSnapshot.design.crop);
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
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
          `/api/admin/orders/${order.id}/files?file=${type}&revision=${encodeURIComponent(order.currentRevisionId)}`,
          { headers: { Authorization: `Bearer ${access}` } },
        );
        if (!mounted.current || inspectionId !== inspection.current) return;
        await accessDenied(r.status, access);
        if (staleFile(r)) return;
        if (!r.ok) throw new Error("A private preview could not be opened.");
        const blob = await r.blob();
        if (inspectionId !== inspection.current) return;
        const url = URL.createObjectURL(blob);
        previewUrls.current.add(url);
        set(url);
      }
      if (inspectionId === inspection.current) setProofReady(true);
    } catch (e) {
      if (
        mounted.current &&
        inspectionId === inspection.current &&
        access === currentToken.current
      )
        setError(e instanceof Error ? e.message : "Preview unavailable.");
    }
  }
  async function action(action: string, notificationId?: string) {
    if (!selected || loadingRef.current || mutatingRef.current) return;
    if (cropDirty && (action === "approve" || action === "dispatch")) {
      setError(
        "Create revised artwork or undo the crop changes before approving or dispatching.",
      );
      return;
    }
    mutatingRef.current = true;
    setMutating(true);
    inspection.current++;
    const access = currentToken.current;
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/admin/orders/${selected.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${access}`,
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
      await accessDenied(r.status, access);
      const result = await r.json();
      if (!mounted.current) return;
      if (!r.ok)
        throw new Error(result.error ?? "The order could not be updated.");
      const refreshed = await load(currentToken.current, true);
      const updated = refreshed?.orders.find((o) => o.id === selected.id);
      if (updated) await inspect(updated, true);
      if (result.notification?.message) setNotice(result.notification.message);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "Order update failed.");
    } finally {
      finishMutation();
    }
  }
  async function download() {
    if (
      !selected ||
      !proofReady ||
      cropDirty ||
      loadingRef.current ||
      mutatingRef.current
    )
      return;
    mutatingRef.current = true;
    setMutating(true);
    const access = currentToken.current;
    try {
      const ticketResponse = await fetch(
        `/api/admin/orders/${selected.id}/files?file=archive&format=url&revision=${encodeURIComponent(selected.currentRevisionId)}`,
        { headers: { Authorization: `Bearer ${access}` } },
      );
      await accessDenied(ticketResponse.status, access);
      if (staleFile(ticketResponse)) return;
      if (!ticketResponse.ok)
        throw new Error("Production archive access failed.");
      const ticket = await ticketResponse.json();
      if (!mounted.current) return;
      if (ticket.url) {
        const link = document.createElement("a");
        link.href = ticket.url;
        link.rel = "noreferrer";
        link.click();
        return;
      }
      const r = await fetch(
        `/api/admin/orders/${selected.id}/files?file=archive&revision=${encodeURIComponent(selected.currentRevisionId)}`,
        { headers: { Authorization: `Bearer ${access}` } },
      );
      await accessDenied(r.status, access);
      if (staleFile(r)) return;
      if (!r.ok) throw new Error("Production package could not be downloaded.");
      const blob = await r.blob();
      if (!mounted.current) return;
      downloadBlob(blob, `SRS-${selected.id.slice(0, 8)}-production.zip`);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      finishMutation();
    }
  }
  function finishMutation() {
    mutatingRef.current = false;
    if (!mounted.current) return;
    setMutating(false);
    if (reloadAfterMutation.current) {
      reloadAfterMutation.current = false;
      setReload((value) => value + 1);
    }
  }
  return (
    <>
      <div className="prose-card">
        <p>
          {data
            ? `Signed in as ${data.identity.role}${data.identity.kind === "local-token" ? " · local development" : ""}.`
            : "Checking operator access…"}
        </p>
        {data?.identity.role === "reviewer" && (
          <p>
            Reviewers can inspect and revise artwork. Dispatch, deletion and
            publishing studio presets require an operator.
          </p>
        )}
        <div className="admin-actions">
          <button
            className="button light"
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh production desk
          </button>
          <button className="button light" onClick={onSignOut}>
            Sign out
          </button>
        </div>
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
          <AdminPresets
            token={token}
            role={data.identity.role}
            onAccessDenied={accessDenied}
          />
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
                        disabled={busy}
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
                      disabled={busy}
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
                  disabled={busy}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                />
              </label>
              <label className="text-field">
                Carrier and tracking reference
                <input
                  value={tracking}
                  disabled={busy}
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
                    data?.identity.role !== "operator" ||
                    selected.reviewStatus !== "approved"
                  }
                  onClick={() => action("dispatch")}
                >
                  Mark dispatched
                </button>
                <button
                  className="button light"
                  disabled={busy || cropDirty || !proofReady}
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
                      {(notification.status === "pending" ||
                        notification.status === "sending") && (
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
                  {a.actorId && (
                    <>
                      {" "}
                      ·{" "}
                      {a.actorKind === "local-token"
                        ? "Local development"
                        : "Operator"}
                      : {a.actorId}
                      {a.actorKind ? ` (${a.actorKind})` : ""}
                    </>
                  )}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
