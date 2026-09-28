import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  RENDERER_VERSION,
  type RenderSettings,
} from "../lib/renderers";
import { updateOrder, applyReviewAction } from "../lib/server/admin";
import { getRecord, putRecord } from "../lib/server/store";
import { orderAccessToken } from "../lib/server/order-access";
import { ApiError, digest } from "../lib/server/security";
import type { Design, Order, Package } from "../lib/server/schema";
import type { PrivateAsset } from "../lib/server/assets";

async function isolated(work: () => Promise<void>) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "slow-reveal-admin-inversion-"),
  );
  const env = {
    STUDIO_DATA_DIR: directory,
    ALLOW_LOCAL_DEVELOPMENT_STORAGE: "true",
    NODE_ENV: "development",
    NEXT_PUBLIC_SITE_URL: "http://localhost",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    R2_ACCOUNT_ID: "",
    RESEND_API_KEY: "",
    PHYSICAL_VALIDATION_APPROVED: "false",
    PHYSICALLY_VALIDATED_MODES: "dots",
    ORDER_ACCESS_KEYS: JSON.stringify({
      qa: "isolated-inversion-fixture-access-key-123456789",
    }),
    ORDER_ACCESS_KEY_ID: "qa",
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
  try {
    await work();
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(
      path.basename(directory).startsWith("slow-reveal-admin-inversion-"),
    );
    await rm(directory, { recursive: true, force: true });
  }
}

function asset(key: string, mime: string): PrivateAsset {
  return { key, mime, bytes: 1, sha256: digest(key) };
}

/** A package stub isolates the regeneration decision from paid rendering and storage. */
async function packageStub(
  design: Design,
  orderId: string,
  settings = design.settings,
  _crop = design.crop,
  _expectedProofHash?: string,
  _lifecycle?: unknown,
): Promise<Package> {
  const revisionId = randomUUID(),
    prefix = `orders/${orderId}/${revisionId}`;
  return {
    archive: asset(`${prefix}/archive.zip`, "application/zip"),
    templateSvg: asset(`${prefix}/template.svg`, "image/svg+xml"),
    finishedSvg: asset(`${prefix}/finished.svg`, "image/svg+xml"),
    source: design.source,
    manifest: { revisionId },
    snapshotHash: digest(JSON.stringify(settings)),
  };
}

async function paid(
  historicalInverted = false,
  inkColor = "#233b56",
  historicalProofRequired = true,
): Promise<Order> {
  const id = randomUUID(),
    createdAt = "2026-09-28T00:00:00.000Z";
  const settings: RenderSettings = {
    ...DEFAULT_SETTINGS,
    widthMm: 30,
    heightMm: 40,
    safeMarginMm: 1,
    inkColor,
  };
  const design: Design = {
    id: randomUUID(),
    createdAt,
    expiresAt: "2099-01-01T00:00:00.000Z",
    tokenHash: digest("fixture"),
    mode: "dots",
    productId: "fixture",
    finishId: "rolled",
    inkId: "navy",
    settings,
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    source: asset(`orders/${id}/original.png`, "image/png"),
    rightsConfirmed: true,
    marketingConsent: false,
    warnings: [],
    rendererVersion: RENDERER_VERSION,
  };
  const production = await packageStub(design, id),
    tokenHash = digest(orderAccessToken(id, "qa"));
  const originalSnapshot = {
    id,
    tokenHash,
    accessKeyId: "qa",
    createdAt,
    design,
    package: production,
    amountPence: 4900,
    shippingId: "standard",
    sessionId: `cs_fixture_${id}`,
  };
  const order: Order = {
    id,
    tokenHash,
    createdAt,
    stripeSessionId: originalSnapshot.sessionId,
    paymentStatus: "paid",
    amountPence: 4900,
    currency: "gbp",
    originalSnapshot,
    reviewStatus: "approved",
    revisions: [],
    currentRevisionId: String(production.manifest.revisionId),
    approvedRevisionId: String(production.manifest.revisionId),
    audit: [],
    customerEmail: "fixture@example.test",
  };
  if (historicalInverted) {
    const historicSettings = { ...settings, invert: true };
    const historicPackage = await packageStub(design, id, historicSettings);
    const revisionId = String(historicPackage.manifest.revisionId);
    order.revisions.push({
      id: revisionId,
      createdAt,
      package: historicPackage,
      settings: historicSettings,
      crop: design.crop,
      note: "Historical fixture",
      customerProofRequired: historicalProofRequired,
    });
    order.currentRevisionId = revisionId;
    order.approvedRevisionId = revisionId;
    order.customerProofApprovals = [
      {
        revisionId,
        snapshotHash: historicPackage.snapshotHash,
        approvedAt: createdAt,
      },
    ];
  }
  await putRecord("orders", id, order, true);
  return (await getRecord<Order>("orders", id))!;
}

const inversionConflict = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 409 &&
  /Inverted dark-canvas production is not supported/.test(error.message);

