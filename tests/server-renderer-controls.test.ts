import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import {
  DEFAULT_SETTINGS,
  RENDERER_VERSION,
  normalizeSettings,
  type RenderSettings,
} from "../lib/renderers";
import {
  settingsSchema,
  type Design,
  type Order,
  type Package,
} from "../lib/server/schema";
import { saveDesign, authorizedDesign } from "../lib/server/designs";
import { getAsset, putAsset } from "../lib/server/assets";
import { getRecord, putRecord } from "../lib/server/store";
import {
  createProductionPackage,
  proofHash,
  renderDesign,
} from "../lib/server/production";
import {
  createPreset,
  publishedPresets,
  updatePreset,
} from "../lib/server/presets";
import { presetSettings } from "../lib/preset-types";
import { updateOrder, applyReviewAction } from "../lib/server/admin";
import { orderAccessToken } from "../lib/server/order-access";
import { digest, ApiError } from "../lib/server/security";
import type { AdminIdentity } from "../lib/server/admin-auth";

const crop = { zoom: 1, x: 0, y: 0, rotation: 0 as const };
const operator: AdminIdentity = {
  kind: "local-token",
  userId: "fixture-operator",
  role: "operator",
};
const conflict = (error: unknown) =>
  error instanceof ApiError && error.status === 409;
async function isolated(work: () => Promise<void>) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "slow-reveal-guide-controls-"),
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
    STRIPE_SECRET_KEY: "",
    PHYSICAL_VALIDATION_APPROVED: "false",
    LIVE_CHECKOUT_ENABLED: "false",
    ORDER_ACCESS_KEYS: JSON.stringify({
      qa: "isolated-renderer-control-access-key-123456789",
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
    await rm(directory, { recursive: true, force: true });
  }
}
async function photo() {
  const bytes = Buffer.alloc(64 * 64 * 3);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      bytes.fill(
        (Math.floor(x / 3) + Math.floor(y / 5)) % 2 ? 40 : 180,
        (y * 64 + x) * 3,
        (y * 64 + x) * 3 + 3,
      );
  return sharp(bytes, { raw: { width: 64, height: 64, channels: 3 } })
    .png()
    .toBuffer();
}
async function fixture(patch: Partial<RenderSettings> = {}): Promise<Design> {
  const id = randomUUID();
  return {
    id,
    tokenHash: digest("fixture"),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    mode: "dots",
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
    crop,
    settings: {
      ...DEFAULT_SETTINGS,
      widthMm: 30,
      heightMm: 40,
      safeMarginMm: 1,
      spacingMm: 2,
      minDiameterMm: 0.5,
      maxDiameterMm: 1.5,
      ...patch,
    },
    source: await putAsset(
      `designs/${id}/source.png`,
      await photo(),
      "image/png",
    ),
    rightsConfirmed: true,
    marketingConsent: false,
    warnings: [],
    rendererVersion: RENDERER_VERSION,
  };
}
async function stub(
  design: Design,
  id: string,
  settings = design.settings,
  nextCrop = design.crop,
): Promise<Package> {
  const revisionId = randomUUID(),
    base = `orders/${id}/${revisionId}`;
  return {
    source: await putAsset(
      `${base}/source.png`,
      await getAsset(design.source),
      "image/png",
    ),
    archive: await putAsset(
      `${base}/archive.zip`,
      Buffer.from("fixture"),
      "application/zip",
    ),
    finishedSvg: await putAsset(
      `${base}/finished.svg`,
      Buffer.from("<svg/>"),
      "image/svg+xml",
    ),
    templateSvg: await putAsset(
      `${base}/template.svg`,
      Buffer.from("<svg/>"),
      "image/svg+xml",
    ),
    manifest: { revisionId },
    snapshotHash: digest(JSON.stringify({ settings, crop: nextCrop })),
  };
}
async function paid(design: Design): Promise<Order> {
  const id = randomUUID(),
    tokenHash = digest(orderAccessToken(id, "qa"));
  const artwork = await stub(design, id);
  const checkout = {
    id,
    tokenHash,
    accessKeyId: "qa",
    createdAt: new Date().toISOString(),
    design: { ...design, source: artwork.source },
    package: artwork,
    amountPence: 4900,
    shippingId: "standard",
    sessionId: `cs_fixture_${id}`,
  };
  const order: Order = {
    id,
    tokenHash,
    createdAt: checkout.createdAt,
    stripeSessionId: checkout.sessionId,
    paymentStatus: "paid",
    amountPence: 4900,
    currency: "gbp",
    originalSnapshot: checkout,
    reviewStatus: "awaiting-review",
    revisions: [],
    currentRevisionId: String(artwork.manifest.revisionId),
    audit: [],
    customerEmail: "fixture@example.test",
  };
  await putRecord("orders", id, order, true);
  return (await getRecord<Order>("orders", id))!;
}

