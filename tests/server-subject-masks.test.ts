import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import { DEFAULT_SETTINGS, RENDERER_VERSION } from "../lib/renderers";
import {
  maskRasterDimensions,
  normalizeSubjectMask,
  type SubjectMask,
} from "../lib/subject-mask";
import {
  saveDesign,
  authorizedDesign,
  deleteDesign,
} from "../lib/server/designs";
import { getAsset, putAsset } from "../lib/server/assets";
import { getRecord, putRecord, replaceOrder } from "../lib/server/store";
import { ApiError, digest } from "../lib/server/security";
import {
  renderDesign,
  proofHash,
  createProductionPackage,
} from "../lib/server/production";
import { designSubjectMask } from "../lib/server/subject-masks";
import { createPresetSchema } from "../lib/server/presets";
import { presetSettings } from "../lib/preset-types";
import { analyticsSchema } from "../lib/server/analytics";
import { applyReviewAction, updateOrder } from "../lib/server/admin";
import { submitReplacement } from "../lib/server/replacements";
import {
  eraseOrderArtwork,
  expireUnpaidDesigns,
} from "../lib/server/retention";
import {
  orderArtworkAssets,
  packageAssets,
} from "../lib/server/artwork-assets";
import { orderAccessToken } from "../lib/server/order-access";
import type { Checkout, Design, Order, Package } from "../lib/server/schema";
import { GET as getDesign } from "../app/api/designs/[id]/route";

const crop = { zoom: 1, x: 0, y: 0, rotation: 0 as const };
const conflict = (error: unknown) =>
  error instanceof ApiError && error.status === 409;
const transport = async () => true;

