import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import {
  createArtworkPdf,
  ARTWORK_PDF_DATE,
  ARTWORK_PDF_VERSION,
} from "../lib/artwork-pdf";
import {
  DEFAULT_SETTINGS,
  RENDERER_VERSION,
  renderImage,
} from "../lib/renderers";
import { getAsset, putAsset } from "../lib/server/assets";
import { createProductionPackage } from "../lib/server/production";
import type { Design } from "../lib/server/schema";
import { digest } from "../lib/server/security";
import {
  createProductionKit,
  type PackageFileDescriptor,
} from "../lib/server/production-kit";

async function raster(
  widthMm: number,
  heightMm: number,
  dpi: number,
  background: string,
) {
  return sharp({
    create: {
      width: Math.round((widthMm / 25.4) * dpi),
      height: Math.round((heightMm / 25.4) * dpi),
      channels: 4,
      background,
    },
  })
    .png()
    .toBuffer();
}
function mediaBoxes(bytes: Uint8Array) {
  return [
    ...Buffer.from(bytes)
      .toString("latin1")
      .matchAll(/\/MediaBox\s*\[([\d.\s]+)\]/g),
  ].map((match) => match[1].trim().split(/\s+/).map(Number));
}
function assertPageSize(
  bytes: Uint8Array,
  widthMm: number,
  heightMm: number,
  count: number,
) {
  const boxes = mediaBoxes(bytes);
  assert.equal(boxes.length, count);
  for (const box of boxes) {
    assert.deepEqual(box.slice(0, 2), [0, 0]);
    assert.ok(Math.abs((box[2] * 25.4) / 72 - widthMm) < 1e-8);
    assert.ok(Math.abs((box[3] * 25.4) / 72 - heightMm) < 1e-8);
  }
}

test("shared PDFs preserve exact portrait/landscape page size and stable metadata across time and timezone", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2024, 0, 1) });
  const previousTz = process.env.TZ;
  try {
    for (const [widthMm, heightMm] of [
      [30, 40],
      [40, 30],
      [30, 1500],
      [1500, 30],
    ]) {
      const png = await raster(widthMm, heightMm, 150, "#334455");
      const input = {
        pages: [png],
        widthMm,
        heightMm,
        dpi: 150,
        contentSha256: digest(png),
      };
      process.env.TZ = "Pacific/Honolulu";
      const first = createArtworkPdf(input);
      context.mock.timers.tick(370 * 86400000);
      process.env.TZ = "Asia/Tokyo";
      const second = createArtworkPdf(input);
      assert.deepEqual(second, first);
      assertPageSize(first, widthMm, heightMm, 1);
      const text = Buffer.from(first).toString("latin1");
      assert.ok(text.includes(`/CreationDate (${ARTWORK_PDF_DATE})`));
      assert.ok(text.includes(digest(png).slice(0, 32).toUpperCase()));
      assert.ok(text.includes(ARTWORK_PDF_VERSION));
      const different = await raster(widthMm, heightMm, 150, "#334456");
      assert.notDeepEqual(
        createArtworkPdf({
          ...input,
          pages: [different],
          contentSha256: digest(different),
        }),
        first,
      );
    }
  } finally {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  }
});

test("shared PDF export supports deterministic A4 page ordering and rejects unbounded or mismatched raster inputs", async () => {
  const first = await raster(210, 297, 50, "#faf8f3");
  const second = await raster(210, 297, 50, "#eeeeee");
  const input = {
    pages: [first, second],
    widthMm: 210,
    heightMm: 297,
    dpi: 50,
    contentSha256: digest(Buffer.concat([first, second])),
    title: "Trial making guide",
  };
  const pdf = createArtworkPdf(input);
  assertPageSize(pdf, 210, 297, 2);
  assert.deepEqual(createArtworkPdf(input), pdf);
  assert.notDeepEqual(
    createArtworkPdf({
      ...input,
      pages: [second, first],
      contentSha256: digest(Buffer.concat([second, first])),
    }),
    pdf,
  );
  for (const patch of [
    { contentSha256: "" },
    { contentSha256: "not-a-digest" },
    { pages: [] },
    { pages: Array(33).fill(first) },
    { pages: [new Uint8Array(100)] },
    { widthMm: 0 },
    { widthMm: Infinity },
    { heightMm: NaN },
    { heightMm: 1501 },
    { dpi: 0 },
    { dpi: 50.5 },
    { dpi: 1201 },
    { dpi: 300 },
    { widthMm: 297, heightMm: 210 },
  ])
    assert.throws(() => createArtworkPdf({ ...input, ...patch }));
  assert.throws(() => createArtworkPdf({ ...input, title: "x".repeat(201) }));
});

