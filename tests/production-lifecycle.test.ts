import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_SETTINGS, RENDERER_VERSION } from "../lib/renderers";
import {
  maskRasterDimensions,
  normalizeSubjectMask,
} from "../lib/subject-mask";
import { getAsset, putAsset, type PrivateAsset } from "../lib/server/assets";
import { packageAssets } from "../lib/server/artwork-assets";
import { createProductionPackage } from "../lib/server/production";
import type { Design } from "../lib/server/schema";
import { digest } from "../lib/server/security";

async function isolated(work: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "srs-package-ledger-"));
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

async function fixture(masked = false): Promise<Design> {
  const id = randomUUID();
  const image = await sharp({
    create: { width: 64, height: 80, channels: 3, background: "#555555" },
  })
    .png()
    .toBuffer();
  const source = await putAsset(
    `designs/${id}/original.png`,
    image,
    "image/png",
  );
  const design: Design = {
    id,
    tokenHash: digest("synthetic-capability"),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    mode: "dots",
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    settings: {
      ...DEFAULT_SETTINGS,
      widthMm: 30,
      heightMm: 40,
      safeMarginMm: 1,
      spacingMm: 3,
      minDiameterMm: 0.5,
      maxDiameterMm: 2,
      subjectMaskStrength: masked ? 0.5 : 0,
    },
    source,
    rightsConfirmed: true,
    marketingConsent: false,
    warnings: [],
    rendererVersion: RENDERER_VERSION,
  };
  if (masked) {
    const raster = maskRasterDimensions(30, 40);
    const mask = normalizeSubjectMask({
      version: 1,
      space: "cropped-v1",
      sourceSha256: source.sha256,
      crop: design.crop,
      widthMm: 30,
      heightMm: 40,
      ...raster,
      data: Buffer.alloc(raster.width * raster.height, 255).toString("base64"),
      feather: 0,
    });
    design.subjectMask = await putAsset(
      `designs/${id}/subject-mask.json`,
      Buffer.from(JSON.stringify(mask)),
      "application/json",
    );
  }
  return design;
}

async function absent(directory: string, asset: PrivateAsset) {
  await assert.rejects(
    stat(path.join(directory, "assets", asset.key)),
    (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
  );
}

test("production registers every exact output descriptor before its first storage write", async () =>
  isolated(async (directory) => {
    const design = await fixture(true);
    const orderId = randomUUID();
    let ledger: PrivateAsset[] = [];
    let calls = 0;
    const production = await createProductionPackage(
      design,
      orderId,
      design.settings,
      design.crop,
      undefined,
      {
        async beforeWrite(assets) {
          calls++;
          ledger = structuredClone(assets);
          assert.equal(assets.length, 5);
          assert.equal(new Set(assets.map((asset) => asset.key)).size, 5);
          for (const asset of assets) {
            assert.ok(asset.key.startsWith(`orders/${orderId}/`));
            assert.match(asset.sha256, /^[a-f0-9]{64}$/);
            assert.ok(asset.bytes > 0);
            await absent(directory, asset);
          }
          // The external ledger callback cannot redirect the actual output writes.
          assets[0].key = "not-an-output";
        },
      },
    );
    assert.equal(calls, 1);
    const byKey = (assets: PrivateAsset[]) =>
      [...assets].sort((a, b) => a.key.localeCompare(b.key));
    assert.deepEqual(byKey(ledger), byKey(packageAssets(production)));
    for (const asset of ledger) {
      const bytes = await getAsset(asset);
      assert.equal(bytes.length, asset.bytes);
      assert.equal(digest(bytes), asset.sha256);
      assert.notEqual(asset.key, design.source.key);
      assert.notEqual(asset.key, design.subjectMask!.key);
    }
    assert.ok((await getAsset(design.source)).length > 0);
    assert.ok((await getAsset(design.subjectMask!)).length > 0);
  }));

test("a refused durable ledger leaves every intended package output unwritten", async () =>
  isolated(async (directory) => {
    const design = await fixture();
    let ledger: PrivateAsset[] = [];
    await assert.rejects(
      createProductionPackage(
        design,
        randomUUID(),
        design.settings,
        design.crop,
        undefined,
        {
          async beforeWrite(assets) {
            ledger = assets;
            throw new Error("The attempt closed before publication");
          },
        },
      ),
      /attempt closed/,
    );
    assert.equal(ledger.length, 4);
    for (const asset of ledger) await absent(directory, asset);
    assert.ok((await getAsset(design.source)).length > 0);
  }));
