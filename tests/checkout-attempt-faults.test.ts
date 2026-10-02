import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type Stripe from "stripe";
import {
  beginCheckout,
  type CheckoutDependencies,
} from "../lib/server/checkout-attempts";
import { checkoutAttemptId } from "../lib/checkout-intent";
import { DEFAULT_SETTINGS, RENDERER_VERSION } from "../lib/renderers";
import { getCatalogue } from "../lib/server/catalog";
import { getRecord, putRecord, listRecords } from "../lib/server/store";
import { digest } from "../lib/server/security";
import type { CheckoutAttempt, Design } from "../lib/server/schema";

async function isolated(work: () => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "sr-checkout-faults-"));
  const env = {
    STUDIO_DATA_DIR: directory,
    ALLOW_LOCAL_DEVELOPMENT_STORAGE: "true",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    R2_ACCOUNT_ID: "",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    ORDER_ACCESS_KEY_ID: "test",
    ORDER_ACCESS_KEYS: JSON.stringify({
      test: "synthetic-checkout-test-key-not-a-real-secret",
    }),
    PHYSICALLY_VALIDATED_MODES: "dots",
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
  try {
    await work();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(resolved, { recursive: true, force: true });
  }
}
async function fixture() {
  let now = Date.now(),
    productions = 0;
  const token = "synthetic-private-proof-token-for-tests-only",
    designId = randomUUID(),
    proofHash = digest("accepted artwork proof");
  const source = {
    key: `designs/${designId}/original.png`,
    bytes: 123,
    sha256: digest("source"),
    mime: "image/png",
  };
  const design: Design = {
    id: designId,
    tokenHash: digest(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 86400000).toISOString(),
    mode: "dots",
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    settings: { ...DEFAULT_SETTINGS, widthMm: 300, heightMm: 400 },
    source,
    rightsConfirmed: true,
    marketingConsent: false,
    warnings: [],
    rendererVersion: RENDERER_VERSION,
  };
  await putRecord("designs", designId, design, true);
  const body = {
    attemptId: await checkoutAttemptId(designId, proofHash, "standard"),
    designId,
    token,
    proofApproved: true as const,
    proofHash,
    shippingId: "standard" as const,
  };
  const requests: {
    key: string;
    params: Stripe.Checkout.SessionCreateParams;
  }[] = [];
  const session = (
    params: Stripe.Checkout.SessionCreateParams,
  ): Stripe.Checkout.Session =>
    ({
      id: "cs_test_synthetic",
      mode: "payment",
      client_reference_id: params.client_reference_id,
      metadata: params.metadata,
      status: "open",
      payment_status: "unpaid",
      url: "https://checkout.stripe.com/test-synthetic",
    }) as Stripe.Checkout.Session;
  const deps: CheckoutDependencies = {
    now: () => now,
    gates: () => [],
    credentialHash: () => digest("synthetic-test-provider"),
    catalogue: async () => ({ ...(await getCatalogue()), prototype: false }),
    produce: async (
      _design,
      orderId,
      _settings,
      _crop,
      accepted,
      lifecycle,
    ) => {
      productions++;
      assert.equal(accepted, proofHash);
      const assets = [
        "source.png",
        "template.svg",
        "finished.svg",
        "artwork.zip",
      ].map((name) => ({ ...source, key: `orders/${orderId}/${name}` }));
      await lifecycle!.beforeWrite(assets);
      return {
        archive: assets[3],
        templateSvg: assets[1],
        finishedSvg: assets[2],
        source: assets[0],
        manifest: {},
        snapshotHash: proofHash,
      };
    },
    createSession: async (params, key) => {
      requests.push({ key, params });
      return session(params);
    },
    retrieveSession: async () => session(requests[0].params),
  };
  return {
    body,
    deps,
    requests,
    session,
    productions: () => productions,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("checkout retry after a lost Stripe response reuses immutable parameters, key, package and order", async () =>
  isolated(async () => {
    const f = await fixture();
    let interrupt = true;
    const create = f.deps.createSession;
    f.deps.createSession = async (...args) => {
      const result = await create(...args);
      if (interrupt) {
        interrupt = false;
        throw new Error("response lost after provider accepted");
      }
      return result;
    };
    await assert.rejects(
      beginCheckout(f.body, f.deps),
      /payment response was interrupted/,
    );
    const retry = await beginCheckout(f.body, f.deps);
    assert.equal(retry.status, "ready");
    assert.equal(f.productions(), 1);
    assert.equal(f.requests.length, 2);
    assert.deepEqual(f.requests[0], f.requests[1]);
    const again = await beginCheckout(f.body, f.deps);
    assert.deepEqual(again, retry);
    assert.equal(f.requests.length, 2);
    assert.equal(
      (await listRecords("orders")).length,
      0,
      "Only a verified webhook may create the paid order",
    );
  }));

test("simultaneous checkout requests share one in-flight production job and one provider session", async () =>
  isolated(async () => {
    const f = await fixture();
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      seen = new Promise<void>((r) => {
        started = r;
      });
    const produce = f.deps.produce;
    f.deps.produce = async (...args) => {
      started();
      await gate;
      return produce(...args);
    };
    const first = beginCheckout(f.body, f.deps);
    await seen;
    const second = await beginCheckout(f.body, f.deps);
    assert.equal(second.status, "processing");
    release();
    const ready = await first;
    assert.equal(ready.status, "ready");
    assert.equal(ready.orderId, second.orderId);
    assert.equal(f.productions(), 1);
    assert.equal(f.requests.length, 1);
  }));

test("interrupted production times out conservatively and never starts a second payment", async () =>
  isolated(async () => {
    const f = await fixture(),
      produce = f.deps.produce;
    f.deps.produce = async (...args) => {
      await produce(...args);
      throw new Error("storage acknowledgement interrupted");
    };
    await assert.rejects(
      beginCheckout(f.body, f.deps),
      /storage acknowledgement/,
    );
    assert.equal((await beginCheckout(f.body, f.deps)).status, "processing");
    f.advance(21 * 60000);
    await assert.rejects(beginCheckout(f.body, f.deps), /closed/);
    const attempt = await getRecord<CheckoutAttempt>(
      "checkout-attempts",
      f.body.attemptId,
    );
    assert.equal(attempt?.state, "closed");
    assert.equal(attempt?.assets.length, 4);
    assert.equal(f.requests.length, 0);
    assert.equal(f.productions(), 1);
  }));

test("wrong session identity and changed proof or provider credentials fail closed", async () =>
  isolated(async () => {
    const f = await fixture();
    await beginCheckout(f.body, f.deps);
    await assert.rejects(
      beginCheckout({ ...f.body, proofHash: digest("changed") }, f.deps),
      /original checkout attempt/,
    );
    await assert.rejects(
      beginCheckout(f.body, {
        ...f.deps,
        credentialHash: () => digest("changed credentials"),
      }),
      /payment configuration changed/,
    );
    await assert.rejects(
      beginCheckout(f.body, {
        ...f.deps,
        retrieveSession: async () => ({
          ...f.session(f.requests[0].params),
          client_reference_id: "different-order",
        }),
      }),
      /does not match/,
    );
    assert.equal(f.requests.length, 1);
    assert.equal((await listRecords("orders")).length, 0);
  }));

test("unknown payment outcomes beyond the retry window require reconciliation and cannot start fresh", async () =>
  isolated(async () => {
    const f = await fixture();
    f.deps.createSession = async () => {
      throw new Error("unknown outcome");
    };
    await assert.rejects(beginCheckout(f.body, f.deps), /interrupted/);
    f.advance(23 * 3600000);
    await assert.rejects(beginCheckout(f.body, f.deps), /reconciliation/);
    assert.equal(
      (await getRecord<CheckoutAttempt>("checkout-attempts", f.body.attemptId))
        ?.state,
      "needs-review",
    );
  }));