test("paid regeneration cannot enable inversion, even with physical approval, before production or persistence", async () =>
  isolated(async () => {
    for (const approved of ["false", "true"])
      for (const inkColor of ["#1e1e1c", "#233b56", "#68442f", "#354e3b"]) {
        process.env.PHYSICAL_VALIDATION_APPROVED = approved;
        const order = await paid(false, inkColor),
          before = JSON.stringify(order);
        let produced = 0,
          notified = 0;
        await assert.rejects(
          updateOrder(
            order.id,
            {
              action: "regenerate",
              revision: order.currentRevisionId,
              settings: {
                ...order.originalSnapshot.design.settings,
                invert: true,
              },
            },
            async () => {
              notified++;
              return true;
            },
            async (...args) => {
              produced++;
              return packageStub(...args);
            },
          ),
          inversionConflict,
        );
        assert.equal(produced, 0);
        assert.equal(notified, 0);
        assert.equal(
          JSON.stringify(await getRecord<Order>("orders", order.id)),
          before,
        );
      }
  }));

test("historical inversion cannot be silently reused when regeneration omits settings", async () =>
  isolated(async () => {
    const order = await paid(true, "#233b56", false),
      before = JSON.stringify(order);
    let produced = 0;
    await assert.rejects(
      updateOrder(
        order.id,
        { action: "regenerate" },
        async () => true,
        async (...args) => {
          produced++;
          return packageStub(...args);
        },
      ),
      inversionConflict,
    );
    assert.equal(produced, 0);
    assert.equal(
      JSON.stringify(await getRecord<Order>("orders", order.id)),
      before,
    );
  }));

test("reverting a historical inverted revision appends a fresh immutable customer proof even when guide colour is unchanged", async () =>
  isolated(async () => {
    const order = await paid(true, "#233b56", false),
      original = structuredClone(order.originalSnapshot),
      historical = structuredClone(order.revisions[0]);
    // This historical revision was already customer-approved; that approval cannot cover the new substrate/tone change.
    let produced = 0;
    const result = await updateOrder(
      order.id,
      {
        action: "regenerate",
        revision: order.currentRevisionId,
        settings: { ...historical.settings, invert: false },
      },
      async () => true,
      async (...args) => {
        produced++;
        return packageStub(...args);
      },
    );
    assert.equal(produced, 1);
    const revised = result.order.revisions.at(-1)!;
    assert.equal(revised.settings.invert, false);
    assert.equal(revised.settings.inkColor, historical.settings.inkColor);
    assert.equal(revised.customerProofRequired, true);
    assert.equal(result.order.revisions.length, 2);
    assert.deepEqual(result.order.originalSnapshot, original);
    assert.deepEqual(result.order.revisions[0], historical);
    assert.deepEqual(
      result.order.customerProofApprovals,
      order.customerProofApprovals,
    );
    assert.equal(result.order.approvedRevisionId, undefined);
    assert.equal(result.order.currentRevisionId, revised.id);
    assert.equal(result.order.reviewStatus, "awaiting-review");
    assert.equal(result.notification?.type, "revised-proof");
    assert.equal(result.notification?.status, "sent");
    for (const action of ["approve", "dispatch"] as const)
      assert.throws(
        () => applyReviewAction(result.order, action, "reviewed"),
        (error: unknown) =>
          error instanceof ApiError &&
          error.status === 409 &&
          /customer must approve/.test(error.message),
      );
  }));

test("historical inverted artwork cannot be approved or dispatched; hold and repair remain available", async () =>
  isolated(async () => {
    const order = await paid(true),
      before = JSON.stringify(order);
    for (const approved of ["false", "true"]) {
      process.env.PHYSICAL_VALIDATION_APPROVED = approved;
      for (const action of ["approve", "dispatch"] as const) {
        assert.throws(
          () =>
            applyReviewAction(order, action, "reviewed", "fixture tracking"),
          inversionConflict,
        );
        await assert.rejects(
          updateOrder(
            order.id,
            { action, tracking: "fixture tracking" },
            async () => true,
            packageStub,
          ),
          (error: unknown) => error instanceof ApiError && error.status === 409,
        );
        assert.equal(
          JSON.stringify(await getRecord<Order>("orders", order.id)),
          before,
        );
      }
    }
    const invertedOriginal: Order = {
      ...order,
      revisions: [],
      originalSnapshot: {
        ...order.originalSnapshot,
        design: {
          ...order.originalSnapshot.design,
          settings: { ...order.originalSnapshot.design.settings, invert: true },
        },
      },
    };
    for (const action of ["approve", "dispatch"] as const)
      assert.throws(
        () =>
          applyReviewAction(
            invertedOriginal,
            action,
            "reviewed",
            "fixture tracking",
          ),
        inversionConflict,
      );
    assert.equal(
      applyReviewAction(order, "hold", "Needs substrate repair").reviewStatus,
      "hold",
    );
    assert.equal(
      applyReviewAction(order, "request-photo", "Review alternate source")
        .reviewStatus,
      "alternate-photo-requested",
    );
    assert.equal(JSON.stringify(order), before);
  }));
