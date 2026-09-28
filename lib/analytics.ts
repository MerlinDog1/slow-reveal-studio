import { RENDER_MODE_IDS, type RenderMode } from "./renderers/types";

export const ANALYTICS_EVENTS = [
  "builder_opened",
  "upload_started",
  "upload_completed",
  "crop_completed",
  "renderer_selected",
  "preset_selected",
  "template_viewed",
  "finished_preview_viewed",
  "personalisation_added",
  "product_size_selected",
  "add_to_basket",
  "checkout_started",
  "payment_completed",
  "abandonment_step",
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];
export type ClientAnalyticsEvent = Exclude<AnalyticsEvent, "payment_completed">;
export const ANALYTICS_STEPS = [
  "photo",
  "style",
  "detail",
  "colour",
  "personalise",
  "size",
  "finish",
  "review",
  "basket",
  "checkout",
  "lab",
] as const;
export const ANALYTICS_PRODUCT_IDS = [
  "30x40",
  "40x50",
  "40x60",
  "50x70",
  "60x80",
] as const;
export const ANALYTICS_PRESETS = [
  "easy",
  "standard",
  "detailed",
  "bold",
  "portrait",
] as const;
const MODES: readonly RenderMode[] = RENDER_MODE_IDS;

export interface AnalyticsFields {
  mode?: RenderMode;
  productId?: string;
  step?: string;
  preset?: string;
}
export interface AnalyticsRecord extends AnalyticsFields {
  event: ClientAnalyticsEvent;
  timestamp: string;
}
export interface AnalyticsBatch {
  consent: true;
  sessionId: string;
  events: AnalyticsRecord[];
}
export type AnalyticsPreference = "unknown" | "allowed" | "declined";

const PREFERENCE_KEY = "slow-reveal.analytics-preference.v1";
const SESSION_KEY = "slow-reveal.analytics-tab.v1";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 200;
const BATCH_SIZE = 20;

/** No arbitrary strings, paths, file names, personalised text or identifiers survive this boundary. */
export function sanitizeAnalyticsFields(
  fields: AnalyticsFields = {},
): AnalyticsFields {
  const safe: AnalyticsFields = {};
  if (!fields || typeof fields !== "object") return safe;
  if (MODES.includes(fields.mode as RenderMode)) safe.mode = fields.mode;
  if (
    ANALYTICS_PRODUCT_IDS.includes(
      fields.productId as (typeof ANALYTICS_PRODUCT_IDS)[number],
    )
  )
    safe.productId = fields.productId;
  if (ANALYTICS_STEPS.includes(fields.step as (typeof ANALYTICS_STEPS)[number]))
    safe.step = fields.step;
  if (
    ANALYTICS_PRESETS.includes(
      fields.preset as (typeof ANALYTICS_PRESETS)[number],
    )
  )
    safe.preset = fields.preset;
  return safe;
}