test("server saves and published presets normalize new controls, preserve legacy defaults and reject invalid inputs", async () =>
  isolated(async () => {
    const legacy = {
      ...DEFAULT_SETTINGS,
      detailPreservation: undefined,
      guideColor: undefined,
    };
    assert.equal(
      normalizeSettings(settingsSchema.parse(legacy)).detailPreservation,
      0,
    );
    assert.equal(
      normalizeSettings(settingsSchema.parse(legacy)).guideColor,
      undefined,
    );
    const bytes = await photo();
    const body = {
      mode: "dots",
      productId: "30x40",
      finishId: "rolled",
      inkId: "black",
      crop,
      settings: {
        ...DEFAULT_SETTINGS,
        widthMm: 300,
        heightMm: 400,
        detailPreservation: 0.65,
        guideColor: "#ABCDEF",
      },
      source: { dataUrl: `data:image/png;base64,${bytes.toString("base64")}` },
      rightsConfirmed: true,
    };
    const saved = await saveDesign(body);
    const design = await authorizedDesign(saved.id, saved.token);
    assert.equal(design.settings.detailPreservation, 0.65);
    assert.equal(design.settings.guideColor, "#abcdef");
    for (const patch of [
      { detailPreservation: -0.01 },
      { detailPreservation: 1.01 },
      { detailPreservation: NaN },
      { detailPreservation: Infinity },
      { detailPreservation: "0.5" },
      { guideColor: "red" },
      { guideColor: "#abc" },
      { guideColor: "#12345678" },
      { guideColor: "url(https://example.invalid)" },
      { guideColor: null },
    ]) {
      await assert.rejects(
        saveDesign({ ...body, settings: { ...body.settings, ...patch } }),
      );
      await assert.rejects(
        createPreset(
          {
            name: "Invalid controls",
            mode: "dots",
            settings: { ...presetSettings(DEFAULT_SETTINGS), ...patch },
          },
          operator,
        ),
      );
    }
    let preset = await createPreset(
      {
        name: "Reviewed guide",
        mode: "dots",
        settings: presetSettings(design.settings),
      },
      operator,
    );
    preset = await updatePreset(
      preset.id,
      { action: "publish", version: 1, expectedRevision: preset.revision },
      operator,
    );
    const published = (await publishedPresets("dots")).presets.find(
      (item) => item.id === preset.id,
    )!;
    assert.equal(published.settings.detailPreservation, 0.65);
    assert.equal(published.settings.guideColor, "#abcdef");
    assert.equal(JSON.stringify(published).includes(operator.userId), false);
    const initial = structuredClone(preset.versions[0]);
    const revised = await updatePreset(
      preset.id,
      {
        action: "revise",
        expectedRevision: preset.revision,
        name: "Inherited guide",
        settings: {
          ...presetSettings(DEFAULT_SETTINGS),
          detailPreservation: 0,
        },
      },
      operator,
    );
    assert.deepEqual(revised.versions[0], initial);
    assert.equal(revised.versions[1].settings.guideColor, undefined);
    assert.equal(
      (await publishedPresets("dots")).presets[0].settings.guideColor,
      "#abcdef",
    );
  }));

