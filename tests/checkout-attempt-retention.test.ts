import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_SETTINGS, RENDERER_VERSION } from "../lib/renderers";
import { getAsset, putAsset, type PrivateAsset } from "../lib/server/assets";
import { deleteDesign } from "../lib/server/designs";
import {
  cleanupCheckoutAttempts,
  expireUnpaidDesigns,
} from "../lib/server/retention";
import {
  getRecord,
  putRecord,
  publishCheckoutAttempt,
  replaceCheckoutAttempt,
} from "../lib/server/store";
import type { Checkout, CheckoutAttempt, Design } from "../lib/server/schema";
import { ApiError, digest } from "../lib/server/security";

async function isolated(work: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "srs-attempt-retention-"),
  );
  const env = {
    STUDIO_DATA_DIR: directory,
    ALLOW_LOCAL_DEVELOPMENT_STORAGE: "true",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    R2_ACCOUNT_ID: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_BUCKET: "",
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
  try {
    await work(directory);
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(resolved, { recursive: true, force: true });
  }
}

async function fixture(
  state: CheckoutAttempt["state"] = "producing",
  expired = true,
) {
  const id = randomUUID(),
    orderId = randomUUID(),
    designId = randomUUID(),
    revisionId = randomUUID();
  const token = "synthetic-capability-for-local-retention-fixture";
  const bytes = Buffer.from("synthetic owned bytes");
  const source = await putAsset(
    `designs/${designId}/original.png`,
    bytes,
    "image/png",
  );
  const mask = await putAsset(
    `designs/${designId}/subject-mask.json`,
    Buffer.from("{}"),
    "application/json",
  );
  const design: Design = {
    id: designId,
    tokenHash: digest(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    mode: "dots",
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    settings: DEFAULT_SETTINGS,
    source,
    subjectMask: mask,
    rightsConfirmed: true,
    marketingConsent: false,
    warnings: [],
    rendererVersion: RENDERER_VERSION,
  };
  await putRecord("designs", designId, design, true);
  const assets: PrivateAsset[] = [
    "original.png",
    "template.svg",
    "finished.svg",
    "artwork.zip",
  ].map((name) => ({
    key: `orders/${orderId}/${revisionId}/${name}`,
    mime: "application/octet-stream",
    bytes: bytes.length,
    sha256: digest(bytes),
  }));
  const attempt: CheckoutAttempt = {
    id,
    version: 1,
    orderId,
    designId,
    designTokenHash: digest(token),
    inputHash: digest("input"),
    proofHash: digest("proof"),
    createdAt: new Date().toISOString(),
    productionExpiresAt: new Date(
      Date.now() + (expired ? -60000 : 60000),
    ).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    accessKeyId: "test",
    tokenHash: digest("order-capability"),
    amountPence: 4900,
    shippingId: "standard",
    sourceAssets: [source, mask],
    origin: "http://localhost",
    stripeCredentialHash: digest("synthetic-stripe-key"),
    idempotencyKey: `checkout-${orderId}`,
    stripeParams: { mode: "payment" },
    state,
    assets,
  };
  await putRecord("checkout-attempts", id, attempt, true);
  return { attempt, design, token, bytes, assets };
}
const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

test("durable output ledger removes lost-acknowledgement writes and resweeps late writers without deleting borrowed inputs", async () =>
  isolated(async () => {
    const { attempt, bytes, assets } = await fixture();
    await assert.rejects(async () => {
      await putAsset(assets[0].key, bytes, assets[0].mime);
      throw new Error("Storage committed but its acknowledgement was lost");
    }, /acknowledgement/);
    const first = await cleanupCheckoutAttempts();
    assert.equal(first.checkoutAttemptsClosed, 1);
    await assert.rejects(getAsset(assets[0]), missing);
    const closed = (await getRecord<CheckoutAttempt>(
      "checkout-attempts",
      attempt.id,
    ))!;
    assert.equal(closed.state, "closed");
    assert.deepEqual(closed.assets, assets);
    assert.ok(closed.cleanupCheckedAt);
    await putAsset(assets[3].key, bytes, assets[3].mime);
    await cleanupCheckoutAttempts();
    await assert.rejects(getAsset(assets[3]), missing);
    for (const source of attempt.sourceAssets)
      assert.ok((await getAsset(source)).length > 0);
    assert.ok(
      await getRecord("checkout-attempts", attempt.id),
      "closed tombstone is retained",
    );
  }));

test("active attempts protect design deletion and expiry in every unresolved state", async () =>
  isolated(async () => {
    for (const state of [
      "producing",
      "prepared",
      "submitting",
      "ready",
      "needs-review",
    ] as const) {
      const { design, token, attempt } = await fixture(state, false);
      await assert.rejects(
        deleteDesign(design.id, token),
        (error) => error instanceof ApiError && error.status === 409,
      );
      const expiredDesign = {
        ...design,
        id: randomUUID(),
        expiresAt: new Date(Date.now() - 60000).toISOString(),
      };
      await putRecord("designs", expiredDesign.id, expiredDesign, true);
      await expireUnpaidDesigns();
      assert.ok(await getRecord("designs", expiredDesign.id));
      for (const source of attempt.sourceAssets)
        assert.ok((await getAsset(source)).length > 0);
    }
    assert.equal((await cleanupCheckoutAttempts()).checkoutAttemptsClosed, 0);
  }));

test("an ambiguous checkout publication protects its outputs and closure fences a delayed publisher", async () =>
  isolated(async () => {
    const { attempt, design, bytes, assets } = await fixture();
    for (const asset of assets) await putAsset(asset.key, bytes, asset.mime);
    const checkout: Checkout = {
      id: attempt.orderId,
      attemptId: attempt.id,
      createdAt: attempt.createdAt,
      tokenHash: attempt.tokenHash,
      design: { ...design, source: assets[0], subjectMask: undefined },
      package: {
        source: assets[0],
        templateSvg: assets[1],
        finishedSvg: assets[2],
        archive: assets[3],
        manifest: { revisionId: assets[0].key.split("/")[2] },
        snapshotHash: attempt.proofHash,
      },
      amountPence: attempt.amountPence,
      shippingId: attempt.shippingId,
    };
    // Model a local crash after checkout insertion but before the attempt-state write.
    await putRecord("checkouts", checkout.id, checkout, true);
    await cleanupCheckoutAttempts();
    for (const asset of assets) assert.deepEqual(await getAsset(asset), bytes);
    await assert.rejects(
      publishCheckoutAttempt(
        attempt,
        { ...attempt, state: "prepared" },
        checkout,
      ),
      (error) => error instanceof ApiError && error.status === 409,
    );
    assert.deepEqual(
      await getRecord("checkouts", checkout.id),
      JSON.parse(JSON.stringify(checkout)),
    );
  }));

test("ownership lookup failure fails closed before deleting ledger assets", async () =>
  isolated(async (directory) => {
    const { attempt, assets, bytes, design } = await fixture();
    await putAsset(assets[0].key, bytes, assets[0].mime);
    await replaceCheckoutAttempt(attempt, {
      ...attempt,
      state: "closed",
      closedAt: new Date().toISOString(),
    });
    await writeFile(
      path.join(directory, "designs", `${design.id}.json`),
      "invalid json",
    );
    await assert.rejects(cleanupCheckoutAttempts());
    assert.deepEqual(await getAsset(assets[0]), bytes);
  }));