export interface AnalyticsEnvironment {
  readPreference: () => string | null;
  writePreference: (value: "allowed" | "declined") => void;
  readSession: () => string | null;
  writeSession: (value: string) => void;
  clearSession: () => void;
  randomUUID: () => string;
  now: () => number;
  send: (batch: AnalyticsBatch, signal: AbortSignal) => Promise<unknown>;
  setTimer: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

/** Injectable only to test consent and payload boundaries without a browser or network. */
export function createAnalyticsClient(env: AnalyticsEnvironment) {
  let preference: AnalyticsPreference = "unknown";
  try {
    const saved = env.readPreference();
    if (saved === "allowed" || saved === "declined") preference = saved;
  } catch {
    /* Storage can be disabled. */
  }
  let sessionId: string | undefined;
  let accepted = 0;
  let queue: AnalyticsRecord[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let journey: AnalyticsFields | undefined;
  const duplicates = new Map<string, number>();
  const inflight = new Set<AbortController>();
  const listeners = new Set<() => void>();

  function session(): string | undefined {
    if (preference !== "allowed") return undefined;
    if (sessionId) return sessionId;
    try {
      let existing: string | null = null;
      try {
        existing = env.readSession();
      } catch {
        /* Use memory for this page if storage is blocked. */
      }
      const candidate =
        existing && UUID.test(existing) ? existing : env.randomUUID();
      if (!UUID.test(candidate)) return undefined;
      sessionId = candidate;
      try {
        env.writeSession(candidate);
      } catch {
        /* Consent still applies to this page. */
      }
      return sessionId;
    } catch {
      return undefined;
    }
  }

  function cancelPending() {
    queue = [];
    journey = undefined;
    duplicates.clear();
    if (timer !== undefined) env.clearTimer(timer);
    timer = undefined;
    for (const controller of inflight) controller.abort();
    inflight.clear();
  }

  function flush() {
    if (timer !== undefined) env.clearTimer(timer);
    timer = undefined;
    if (preference !== "allowed") {
      cancelPending();
      return;
    }
    const id = session();
    if (!id || !queue.length) return;
    const events = queue.splice(0, BATCH_SIZE);
    const controller = new AbortController();
    inflight.add(controller);
    // Failed analytics are intentionally dropped: retries must never hinder creation or duplicate events.
    try {
      void env
        .send({ consent: true, sessionId: id, events }, controller.signal)
        .catch(() => undefined)
        .finally(() => inflight.delete(controller));
    } catch {
      inflight.delete(controller);
    }
    if (queue.length) timer = env.setTimer(flush, 1500);
  }

  function track(event: AnalyticsEvent, fields: AnalyticsFields = {}) {
    // Only a verified payment webhook is allowed to record payment completion.
    if (
      preference !== "allowed" ||
      event === "payment_completed" ||
      !ANALYTICS_EVENTS.includes(event) ||
      accepted >= MAX_EVENTS ||
      !session()
    )
      return;
    const safe = sanitizeAnalyticsFields(fields);
    const now = env.now();
    const key = JSON.stringify([event, safe]);
    if (now - (duplicates.get(key) ?? -Infinity) < 1500) return;
    duplicates.set(key, now);
    accepted++;
    queue.push({ event, ...safe, timestamp: new Date(now).toISOString() });
    if (event === "builder_opened")
      journey = { ...safe, step: safe.step ?? "photo" };
    else if (event !== "abandonment_step" && journey) {
      journey = { ...journey, ...safe };
      if (event === "add_to_basket") journey.step = "basket";
      if (event === "checkout_started") journey.step = "checkout";
    }
    if (queue.length >= BATCH_SIZE) flush();
    else if (timer === undefined) timer = env.setTimer(flush, 1500);
  }

  function setPreference(value: "allowed" | "declined", persist = true) {
    if (value !== "allowed" && value !== "declined") return;
    const changed = preference !== value;
    preference = value;
    if (persist)
      try {
        env.writePreference(value);
      } catch {
        /* Memory-only preference for this visit. */
      }
    if (value === "declined") {
      cancelPending();
      sessionId = undefined;
      try {
        env.clearSession();
      } catch {
        /* No accessible tab storage. */
      }
    } else if (changed) session();
    if (changed) listeners.forEach((listener) => listener());
  }

  return {
    track,
    flush,
    setPreference,
    getPreference: () => preference,
    getSessionId: session,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Call after successful checkout initiation, before redirecting to Stripe. */
    completeJourney() {
      journey = undefined;
    },
    onPageExit() {
      const last = journey;
      journey = undefined;
      if (last) track("abandonment_step", last);
      flush();
    },
    destroy() {
      cancelPending();
      listeners.clear();
    },
  };
}

type AnalyticsClient = ReturnType<typeof createAnalyticsClient>;
let client: AnalyticsClient | undefined;

function getClient(): AnalyticsClient | undefined {
  if (typeof window === "undefined") return undefined;
  if (client) return client;
  client = createAnalyticsClient({
    readPreference: () => window.localStorage.getItem(PREFERENCE_KEY),
    writePreference: (value) =>
      window.localStorage.setItem(PREFERENCE_KEY, value),
    readSession: () => window.sessionStorage.getItem(SESSION_KEY),
    writeSession: (value) => window.sessionStorage.setItem(SESSION_KEY, value),
    clearSession: () => window.sessionStorage.removeItem(SESSION_KEY),
    randomUUID: () => window.crypto.randomUUID(),
    now: Date.now,
    send: (batch, signal) =>
      fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        keepalive: true,
        signal,
      }),
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer),
  });
  window.addEventListener("pagehide", () => client?.onPageExit());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") client?.flush();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== PREFERENCE_KEY) return;
    // A withdrawal in another tab stops future events in this tab as well.
    client?.setPreference(
      event.newValue === "allowed" ? "allowed" : "declined",
      false,
    );
  });
  return client;
}

export function track(event: AnalyticsEvent, fields?: AnalyticsFields) {
  getClient()?.track(event, fields);
}
export function getAnalyticsPreference(): AnalyticsPreference {
  return getClient()?.getPreference() ?? "unknown";
}
export function setAnalyticsPreference(value: "allowed" | "declined") {
  getClient()?.setPreference(value);
}
export function subscribeAnalyticsPreference(listener: () => void) {
  return getClient()?.subscribe(listener) ?? (() => undefined);
}
export function getAnalyticsSessionId(): string | undefined {
  return getClient()?.getSessionId();
}
export function markAnalyticsJourneyComplete() {
  getClient()?.completeJourney();
}
export function flushAnalytics() {
  getClient()?.flush();
}
