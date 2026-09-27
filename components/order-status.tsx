"use client";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/catalog";
type Status = {
  id: string;
  paymentStatus: "paid" | "pending";
  reviewStatus: string;
  amountPence?: number;
  tracking?: string;
};
export function OrderStatus({ id }: { id: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  async function refresh(access = token) {
    try {
      const r = await fetch(`/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${access}` },
      });
      const result = await r.json();
      if (!r.ok)
        throw new Error(result.error ?? "Your order could not be found.");
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
  return (
    <div className="prose-card">
      {error ? (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      ) : status ? (
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
        </>
      ) : (
        <p role="status">Checking your order…</p>
      )}
      <button
        className="button light"
        style={{ marginTop: 20 }}
        onClick={() => refresh()}
      >
        Refresh status
      </button>
    </div>
  );
}