test("production proofs and package manifests bind detail and actual guide colour including legacy inversion", async () =>
  isolated(async () => {
    const design = await fixture({
      detailPreservation: undefined,
      guideColor: undefined,
    });
    const baseline = await renderDesign(design);
    const detail = await renderDesign(design, {
      ...design.settings,
      detailPreservation: 0.8,
    });
    const colour = await renderDesign(design, {
      ...design.settings,
      guideColor: "#ABCDEF",
    });
    assert.notEqual(
      proofHash(design, baseline.geometry),
      proofHash(design, detail.geometry),
    );
    assert.notEqual(
      proofHash(design, baseline.geometry),
      proofHash(design, colour.geometry),
    );
    const selected = {
      ...design.settings,
      detailPreservation: 0.8,
      guideColor: "#ABCDEF",
    };
    const production = await createProductionPackage(
      design,
      randomUUID(),
      selected,
    );
    assert.equal(production.manifest.detailPreservation, 0.8);
    assert.equal(production.manifest.requestedGuideColor, "#ABCDEF");
    assert.equal(production.manifest.effectiveGuideColor, "#abcdef");
    assert.match(
      (await getAsset(production.templateSvg)).toString(),
      /stroke="#abcdef"/,
    );
    const archive = await JSZip.loadAsync(await getAsset(production.archive));
    const geometry = JSON.parse(
      await archive.file("geometry.json")!.async("text"),
    );
    assert.equal(geometry.settings.guideColor, "#abcdef");
    assert.equal(geometry.settings.detailPreservation, 0.8);
    assert.equal(geometry.version, RENDERER_VERSION);
    await assert.rejects(
      createProductionPackage(
        design,
        randomUUID(),
        selected,
        crop,
        proofHash(design, baseline.geometry),
      ),
      conflict,
    );
    const inverted = {
      ...design,
      settings: { ...design.settings, invert: true },
    };
    const inherited = await createProductionPackage(inverted, randomUUID());
    assert.equal(inherited.manifest.detailPreservation, 0);
    assert.equal(inherited.manifest.requestedGuideColor, null);
    assert.equal(inherited.manifest.effectiveGuideColor, "#f4efe6");
    assert.match(
      (await getAsset(inherited.templateSvg)).toString(),
      /stroke="#f4efe6"/,
    );
  }));

test("admin creative, detail and effective guide changes require fresh customer proof without mutating paid artwork", async () =>
  isolated(async () => {
    const legacy = await fixture({
      detailPreservation: undefined,
      guideColor: undefined,
    });
    for (const patch of [
      { colourCompensation: 0.4 },
      { shadowLift: 0.2 },
      { focusBrightness: 0.1 },
      { focusDetail: 0.8 },
      { focusX: 0.2 },
      { spiralX: 0.25 },
      { compositionShape: "circle" as const },
      { linePattern: "spiral" as const },
      { palette: ["#112233", "#bb8877"] },
      { detailPreservation: 0.5 },
      { guideColor: "#AABBCC" },
    ]) {
      const original = await paid(legacy);
      const originalSnapshot = structuredClone(original.originalSnapshot);
      const changed = await updateOrder(
        original.id,
        {
          action: "regenerate",
          revision: original.currentRevisionId,
          settings: { ...legacy.settings, ...patch },
        },
        async () => true,
        stub,
      );
      assert.equal(changed.order.revisions[0].customerProofRequired, true);
      assert.equal(changed.notification?.type, "revised-proof");
      assert.equal(changed.notification?.status, "sent");
      assert.equal(changed.order.approvedRevisionId, undefined);
      assert.throws(
        () => applyReviewAction(changed.order, "approve", "reviewed"),
        conflict,
      );
      assert.deepEqual(changed.order.originalSnapshot, originalSnapshot);
      const firstRevision = structuredClone(changed.order.revisions[0]);
      await updateOrder(
        original.id,
        { action: "regenerate" },
        async () => true,
        stub,
      );
      const stored = (await getRecord<Order>("orders", original.id))!;
      assert.deepEqual(stored.revisions[0], firstRevision);
      assert.equal(stored.revisions[1].customerProofRequired, true);
    }
    // Explicit inherited colour, hex case and an explicit legacy zero are visually unchanged.
    for (const design of [legacy]) {
      const order = await paid(design);
      const equivalent = design.settings.invert
        ? "#F4EFE6"
        : design.settings.inkColor.toUpperCase();
      const same = await updateOrder(
        order.id,
        {
          action: "regenerate",
          settings: {
            ...design.settings,
            detailPreservation: 0,
            guideColor: equivalent,
          },
        },
        async () => true,
        stub,
      );
      assert.equal(
        Boolean(same.order.revisions[0].customerProofRequired),
        false,
      );
      assert.equal(same.notification, undefined);
    }
    const custom = await fixture({ guideColor: "#556677" });
    const order = await paid(custom);
    const reverted = await updateOrder(
      order.id,
      {
        action: "regenerate",
        settings: { ...custom.settings, guideColor: undefined },
      },
      async () => true,
      stub,
    );
    assert.equal(reverted.order.revisions[0].customerProofRequired, true);
    await assert.rejects(
      updateOrder(
        order.id,
        {
          action: "regenerate",
          settings: { ...custom.settings, detailPreservation: 2 },
        },
        async () => true,
        stub,
      ),
    );
  }));
