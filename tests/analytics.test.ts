import assert from "node:assert/strict";
import test from "node:test";
import {
  createAnalyticsClient,
  sanitizeAnalyticsFields,
  type AnalyticsBatch,
  type AnalyticsEnvironment,
  type AnalyticsFields,
} from "../lib/analytics";

function harness(initialPreference: string | null = null) {
  let preference = initialPreference,
    tab: string | null = null,
    now = 1_700_000_000_000;
  let generated = 0;
  const batches: AnalyticsBatch[] = [],
    signals: AbortSignal[] = [];
  const timers = new Set<() => void>();
  const environment: AnalyticsEnvironment = {
    readPreference: () => preference,
    writePreference: (value) => {
      preference = value;
    },
    readSession: () => tab,
    writeSession: (value) => {
      tab = value;
    },
    clearSession: () => {
      tab = null;
    },
    randomUUID: () => {
      generated++;
      return `00000000-0000-4000-8000-${String(generated).padStart(12, "0")}`;
    },
    now: () => now,
    send: async (batch, signal) => {
      batches.push(batch);
      signals.push(signal);
    },
    setTimer: (callback) => {
      timers.add(callback);
      return callback as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (timer) => {
      timers.delete(timer as unknown as () => void);
    },
  };
  return {
    environment,
    batches,
    signals,
    tick: () => {
      now += 2000;
    },
    generated: () => generated,
    tab: () => tab,
    preference: () => preference,
  };
}

test("unknown and declined preferences send nothing and create no session identifier", () => {
  for (const initial of [null, "declined", "invalid"] as const) {
    const h = harness(initial),
      c = createAnalyticsClient(h.environment);
    c.track("builder_opened", { mode: "dots", productId: "40x50" });
    c.track("upload_started");
    c.flush();
    c.onPageExit();
    assert.equal(c.getSessionId(), undefined);
    assert.equal(h.generated(), 0);
    assert.equal(h.tab(), null);
    assert.deepEqual(h.batches, []);
  }
});

test("consent begins a tab session without replaying pre-consent actions", () => {
  const h = harness(),
    c = createAnalyticsClient(h.environment);
  c.track("upload_started");
  c.setPreference("allowed");
  c.track("upload_completed", { mode: "dots", productId: "40x50" });
  c.flush();
  assert.equal(h.preference(), "allowed");
  assert.equal(h.generated(), 1);
  assert.equal(h.batches.length, 1);
  assert.equal(h.batches[0].consent, true);
  assert.equal(h.batches[0].events[0].event, "upload_completed");
  assert.equal(h.batches[0].sessionId, c.getSessionId());
  assert.equal(
    createAnalyticsClient(h.environment).getSessionId(),
    c.getSessionId(),
  );
  assert.equal(h.generated(), 1);
});

test("untrusted fields cannot carry customer information through allowed dimensions", () => {
  const hostile = {
    mode: "dogs/secret.jpg",
    productId: "customer@email.test",
    step: "Order for Jane",
    preset: "My wedding photo",
    text: "Private inscription",
    url: "https://host/private?token=abc",
    sourceAssetId: "asset-secret",
    token: "secret",
    email: "secret@test",
  } as unknown as AnalyticsFields;
  assert.deepEqual(sanitizeAnalyticsFields(hostile), {});
  const h = harness("allowed"),
    c = createAnalyticsClient(h.environment);
  c.track("personalisation_added", hostile);
  c.flush();
  assert.deepEqual(Object.keys(h.batches[0].events[0]), ["event", "timestamp"]);
  assert.ok(!JSON.stringify(h.batches).includes("secret"));
  assert.deepEqual(
    sanitizeAnalyticsFields({
      ...hostile,
      mode: "dots",
      productId: "30x40",
      preset: "portrait",
      step: "personalise",
    }),
    {
      mode: "dots",
      productId: "30x40",
      step: "personalise",
      preset: "portrait",
    },
  );
});

test("browser cannot manufacture payment-completed analytics", () => {
  const h = harness("allowed"),
    c = createAnalyticsClient(h.environment);
  c.track("payment_completed", { mode: "dots", productId: "40x50" });
  c.flush();
  assert.deepEqual(h.batches, []);
});

test("withdrawal clears pending events and tab identity, and aborts outstanding sends", () => {
  const h = harness("allowed"),
    c = createAnalyticsClient(h.environment);
  c.track("builder_opened");
  c.flush();
  c.track("upload_started");
  const oldId = c.getSessionId();
  c.setPreference("declined");
  c.flush();
  c.onPageExit();
  assert.equal(h.batches.length, 1);
  assert.equal(h.signals[0].aborted, true);
  assert.equal(h.tab(), null);
  assert.equal(c.getSessionId(), undefined);
  c.setPreference("allowed");
  assert.notEqual(c.getSessionId(), oldId);
});

test("bursts are deduplicated and batches stay within the endpoint limit", () => {
  const h = harness("allowed"),
    c = createAnalyticsClient(h.environment);
  for (let i = 0; i < 25; i++) {
    c.track("crop_completed", { mode: "dots" });
    c.track("crop_completed", { mode: "dots" });
    h.tick();
  }
  c.flush();
  assert.deepEqual(
    h.batches.map((b) => b.events.length),
    [20, 5],
  );
  for (let i = 0; i < 250; i++) {
    h.tick();
    c.track("crop_completed");
  }
  c.flush();
  assert.equal(h.batches.flatMap((b) => b.events).length, 200);
});

test("page exit records only the latest safe step once and respects successful redirect", () => {
  const h = harness("allowed"),
    c = createAnalyticsClient(h.environment);
  c.track("builder_opened", {
    mode: "dots",
    productId: "40x50",
    step: "photo",
  });
  c.track("preset_selected", { preset: "easy", step: "detail" });
  c.onPageExit();
  c.onPageExit();
  const abandonment = h.batches
    .flatMap((b) => b.events)
    .filter((e) => e.event === "abandonment_step");
  assert.equal(abandonment.length, 1);
  assert.equal(abandonment[0].step, "detail");
  assert.equal(abandonment[0].mode, "dots");
  h.tick();
  c.track("builder_opened");
  c.track("checkout_started");
  c.completeJourney();
  c.onPageExit();
  assert.equal(
    h.batches
      .flatMap((b) => b.events)
      .filter((e) => e.event === "abandonment_step").length,
    1,
  );
});
