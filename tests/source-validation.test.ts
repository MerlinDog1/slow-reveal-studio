import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { validatePhoto } from "../lib/server/source-validation";
import { decodeSource, getAsset } from "../lib/server/assets";
import { saveDesign, authorizedDesign } from "../lib/server/designs";
import { submitReplacement } from "../lib/server/replacements";
import { putRecord } from "../lib/server/store";
import { ApiError, digest } from "../lib/server/security";
import { DEFAULT_SETTINGS, RENDERER_VERSION } from "../lib/renderers";
import type { Design, Order } from "../lib/server/schema";

const invalidPhoto = (error: unknown) =>
  error instanceof ApiError && error.status === 415;
const crop = { zoom: 1, x: 0, y: 0, rotation: 0 as const };
async function examples() {
  const image = sharp({
    create: {
      width: 64,
      height: 80,
      channels: 4,
      background: { r: 50, g: 80, b: 110, alpha: 0.4 },
    },
  });
  return [
    { mime: "image/png", bytes: await image.clone().png().toBuffer() },
    {
      mime: "image/jpeg",
      bytes: await image
        .clone()
        .withMetadata({ orientation: 6 })
        .jpeg({ progressive: true })
        .toBuffer(),
    },
    {
      mime: "image/webp",
      bytes: await image.clone().webp({ lossless: true }).toBuffer(),
    },
  ];
}
function input(bytes: Buffer, mime = "image/png") {
  return {
    mode: "dots",
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
    crop,
    settings: { ...DEFAULT_SETTINGS, widthMm: 300, heightMm: 400 },
    source: { dataUrl: `data:${mime};base64,${bytes.toString("base64")}` },
    rightsConfirmed: true,
  };
}
async function isolated(work: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "srs-source-validation-"),
  );
  const env = {
    STUDIO_DATA_DIR: directory,
    NODE_ENV: "development",
    ALLOW_LOCAL_DEVELOPMENT_STORAGE: "true",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    R2_ACCOUNT_ID: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_BUCKET: "",
    RESEND_API_KEY: "",
    STRIPE_SECRET_KEY: "",
    LIVE_CHECKOUT_ENABLED: "false",
    PHYSICAL_VALIDATION_APPROVED: "false",
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
    await rm(directory, { recursive: true, force: true });
  }
}

test("full photo validation accepts JPEG, PNG and WebP without changing original orientation, alpha or bytes", async () =>
  isolated(async () => {
    for (const sample of await examples()) {
      const before = Buffer.from(sample.bytes);
      const metadata = await sharp(before).metadata();
      assert.deepEqual(await validatePhoto(sample.bytes), [
        "The source is small. Review fine details before printing.",
      ]);
      assert.deepEqual(sample.bytes, before);
      const result = await saveDesign(input(sample.bytes, sample.mime));
      const saved = await authorizedDesign(result.id, result.token);
      assert.deepEqual(await getAsset(saved.source), before);
      assert.equal(saved.source.sha256, digest(before));
      assert.equal(saved.source.mime, sample.mime);
      const storedMetadata = await sharp(
        await getAsset(saved.source),
      ).metadata();
      assert.equal(storedMetadata.orientation, metadata.orientation);
      assert.equal(storedMetadata.hasAlpha, metadata.hasAlpha);
      if (sample.mime === "image/jpeg")
        assert.equal(storedMetadata.orientation, 6);
      else assert.equal(storedMetadata.hasAlpha, true);
    }
  }));

test("truncated or corrupt pixel streams fail before private save writes a design or source", async () =>
  isolated(async (directory) => {
    const samples = await examples();
    const png = samples[0].bytes;
    const truncatedPng = png.subarray(0, 80);
    assert.equal(
      (await sharp(truncatedPng).metadata()).width,
      64,
      "regression fixture must pass the old metadata-only check",
    );
    assert.equal(
      decodeSource(input(truncatedPng).source.dataUrl).mime,
      "image/png",
    );
    const corruptedPng = Buffer.from(png);
    const idat = corruptedPng.indexOf(Buffer.from("IDAT"));
    assert.ok(idat > 0);
    corruptedPng[idat + 6] ^= 0xff;
    const invalid = [
      { mime: "image/png", bytes: truncatedPng },
      { mime: "image/png", bytes: corruptedPng },
      {
        mime: "image/jpeg",
        bytes: samples[1].bytes.subarray(
          0,
          Math.floor(samples[1].bytes.length * 0.7),
        ),
      },
      {
        mime: "image/webp",
        bytes: samples[2].bytes.subarray(
          0,
          Math.floor(samples[2].bytes.length * 0.7),
        ),
      },
    ];
    for (const sample of invalid) {
      await assert.rejects(validatePhoto(sample.bytes), invalidPhoto);
      await assert.rejects(
        saveDesign(input(sample.bytes, sample.mime)),
        invalidPhoto,
      );
      assert.deepEqual(
        await readdir(directory),
        [],
        "malformed pixels must not persist private sources or saved records",
      );
    }
  }));