async function isolated(work: () => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "slow-reveal-masks-"));
  const env = {
    STUDIO_DATA_DIR: directory,
    ALLOW_LOCAL_DEVELOPMENT_STORAGE: "true",
    NODE_ENV: "development",
    NEXT_PUBLIC_SITE_URL: "http://localhost",
    ORDER_ACCESS_KEYS: JSON.stringify({
      qa: "isolated-mask-access-secret-never-production-12345",
    }),
    ORDER_ACCESS_KEY_ID: "qa",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    R2_ACCOUNT_ID: "",
    STRIPE_SECRET_KEY: "",
    RESEND_API_KEY: "",
    LIVE_CHECKOUT_ENABLED: "false",
    PHYSICAL_VALIDATION_APPROVED: "false",
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
async function photograph(background = "#333333") {
  return sharp({ create: { width: 80, height: 100, channels: 3, background } })
    .png()
    .toBuffer();
}
function selection(
  bytes: Buffer,
  widthMm = 300,
  heightMm = 400,
  inverted = false,
): SubjectMask {
  const { width, height } = maskRasterDimensions(widthMm, heightMm);
  const data = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data[y * width + x] = x < width / 2 !== inverted ? 255 : 0;
  return normalizeSubjectMask({
    version: 1,
    space: "cropped-v1",
    sourceSha256: digest(bytes),
    crop,
    widthMm,
    heightMm,
    width,
    height,
    data: data.toString("base64"),
    feather: 0.01,
  });
}
function input(bytes: Buffer, mask?: SubjectMask, strength = 1) {
  return {
    mode: "dots",
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
    crop,
    settings: {
      ...DEFAULT_SETTINGS,
      widthMm: 300,
      heightMm: 400,
      subjectMaskStrength: strength,
    },
    source: { dataUrl: `data:image/png;base64,${bytes.toString("base64")}` },
    subjectMask: mask,
    rightsConfirmed: true,
    marketingConsent: false,
  };
}
async function packageStub(
  design: Design,
  id: string,
  settings = design.settings,
  nextCrop = design.crop,
): Promise<Package> {
  await designSubjectMask(design, settings, nextCrop);
  const revisionId = randomUUID();
  const base = `orders/${id}/${revisionId}`;
  const subjectMask = design.subjectMask
    ? await putAsset(
        `${base}/subject-mask.json`,
        await getAsset(design.subjectMask),
        "application/json",
      )
    : undefined;
  return {
    source: await putAsset(
      `${base}/source`,
      await getAsset(design.source),
      design.source.mime,
    ),
    subjectMask,
    archive: await putAsset(
      `${base}/archive`,
      Buffer.from("package fixture"),
      "application/zip",
    ),
    finishedSvg: await putAsset(
      `${base}/finished`,
      Buffer.from("<svg/>"),
      "image/svg+xml",
    ),
    templateSvg: await putAsset(
      `${base}/template`,
      Buffer.from("<svg/>"),
      "image/svg+xml",
    ),
    manifest: { revisionId, sourceWarnings: design.warnings },
    snapshotHash: digest(
      JSON.stringify({
        settings,
        crop: nextCrop,
        source: design.source.sha256,
        mask: subjectMask?.sha256,
      }),
    ),
  };
}
async function paid(design: Design) {
  const id = randomUUID();
  const token = orderAccessToken(id, "qa");
  const production = await packageStub(design, id);
  const checkout: Checkout = {
    id,
    createdAt: new Date().toISOString(),
    tokenHash: digest(token),
    accessKeyId: "qa",
    design: {
      ...design,
      source: production.source,
      subjectMask: production.subjectMask,
    },
    package: production,
    amountPence: 4900,
    shippingId: "standard",
    sessionId: `cs_fixture_${id}`,
  };
  const order: Order = {
    id,
    createdAt: checkout.createdAt,
    tokenHash: checkout.tokenHash,
    stripeSessionId: checkout.sessionId!,
    paymentStatus: "paid",
    amountPence: 4900,
    currency: "gbp",
    originalSnapshot: checkout,
    reviewStatus: "awaiting-review",
    revisions: [],
    currentRevisionId: String(production.manifest.revisionId),
    audit: [],
    customerEmail: "fixture@example.test",
  };
  await putRecord("orders", id, order, true);
  return { order, token };
}

test("private mask saves bind source, crop and authoritative dimensions; only the guest capability receives inline pixels", async () =>
  isolated(async () => {
    const bytes = await photograph();
    const mask = selection(bytes);
    for (const payload of [
      input(bytes),
      input(bytes, { ...mask, sourceSha256: "0".repeat(64) }),
      { ...input(bytes, mask), crop: { ...crop, x: 0.1 } },
      input(bytes, selection(bytes, 400, 500)),
      {
        ...input(bytes, mask),
        subjectMask: { ...mask, data: "https://example.invalid/mask.png" },
      },
      {
        ...input(bytes, mask),
        subjectMask: { ...mask, data: mask.data + "A" },
      },
      {
        ...input(bytes, mask),
        subjectMask: { ...mask, path: "orders/another/mask" },
      },
      { ...input(bytes, mask), mode: "contour" },
    ])
      await assert.rejects(saveDesign(payload));

    const saved = await saveDesign(input(bytes, mask));
    const design = await authorizedDesign(saved.id, saved.token);
    assert.ok(design.subjectMask);
    assert.equal(JSON.stringify(design).includes(mask.data), false);
    assert.deepEqual(
      JSON.parse((await getAsset(design.subjectMask)).toString()),
      mask,
    );
    const context = { params: Promise.resolve({ id: saved.id }) };
    const denied = await getDesign(
      new Request(`http://localhost/api/designs/${saved.id}`),
      context,
    );
    assert.equal(denied.status, 404);
    assert.equal((await denied.text()).includes(mask.data), false);
    const response = await getDesign(
      new Request(`http://localhost/api/designs/${saved.id}`, {
        headers: { Authorization: `Bearer ${saved.token}` },
      }),
      context,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.deepEqual(body.subjectMask, mask);
    assert.equal("key" in body.subjectMask, false);
    assert.equal("tokenHash" in body, false);
    await assert.rejects(
      renderDesign(design, design.settings, { ...crop, rotation: 90 }),
      conflict,
    );
    await assert.rejects(
      putRecord("designs", design.id, { ...design, subjectMask: undefined }),
    );
    await deleteDesign(saved.id, saved.token);
    await assert.rejects(getAsset(design.subjectMask));
  }));

test("mask digests bind proofs even at zero strength and production owns a private canonical copy", async () =>
  isolated(async () => {
    const bytes = await photograph();
    const saved = await saveDesign(input(bytes, selection(bytes), 0));
    const design = await authorizedDesign(saved.id, saved.token);
    const second = await saveDesign(
      input(bytes, selection(bytes, 300, 400, true), 0),
    );
    const other = await authorizedDesign(second.id, second.token);
    const { geometry } = await renderDesign(design);
    assert.notEqual(proofHash(design, geometry), proofHash(other, geometry));
    assert.notEqual(
      proofHash(design, geometry),
      proofHash({ ...design, subjectMask: undefined }, geometry),
    );

    const smallMask = selection(bytes, 30, 40);
    const small: Design = {
      ...design,
      settings: {
        ...design.settings,
        widthMm: 30,
        heightMm: 40,
        safeMarginMm: 1,
        spacingMm: 2,
        minDiameterMm: 0.5,
        maxDiameterMm: 1.5,
        subjectMaskStrength: 1,
      },
      subjectMask: await putAsset(
        `designs/${design.id}/small-mask.json`,
        Buffer.from(JSON.stringify(smallMask)),
        "application/json",
      ),
    };
    const preview = await renderDesign(small);
    const hash = proofHash(small, preview.geometry);
    const production = await createProductionPackage(
      small,
      randomUUID(),
      small.settings,
      crop,
      hash,
    );
    assert.ok(production.subjectMask);
    assert.notEqual(production.subjectMask.key, small.subjectMask!.key);
    assert.equal(production.subjectMask.sha256, small.subjectMask!.sha256);
    assert.equal(production.snapshotHash, hash);
    assert.equal(
      production.manifest.subjectMaskSha256,
      small.subjectMask!.sha256,
    );
    assert.equal(
      JSON.stringify(production.manifest).includes(smallMask.data),
      false,
    );
    const archive = await JSZip.loadAsync(await getAsset(production.archive));
    assert.deepEqual(
      JSON.parse(await archive.file("source/subject-mask.json")!.async("text")),
      smallMask,
    );
    assert.equal(
      JSON.parse(await archive.file("geometry.json")!.async("text")).version,
      RENDERER_VERSION,
    );
    assert.equal(
      (await archive.file("render-settings.json")!.async("text")).includes(
        smallMask.data,
      ),
      false,
    );
    await assert.rejects(
      createProductionPackage(
        small,
        randomUUID(),
        small.settings,
        crop,
        "0".repeat(64),
      ),
      conflict,
    );
  }));

test("mask revisions preserve originals, require new customer proof, clear on replacement and clean failed CAS copies", async () =>
  isolated(async () => {
    const bytes = await photograph();
    const saved = await saveDesign(input(bytes, selection(bytes)));
    const design = await authorizedDesign(saved.id, saved.token);
    const { order, token } = await paid(design);
    const original = structuredClone(order.originalSnapshot);
    await assert.rejects(
      updateOrder(
        order.id,
        { action: "regenerate", crop: { ...crop, zoom: 1.2 } },
        transport,
        packageStub,
      ),
      conflict,
    );
    const adjusted = await updateOrder(
      order.id,
      {
        action: "regenerate",
        settings: { ...design.settings, subjectMaskStrength: 0.5 },
      },
      transport,
      packageStub,
    );
    assert.equal(adjusted.order.revisions[0].customerProofRequired, true);
    assert.equal(adjusted.notification?.type, "revised-proof");
    assert.equal(adjusted.notification?.status, "sent");
    const preserved = structuredClone(adjusted.order.revisions[0]);
    assert.ok(preserved.subjectMask);
    assert.notEqual(
      preserved.subjectMask.key,
      original.package.subjectMask!.key,
    );
    const cleared = await updateOrder(
      order.id,
      {
        action: "regenerate",
        clearSubjectMask: true,
        crop: { ...crop, x: 0.2 },
      },
      transport,
      packageStub,
    );
    assert.equal(cleared.order.revisions.at(-1)!.subjectMask, undefined);
    assert.equal(
      cleared.order.revisions.at(-1)!.settings.subjectMaskStrength,
      0,
    );
    assert.equal(cleared.order.revisions.at(-1)!.customerProofRequired, true);
    assert.deepEqual(cleared.order.originalSnapshot, original);
    assert.deepEqual(cleared.order.revisions[0], preserved);
    assert.throws(
      () => applyReviewAction(cleared.order, "approve", "reviewed"),
      conflict,
    );
    await assert.rejects(
      updateOrder(
        order.id,
        { action: "hold", clearSubjectMask: true },
        transport,
        packageStub,
      ),
    );

    const replacement = await paid(design);
    const requested = applyReviewAction(
      replacement.order,
      "request-photo",
      "Please send a replacement photo.",
    );
    await replaceOrder(replacement.order, requested);
    const request = {
      requestId: requested.photoRequest!.id,
      expectedRevisionId: requested.currentRevisionId,
      submissionId: randomUUID(),
      rightsConfirmed: true,
      crop,
      source: {
        dataUrl: `data:image/png;base64,${(await photograph("#666666")).toString("base64")}`,
      },
    };
    await assert.rejects(
      submitReplacement(replacement.order.id, token, request, packageStub),
    );
    await submitReplacement(
      replacement.order.id,
      replacement.token,
      request,
      packageStub,
    );
    const replaced = (await getRecord<Order>("orders", replacement.order.id))!;
    assert.equal(replaced.revisions[0].subjectMask, undefined);
    assert.equal(replaced.revisions[0].package.subjectMask, undefined);
    assert.equal(replaced.revisions[0].settings.subjectMaskStrength, 0);
    assert.deepEqual(
      replaced.originalSnapshot,
      replacement.order.originalSnapshot,
    );

    const race = await paid(design);
    let uncommitted: Package | undefined;
    await assert.rejects(
      updateOrder(
        race.order.id,
        { action: "regenerate" },
        transport,
        async (design, id, settings, nextCrop) => {
          uncommitted = await packageStub(design, id, settings, nextCrop);
          await replaceOrder(
            race.order,
            applyReviewAction(race.order, "hold", "Concurrent reviewer action"),
          );
          return uncommitted;
        },
      ),
      conflict,
    );
    assert.ok(uncommitted?.subjectMask);
    await assert.rejects(getAsset(uncommitted.subjectMask));
    assert.ok(await getAsset(race.order.originalSnapshot.package.subjectMask!));
  }));

test("mask assets follow design/order erasure while active owners and preset/analytics boundaries stay private", async () =>
  isolated(async () => {
    const bytes = await photograph();
    const mask = selection(bytes);
    const saved = await saveDesign(input(bytes, mask));
    const design = await authorizedDesign(saved.id, saved.token);
    const first = await paid(design),
      second = await paid(design);
    // Exercise a legacy shared mask reference: erase must keep another active owner's asset.
    const sharedId = randomUUID();
    const sharedDesign: Design = {
      ...design,
      id: sharedId,
      subjectMask: first.order.originalSnapshot.package.subjectMask,
    };
    await putRecord("designs", sharedId, sharedDesign, true);
    await replaceOrder(first.order, {
      ...first.order,
      reviewStatus: "dispatched",
    });
    const erased = await eraseOrderArtwork(
      first.order.id,
      "Customer requested artwork erasure.",
    );
    assert.ok(erased.sharedSourcesRetained > 0);
    assert.ok(await getAsset(sharedDesign.subjectMask!));
    for (const asset of packageAssets(
      first.order.originalSnapshot.package,
    ).filter((asset) => asset.key !== sharedDesign.subjectMask!.key))
      await assert.rejects(getAsset(asset));
    for (const asset of orderArtworkAssets(second.order))
      assert.ok(await getAsset(asset));
    assert.ok(await getAsset(design.subjectMask!));
    const erasedRecord = (await getRecord<Order>("orders", first.order.id))!;
    assert.equal(JSON.stringify(erasedRecord).includes(mask.data), false);

    const expiredId = randomUUID();
    const expired: Design = {
      ...design,
      id: expiredId,
      expiresAt: new Date(0).toISOString(),
      source: await putAsset(`designs/${expiredId}/source`, bytes, "image/png"),
      subjectMask: await putAsset(
        `designs/${expiredId}/mask.json`,
        Buffer.from(JSON.stringify(mask)),
        "application/json",
      ),
    };
    await putRecord("designs", expired.id, expired, true);
    await expireUnpaidDesigns();
    assert.equal(await getRecord("designs", expired.id), null);
    await assert.rejects(getAsset(expired.subjectMask!));
    // An expired design retained for a live order still owns its selection.
    const sharedExpiredId = randomUUID(),
      retainedExpiredId = randomUUID();
    const sharedMask = await putAsset(
      `designs/${sharedExpiredId}/mask.json`,
      Buffer.from(JSON.stringify(mask)),
      "application/json",
    );
    await putRecord(
      "designs",
      sharedExpiredId,
      {
        ...expired,
        id: sharedExpiredId,
        source: await putAsset(
          `designs/${sharedExpiredId}/source`,
          bytes,
          "image/png",
        ),
        subjectMask: sharedMask,
      },
      true,
    );
    await putRecord(
      "designs",
      retainedExpiredId,
      {
        ...expired,
        id: retainedExpiredId,
        source: second.order.originalSnapshot.package.source,
        subjectMask: sharedMask,
      },
      true,
    );
    await expireUnpaidDesigns();
    assert.equal(await getRecord("designs", sharedExpiredId), null);
    assert.ok(await getRecord("designs", retainedExpiredId));
    assert.ok(await getAsset(sharedMask));
    const safe = presetSettings({
      ...design.settings,
      subjectMask: mask,
    } as typeof design.settings);
    assert.equal("subjectMaskStrength" in safe, false);
    assert.equal("subjectMask" in safe, false);
    for (const extra of [{ subjectMask: mask }, { subjectMaskStrength: 1 }])
      assert.equal(
        createPresetSchema.safeParse({
          name: "No private outlines",
          mode: "dots",
          settings: { ...safe, ...extra },
        }).success,
        false,
      );
    assert.equal(
      analyticsSchema.safeParse({
        consent: true,
        sessionId: randomUUID(),
        events: [
          {
            event: "template_viewed",
            timestamp: new Date().toISOString(),
            subjectMask: mask,
          },
        ],
      }).success,
      false,
    );
  }));
