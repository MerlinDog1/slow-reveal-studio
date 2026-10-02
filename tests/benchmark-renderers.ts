/** Manual, reproducible reference benchmark: node --import tsx tests/benchmark-renderers.ts */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import sharp, { type OverlayOptions } from "sharp";
import {
  DEFAULT_SETTINGS,
  RENDERER_VERSION,
  renderImage,
  toSvg,
  type Circle,
  type RenderGeometry,
} from "../lib/renderers/index";

const fixtures = [
  "portrait",
  "couple",
  "family",
  "black-dog",
  "light-pet",
  "building",
  "vehicle",
  "landscape",
];
const binsX = 12,
  binsY = 16;

function bins(geometry: RenderGeometry): number[] {
  const a = Array<number>(binsX * binsY).fill(0);
  const margin = geometry.settings.safeMarginMm;
  for (const c of geometry.circles) {
    const x = Math.min(
      binsX - 1,
      Math.floor(((c.x - margin) / (geometry.widthMm - margin * 2)) * binsX),
    );
    const y = Math.min(
      binsY - 1,
      Math.floor(((c.y - margin) / (geometry.heightMm - margin * 2)) * binsY),
    );
    a[y * binsX + x] += Math.PI * c.r ** 2;
  }
  return a;
}

function pearson(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length,
    mb = b.reduce((s, v) => s + v, 0) / b.length;
  let cov = 0,
    va = 0,
    vb = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return cov / Math.sqrt(va * vb);
}

function minGap(circles: Circle[], pitch: number): number {
  const buckets = new Map<string, Circle[]>();
  let gap = Infinity;
  for (const c of circles) {
    const x = Math.floor(c.x / pitch),
      y = Math.floor(c.y / pitch);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const d of buckets.get(`${x + dx}:${y + dy}`) ?? [])
          gap = Math.min(gap, Math.hypot(c.x - d.x, c.y - d.y) - c.r - d.r);
      }
    const key = `${x}:${y}`;
    buckets.set(key, [...(buckets.get(key) ?? []), c]);
  }
  return gap;
}

async function main() {
  const out = join(process.cwd(), "docs");
  await mkdir(out, { recursive: true });
  const black = new Uint8ClampedArray(800 * 1000 * 4);
  for (let i = 3; i < black.length; i += 4) black[i] = 255;
  const maximumAreas = bins(
    renderImage({ data: black, width: 800, height: 1000 }, DEFAULT_SETTINGS),
  );
  const composite: OverlayOptions[] = [];
  const results = [];
  for (let i = 0; i < fixtures.length; i++) {
    const name = fixtures[i];
    const source = await readFile(
      join(process.cwd(), "public", "references", `${name}.jpg`),
    );
    const { data, info } = await sharp(source)
      .rotate()
      .resize(800, 1000, { fit: "cover", position: "centre" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const input = {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
    };
    const start = performance.now();
    const geometry = renderImage(input, DEFAULT_SETTINGS);
    const renderMs = performance.now() - start;
    assert.deepEqual(
      geometry,
      renderImage(input, DEFAULT_SETTINGS),
      `${name}: determinism`,
    );
    const gap = minGap(geometry.circles, geometry.stats.effectiveSpacingMm);
    assert.ok(gap >= 0.249, `${name}: physical mark gap`);
    const sourceBins = Array<number>(binsX * binsY).fill(0),
      counts = Array<number>(binsX * binsY).fill(0);
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const b =
            Math.floor((y / info.height) * binsY) * binsX +
            Math.floor((x / info.width) * binsX),
          p = (y * info.width + x) * 4;
        sourceBins[b] +=
          1 -
          (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) /
            255;
        counts[b]++;
      }
    const artworkBins = bins(geometry).map((area, j) => area / maximumAreas[j]);
    const toneCorrelation = pearson(
      sourceBins.map((sum, j) => sum / counts[j]),
      artworkBins,
    );
    assert.ok(
      toneCorrelation > 0.9,
      `${name}: low-frequency tonal structure (not semantic recognition)`,
    );
    const images = [
      await sharp(data, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .resize(200, 250)
        .png()
        .toBuffer(),
    ];
    for (const variant of ["finished", "template"] as const)
      images.push(
        await sharp(Buffer.from(toSvg(geometry, variant)))
          .resize(200, 250)
          .png()
          .toBuffer(),
      );
    const x = (i % 2) * 630,
      y = Math.floor(i / 2) * 285;
    composite.push({
      input: Buffer.from(
        `<svg width="620" height="25"><text x="0" y="18" font-family="sans-serif" font-size="16">${name} · Original / Finished / Template</text></svg>`,
      ),
      left: x + 10,
      top: y + 4,
    });
    images.forEach((input, k) =>
      composite.push({ input, left: x + k * 210 + 10, top: y + 30 }),
    );
    results.push({
      fixture: name,
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      crop: "centre cover 800×1000; original framing is intentionally retained as far as the 4:5 crop permits",
      markCount: geometry.stats.markCount,
      estimatedCompletionMinutes: geometry.stats.estimatedCompletionMinutes,
      renderMs: Math.round(renderMs * 10) / 10,
      minDiameterMm: Math.min(...geometry.circles.map((c) => c.r * 2)),
      maxDiameterMm: Math.max(...geometry.circles.map((c) => c.r * 2)),
      minimumClearGapMm: Math.round(gap * 10000) / 10000,
      tonalCorrelation12x16: Math.round(toneCorrelation * 10000) / 10000,
      exposureScale: geometry.stats.exposureScale,
      deterministic: true,
      geometrySha256: createHash("sha256")
        .update(JSON.stringify(geometry))
        .digest("hex"),
      warnings: geometry.warnings,
    });
  }
  await sharp({
    create: { width: 1260, height: 1140, channels: 3, background: "#e7e1d7" },
  })
    .composite(composite)
    .png()
    .toFile(join(out, "renderer-contact-sheet.png"));
  const report = {
    rendererVersion: RENDERER_VERSION,
    generatedAt: new Date().toISOString(),
    command: "node --import tsx tests/benchmark-renderers.ts",
    settings: DEFAULT_SETTINGS,
    method:
      "Each licensed source is centre-cropped to 800×1000 RGBA and rendered at 400×500 mm. Pearson correlation compares mean source darkness with relative dot area in a 12×16 physical grid. The per-bin normalization uses the identical all-black lattice. This measures coarse tonal structure, not likeness, comfort, accessibility, real ink colour or print quality. Runtime is one local Node run per image and excludes decode/export; it is not a browser performance guarantee.",
    physicalValidation:
      "PENDING: UV/canvas/marker tests and hand-completed prototypes are not performed by this benchmark.",
    contactSheet: "renderer-contact-sheet.png",
    results,
  };
  await writeFile(
    join(out, "renderer-benchmarks.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      results.map(
        ({
          fixture,
          markCount,
          renderMs,
          tonalCorrelation12x16,
          minimumClearGapMm,
        }) => ({
          fixture,
          markCount,
          renderMs,
          tonalCorrelation12x16,
          minimumClearGapMm,
        }),
      ),
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