test("independent production revisions retain byte-identical manufacturing files and matching hashes for identical artwork", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "srs-production-determinism-"),
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
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
  context.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2025, 0, 1) });
  try {
    const pixels = Buffer.alloc(64 * 64 * 3);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++)
        pixels.fill(
          (x * 7 + y * 3) % 256,
          (y * 64 + x) * 3,
          (y * 64 + x) * 3 + 3,
        );
    const source = await sharp(pixels, {
      raw: { width: 64, height: 64, channels: 3 },
    })
      .png()
      .toBuffer();
    const id = randomUUID(),
      orderId = randomUUID();
    const design: Design = {
      id,
      tokenHash: digest("synthetic"),
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
        spacingMm: 2,
        minDiameterMm: 0.5,
        maxDiameterMm: 1.5,
        detailPreservation: 0.6,
        guideColor: "#334455",
        text: { value: "Test", sizeMm: 2 },
      },
      source: await putAsset(`designs/${id}/source.png`, source, "image/png"),
      rightsConfirmed: true,
      marketingConsent: false,
      warnings: [],
      rendererVersion: RENDERER_VERSION,
    };
    const first = await createProductionPackage(design, orderId);
    const firstBytes = await getAsset(first.archive);
    context.mock.timers.tick(5 * 86400000);
    const second = await createProductionPackage(design, orderId);
    const a = await JSZip.loadAsync(firstBytes),
      b = await JSZip.loadAsync(await getAsset(second.archive));
    assert.notEqual(first.manifest.revisionId, second.manifest.revisionId);
    assert.notEqual(first.archive.key, second.archive.key);
    assert.equal(first.snapshotHash, second.snapshotHash);
    assert.deepEqual(first.manifest.files, second.manifest.files);
    assert.equal(first.manifest.pdfFormatVersion, ARTWORK_PDF_VERSION);
    const stablePaths = Object.keys(a.files).filter(
      (name) =>
        !a.files[name].dir &&
        (name.startsWith("production/") ||
          name.startsWith("source/") ||
          name.startsWith("preview/") ||
          name === "geometry.json" ||
          name === "render-settings.json"),
    );
    assert.equal(
      stablePaths.filter((name) => name.startsWith("production/")).length,
      3,
    );
    for (const name of stablePaths)
      assert.deepEqual(
        await a.file(name)!.async("nodebuffer"),
        await b.file(name)!.async("nodebuffer"),
        name,
      );
    const firstKit = first.manifest.kitGuide as {
      status: string;
      dpi: number;
      pages: number;
      files: Record<string, PackageFileDescriptor>;
    };
    assert.equal(firstKit.status, "draft-for-physical-trial");
    assert.equal(firstKit.dpi, 300);
    assert.equal(firstKit.pages, 2);
    for (const file of Object.values(firstKit.files)) {
      const bytes = await a.file(file.path)!.async("nodebuffer");
      assert.equal(bytes.length, file.bytes);
      assert.equal(digest(bytes), file.sha256);
      assert.ok(file.mime);
    }
    for (const key of [
      "makingGuidePdf",
      "guideText",
      "guidePage1",
      "guidePage2",
    ]) {
      const name = firstKit.files[key].path;
      assert.deepEqual(
        await a.file(name)!.async("nodebuffer"),
        await b.file(name)!.async("nodebuffer"),
        `${name} must be independent of order revision metadata`,
      );
    }
    assertPageSize(
      await a.file("kit/making-guide.pdf")!.async("nodebuffer"),
      210,
      297,
      2,
    );
    const wrapped = JSON.parse(await a.file("kit/guide.json")!.async("text"));
    const updatedWrapped = JSON.parse(
      await b.file("kit/guide.json")!.async("text"),
    );
    assert.equal(wrapped.orderId, orderId);
    assert.equal(wrapped.revisionId, first.manifest.revisionId);
    assert.equal(updatedWrapped.revisionId, second.manifest.revisionId);
    assert.equal(wrapped.snapshotHash, first.snapshotHash);
    assert.equal(
      wrapped.geometrySha256,
      digest(await a.file("geometry.json")!.async("nodebuffer")),
    );
    assert.deepEqual(wrapped.guide, updatedWrapped.guide);
    assert.equal(
      JSON.stringify(wrapped.guide).includes('"Test"'),
      false,
      "making instructions omit private customer lettering",
    );
    const packing = JSON.parse(
      await a.file("kit/packing-list.json")!.async("text"),
    );
    const geometry = JSON.parse(await a.file("geometry.json")!.async("text"));
    assert.deepEqual(packing.settings, geometry.settings);
    assert.equal(packing.revisionId, first.manifest.revisionId);
    assert.equal(packing.snapshotHash, first.snapshotHash);
    assert.equal(packing.packingStatus, "not-confirmed");
    assert.deepEqual(packing.selectedProduct, {
      productId: design.productId,
      finishId: design.finishId,
      inkId: design.inkId,
    });
    for (const material of packing.materials) {
      assert.equal(material.assignmentStatus, "unresolved");
      assert.deepEqual(material.stock, {
        sku: null,
        batchOrLot: null,
        quantity: null,
      });
      assert.equal(material.packed, false);
    }
    for (const name of [
      "kit/guide.json",
      "kit/packing-list.json",
      "kit/making-guide.txt",
      "kit/packing-list.txt",
    ]) {
      const text = await a.file(name)!.async("text");
      assert.equal(text.includes(design.tokenHash), false);
      assert.equal(text.includes(design.source.key), false);
      assert.equal(text.includes(source.toString("base64")), false);
    }
    const pdfPath = stablePaths.find((name) => name.endsWith("_template.pdf"))!;
    const pdf = await a.file(pdfPath)!.async("nodebuffer");
    assertPageSize(pdf, 30, 40, 1);
    assert.equal(
      (first.manifest.files as { templatePdf: { sha256: string } }).templatePdf
        .sha256,
      digest(pdf),
    );
    assert.deepEqual(
      await getAsset(first.archive),
      firstBytes,
      "generating a new revision must not rewrite an existing immutable archive",
    );
    const different = await createProductionPackage(design, orderId, {
      ...design.settings,
      guideColor: "#556677",
    });
    assert.notEqual(different.snapshotHash, first.snapshotHash);
    assert.notDeepEqual(different.manifest.files, first.manifest.files);
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await rm(directory, { recursive: true, force: true });
  }
});

