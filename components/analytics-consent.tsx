"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  getAnalyticsPreference,
  setAnalyticsPreference,
  subscribeAnalyticsPreference,
  type AnalyticsPreference,
} from "@/lib/analytics";

const panelStyle: CSSProperties = {
  position: "fixed",
  bottom: 18,
  right: 18,
  zIndex: 50,
  width: "min(360px, calc(100vw - 36px))",
  padding: "20px 22px",
  background: "var(--paper, #fffdf8)",
  color: "var(--ink, #252a25)",
  border: "1px solid var(--line, #deddd2)",
  borderRadius: 6,
  boxShadow: "0 6px 30px #252a251a",
  fontSize: 12,
  lineHeight: 1.65,
};

export function AnalyticsConsent() {
  const [preference, setPreference] = useState<AnalyticsPreference>("unknown");
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => setPreference(getAnalyticsPreference());
    update();
    setReady(true);
    return subscribeAnalyticsPreference(update);
  }, []);

  function choose(value: "allowed" | "declined") {
    setAnalyticsPreference(value);
    setPreference(value);
    setOpen(false);
  }

  if (!ready) return null;
  if (!open && preference !== "unknown")
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-button"
        aria-label="Analytics settings"
        style={{
          position: "fixed",
          left: 14,
          bottom: 10,
          zIndex: 30,
          background: "var(--canvas, #f4efe6)",
          padding: "4px 8px",
          borderRadius: 3,
          fontSize: 10,
        }}
      >
        Analytics settings
      </button>
    );

  return (
    <aside style={panelStyle} aria-labelledby="analytics-preference-title">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h2
          id="analytics-preference-title"
          style={{
            fontFamily: "var(--serif, Georgia, serif)",
            fontSize: 21,
            margin: "0 0 9px",
          }}
        >
          Help improve the studio
        </h2>
        {preference !== "unknown" && (
          <button
            type="button"
            aria-label="Close analytics settings"
            onClick={() => setOpen(false)}
            style={{ border: 0, background: "none", fontSize: 19, padding: 4 }}
          >
            ×
          </button>
        )}
      </div>
      <p style={{ margin: "0 0 13px", color: "var(--muted, #77796d)" }}>
        May we measure which steps, styles and sizes people use? Optional
        analytics stay on our service. We never include photos, personalisation,
        names or email addresses.
      </p>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 11,
          color: "var(--muted, #77796d)",
        }}
      >
        No analytics are sent until you allow them. We store your choice in this
        browser, use no analytics cookies and keep a random session ID in this
        tab only.
      </p>
      {preference !== "unknown" && (
        <p style={{ margin: "0 0 12px", fontSize: 11 }}>
          Currently {preference === "allowed" ? "allowed" : "off"}. You can
          change this at any time.
        </p>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="button small"
          onClick={() => choose("allowed")}
        >
          Allow analytics
        </button>
        <button
          type="button"
          className="button small light"
          onClick={() => choose("declined")}
        >
          Decline
        </button>
      </div>
      <a
        href="/privacy"
        style={{
          display: "inline-block",
          marginTop: 12,
          fontSize: 10,
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        Privacy details
      </a>
    </aside>
  );
}

export default AnalyticsConsent;