test("validation preserves byte/pixel/frame/aspect limits while bounding its decoded output", async () => {
  await assert.rejects(
    validatePhoto(Buffer.alloc(8 * 1024 * 1024 + 1)),
    (error) => error instanceof ApiError && error.status === 413,
  );
  const maximal = await sharp({
    create: { width: 8000, height: 5000, channels: 3, background: "#334455" },
  })
    .png()
    .toBuffer();
  assert.ok(maximal.length < 8 * 1024 * 1024);
  assert.deepEqual(
    await validatePhoto(maximal),
    [],
    "exactly40MP remains supported with a small validation raster",
  );
  const excessive = await sharp({
    create: { width: 8000, height: 5001, channels: 3, background: "#334455" },
  })
    .png()
    .toBuffer();
  await assert.rejects(validatePhoto(excessive), invalidPhoto);
  for (const [width, height] of [
    [31, 64],
    [1000, 32],
  ]) {
    const unsuitable = await sharp({
      create: { width, height, channels: 3, background: "#334455" },
    })
      .png()
      .toBuffer();
    await assert.rejects(validatePhoto(unsuitable), invalidPhoto);
  }
  const frames = Buffer.alloc(64 * 128 * 3, 30);
  frames.fill(200, 64 * 64 * 3);
  const animated = await sharp(frames, {
    raw: { width: 64, height: 128, channels: 3, pageHeight: 64 },
  })
    .webp({ delay: [100, 100] })
    .toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(validatePhoto(animated), invalidPhoto);
  const gif = await sharp({
    create: { width: 64, height: 80, channels: 3, background: "#334455" },
  })
    .gif()
    .toBuffer();
  await assert.rejects(validatePhoto(gif), invalidPhoto);
});

test("invalid replacement pixels do not claim or replace an order lease or write a staging source", async () =>
  isolated(async (directory) => {
    const id = randomUUID(),
      token = "synthetic-guest-capability-at-least-32-characters";
    const asset = {
      key: "fixture/original.png",
      mime: "image/png",
      bytes: 100,
      sha256: "0".repeat(64),
    };
    const design: Design = {
      id: randomUUID(),
      tokenHash: digest(token),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      mode: "dots",
      productId: "30x40",
      finishId: "rolled",
      inkId: "black",
      crop,
      settings: DEFAULT_SETTINGS,
      source: asset,
      rightsConfirmed: true,
      marketingConsent: false,
      warnings: [],
      rendererVersion: RENDERER_VERSION,
    };
    const order: Order = {
      id,
      tokenHash: digest(token),
      createdAt: new Date().toISOString(),
      stripeSessionId: "cs_fixture",
      paymentStatus: "paid",
      amountPence: 4900,
      currency: "gbp",
      reviewStatus: "alternate-photo-requested",
      revisions: [],
      currentRevisionId: "original",
      audit: [],
      photoRequest: {
        id: randomUUID(),
        revisionId: "original",
        requestedAt: new Date().toISOString(),
        note: "Send a sharper photo.",
      },
      originalSnapshot: {
        id,
        tokenHash: digest(token),
        createdAt: new Date().toISOString(),
        design,
        amountPence: 4900,
        shippingId: "standard",
        package: {
          source: asset,
          archive: asset,
          finishedSvg: asset,
          templateSvg: asset,
          snapshotHash: "0".repeat(64),
          manifest: { revisionId: "original" },
        },
      },
      replacementIntake: {
        submissionId: randomUUID(),
        requestId: "expired-intake",
        baseRevisionId: "original",
        inputHash: "0".repeat(64),
        leaseId: randomUUID(),
        startedAt: new Date(Date.now() - 11 * 60000).toISOString(),
        source: { ...asset, key: "staging/prior-intake/original" },
      },
    };
    await putRecord("orders", id, order, true);
    const record = path.join(directory, "orders", `${id}.json`);
    const before = await readFile(record),
      beforeStat = await stat(record, { bigint: true });
    let productionCalls = 0;
    const png = (await examples())[0].bytes.subarray(0, 80);
    await assert.rejects(
      submitReplacement(
        id,
        token,
        {
          requestId: order.photoRequest!.id,
          expectedRevisionId: "original",
          submissionId: randomUUID(),
          rightsConfirmed: true,
          crop,
          source: input(png).source,
        },
        async () => {
          productionCalls++;
          throw new Error("Production must not run");
        },
      ),
      invalidPhoto,
    );
    assert.equal(productionCalls, 0);
    assert.deepEqual(await readFile(record), before);
    const afterStat = await stat(record, { bigint: true });
    assert.equal(
      afterStat.ino,
      beforeStat.ino,
      "no atomic order replacement should claim or clear a lease",
    );
    assert.equal(afterStat.mtimeNs, beforeStat.mtimeNs);
    assert.deepEqual(await readdir(directory), ["orders"]);
  }));