test("private kit packages preserve numbered marker correspondence and the required Line Amplification straight edge", async () => {
  const pixels = new Uint8ClampedArray(48 * 64 * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    const grey = (index / 4) % 48 < 24 ? 30 : 100;
    pixels.set([grey, grey, grey, 255], index);
  }
  for (const mode of ["mosaic", "line-amplification"] as const) {
    const geometry = renderImage(
      { data: pixels, width: 48, height: 64 },
      {
        ...DEFAULT_SETTINGS,
        mode,
        widthMm: 30,
        heightMm: 40,
        safeMarginMm: 1,
        spacingMm: 2,
        minDiameterMm: 0.5,
        maxDiameterMm: 1.5,
        ...(mode === "mosaic" ? { palette: ["#000000", "#777777"] } : {}),
      },
    );
    const kit = await createProductionKit(geometry, {
      orderId: randomUUID(),
      revisionId: randomUUID(),
      snapshotHash: "0".repeat(64),
      productId: "30x40",
      finishId: "rolled",
      inkId: "black",
    });
    const packing = JSON.parse(
      kit.files
        .find((file) => file.path === "kit/packing-list.json")!
        .data.toString(),
    );
    const wrapped = JSON.parse(
      kit.files.find((file) => file.path === "kit/guide.json")!.data.toString(),
    );
    assert.deepEqual(packing.palette, wrapped.guide.legend);
    assert.deepEqual(packing.settings, geometry.settings);
    if (mode === "mosaic") {
      assert.ok(geometry.cells.length > 0);
      for (const cell of geometry.cells) {
        const entry = packing.palette.find(
          (item: { id: string }) => item.id === cell.label,
        );
        assert.equal(entry.color, cell.color);
      }
      for (const entry of packing.palette)
        assert.equal(
          entry.usedCellCount,
          geometry.cells.filter((cell) => cell.label === entry.id).length,
        );
    } else {
      assert.ok(
        packing.materials.some(
          (material: { id: string }) => material.id === "straight-edge",
        ),
      );
      assert.match(
        kit.files
          .find((file) => file.path === "kit/packing-list.txt")!
          .data.toString(),
        /Ruler \/ straight edge: required/,
      );
    }
  }
});
