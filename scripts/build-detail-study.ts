/** Public licensed fixtures only. Run: node --import tsx scripts/build-detail-study.ts */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import sharp, { type OverlayOptions } from "sharp";
import {
  DEFAULT_SETTINGS,
  FONT_OUTLINE_VERSION,
  RENDERER_VERSION,
  outlineLettering,
  renderImage,
  toSvg,
  type Circle,
} from "../lib/renderers";

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
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
const levels = [0, 0.5, 1] as const;
const coordinate = (circle: Circle) => `${circle.x},${circle.y}`;

function minimumGap(circles: Circle[], pitch: number) {
  const buckets = new Map<string, Circle[]>();
  let gap = Infinity;
  for (const circle of circles) {
    const x = Math.floor(circle.x / pitch),
      y = Math.floor(circle.y / pitch);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const neighbour of buckets.get(`${x + dx}:${y + dy}`) ?? [])
          gap = Math.min(
            gap,
            Math.hypot(circle.x - neighbour.x, circle.y - neighbour.y) -
              circle.r -
              neighbour.r,
          );
      }
    const key = `${x}:${y}`;
    buckets.set(key, [...(buckets.get(key) ?? []), circle]);
  }
  return Math.round(gap * 10000) / 10000;
}

function label(
  value: string,
  x: number,
  y: number,
  fontPixels: number,
  maxWidth: number,
) {
  // Shared outline vectors also keep the study's annotations independent of installed fonts.
  const shape = outlineLettering({
    value,
    x,
    y,
    sizeMm: fontPixels,
    fontFamily: "sans-serif",
    fontVersion: FONT_OUTLINE_VERSION,
    anchor: "start",
    maxWidthMm: maxWidth,
  });
  return `<g fill="#1e1e1c" transform="translate(${shape.x} ${shape.y}) scale(${shape.scale})">${shape.glyphs.map((glyph) => `<path d="${glyph.d}" transform="translate(${glyph.x} 0)"/>`).join("")}</g>`;
}

async function main() {
  const output = "docs";
  const sourceRecords = JSON.parse(
    await readFile("public/references/manifest.json", "utf8"),
  ) as Array<{
    id: string;
    file: string;
    sha256: string;
    source: string;
    author: string;
    license: string;
    licenseUrl: string;
  }>;
  const panelWidth = 300,
    panelHeight = 375,
    gap = 12,
    margin = 16,
    top = 120,
    rowHeight = 432;
  const sheetWidth = margin * 2 + panelWidth * 4 + gap * 3;
  const sheetHeight = top + rowHeight * fixtures.length + 48;
  const overlays: OverlayOptions[] = [];
  const annotations = [
    label(
      "Detail preservation / eight licensed photographs",
      margin,
      34,
      25,
      sheetWidth - margin * 2,
    ),
    label(
      "Digital study: fixed crop, size and spacing. Only detail preservation changes.",
      margin,
      64,
      17,
      sheetWidth - margin * 2,
    ),
    ...[
      "Original crop",
      "Detail 0 / existing sampling",
      "Detail 0.5",
      "Detail 1",
    ].map((text, index) =>
      label(text, margin + index * (panelWidth + gap), 101, 17, panelWidth),
    ),
  ];
  const results = [];
  for (const [index, id] of fixtures.entries()) {
    const sourceRecord = sourceRecords.find((source) => source.id === id);
    assert.ok(sourceRecord, `${id}: licensed source record`);
    const source = await readFile(join("public", sourceRecord.file));
    assert.equal(
      hash(source),
      sourceRecord.sha256,
      `${id}: unchanged licensed source`,
    );
    const { data, info } = await sharp(source)
      .autoOrient()
      .resize(800, 1000, { fit: "cover", position: "centre" })
      .flatten({ background: "#ffffff" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const input = {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
    };
    const rowY = top + index * rowHeight;
    annotations.push(
      label(
        `${id} / ${sourceRecord.author} / Unsplash`,
        margin,
        rowY + 19,
        17,
        sheetWidth - margin * 2,
      ),
    );
    const cropped = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .resize(panelWidth, panelHeight)
      .png()
      .toBuffer();
    overlays.push({ input: cropped, left: margin, top: rowY + 30 });
    let baseline: ReturnType<typeof renderImage> | undefined;
    let baselineCentres = new Map<string, Circle>();
    const variants = [];
    for (const [levelIndex, detailPreservation] of levels.entries()) {
      const settings = {
        ...DEFAULT_SETTINGS,
        mode: "dots" as const,
        widthMm: 400,
        heightMm: 500,
        detailPreservation,
      };
      const start = performance.now();
      const geometry = renderImage(input, settings);
      const renderMs = performance.now() - start;
      assert.deepEqual(
        geometry,
        renderImage(input, settings),
        `${id}/${detailPreservation}: deterministic`,
      );
      assert.ok(
        geometry.circles.length > 0 && geometry.circles.length <= 60000,
      );
      const clearGap = minimumGap(
        geometry.circles,
        geometry.stats.effectiveSpacingMm,
      );
      assert.ok(
        clearGap >= 0.249,
        `${id}/${detailPreservation}: minimum clear gap`,
      );
      for (const circle of geometry.circles) {
        assert.ok(
          circle.r * 2 >= settings.minDiameterMm - 0.0001 &&
            circle.r * 2 <= geometry.stats.effectiveMaxDiameterMm + 0.0001,
        );
        assert.ok(
          circle.x - circle.r >= settings.safeMarginMm - 0.0001 &&
            circle.y - circle.r >= settings.safeMarginMm - 0.0001,
        );
        assert.ok(
          circle.x + circle.r <=
            settings.widthMm - settings.safeMarginMm + 0.0001 &&
            circle.y + circle.r <=
              settings.heightMm - settings.safeMarginMm + 0.0001,
        );
      }
      if (!baseline) {
        baseline = geometry;
        baselineCentres = new Map(
          geometry.circles.map((circle) => [coordinate(circle), circle]),
        );
      }
      const currentCentres = new Map(
        geometry.circles.map((circle) => [coordinate(circle), circle]),
      );
      let changedRadii = 0,
        addedCentres = 0,
        removedCentres = 0;
      for (const [key, circle] of currentCentres) {
        const old = baselineCentres.get(key);
        if (!old) addedCentres++;
        else if (old.r !== circle.r) changedRadii++;
      }
      for (const key of baselineCentres.keys())
        if (!currentCentres.has(key)) removedCentres++;
      const finished = toSvg(geometry, "finished");
      const template = toSvg(geometry, "template", { background: false });
      const preview = await sharp(Buffer.from(finished))
        .resize(panelWidth, panelHeight)
        .png()
        .toBuffer();
      overlays.push({
        input: preview,
        left: margin + (levelIndex + 1) * (panelWidth + gap),
        top: rowY + 30,
      });
      annotations.push(
        label(
          `${geometry.stats.markCount.toLocaleString("en-GB")} marks / ${Math.round(geometry.stats.inkAreaMm2).toLocaleString("en-GB")} mm2`,
          margin + (levelIndex + 1) * (panelWidth + gap),
          rowY + 421,
          14,
          panelWidth,
        ),
      );
      variants.push({
        detailPreservation,
        settings,
        geometrySha256: hash(JSON.stringify(geometry)),
        primitiveSha256: hash(
          JSON.stringify({
            circles: geometry.circles,
            cells: geometry.cells,
            paths: geometry.paths,
            text: geometry.text,
          }),
        ),
        finishedSvgSha256: hash(finished),
        templateSvgSha256: hash(template),
        markCount: geometry.stats.markCount,
        inkAreaMm2: geometry.stats.inkAreaMm2,
        minimumClearGapMm: clearGap,
        minDiameterMm: Math.min(
          ...geometry.circles.map((circle) => circle.r * 2),
        ),
        maxDiameterMm: Math.max(
          ...geometry.circles.map((circle) => circle.r * 2),
        ),
        estimatedCompletionMinutes: geometry.stats.estimatedCompletionMinutes,
        measuredRenderMs: Math.round(renderMs * 10) / 10,
        deterministic: true,
        comparedWithDetailZero: {
          changedRadii,
          addedCentres,
          removedCentres,
          markCountDelta: geometry.stats.markCount - baseline.stats.markCount,
          inkAreaDeltaPercent:
            Math.round(
              (geometry.stats.inkAreaMm2 / baseline.stats.inkAreaMm2 - 1) *
                10000,
            ) / 100,
        },
        warnings: geometry.warnings,
      });
    }
    results.push({
      fixture: id,
      source: sourceRecord,
      croppedRgbaSha256: hash(data),
      crop: "EXIF-oriented, centre-cover 800 x 1000 RGBA, flattened white",
      variants,
    });
  }
  annotations.push(
    label(
      "Finer sampling can retain texture and noise. No measured likeness or physical-completion claim.",
      margin,
      sheetHeight - 18,
      16,
      sheetWidth - margin * 2,
    ),
  );
  overlays.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}">${annotations.join("")}</svg>`,
    ),
    left: 0,
    top: 0,
  });
  const sheet = await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 3,
      background: "#eee8dd",
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();
  await mkdir(output, { recursive: true });
  const sheetFile = "docs/detail-preservation-study.png";
  await writeFile(sheetFile, sheet);
  const report = {
    schemaVersion: 1,
    rendererVersion: RENDERER_VERSION,
    fontVersion: FONT_OUTLINE_VERSION,
    command: "node --import tsx scripts/build-detail-study.ts",
    method:
      "24 deterministic Dot renders: eight unchanged licensed photos, levels 0/0.5/1, same 400x500 mm canvas and settings. Detail blends the existing local area sample with a sample at 0.4 times its radius; broad edge emphasis is unchanged. Subject masking is off. This is a software comparison, not semantic segmentation or measured likeness, noise reduction, comfort or print validation.",
    timingScope:
      "One local Node render per variant; excludes decode/export. Order is 0,0.5,1 per source and is not randomized/warmed. Timings are diagnostic, not a browser/mobile performance guarantee.",
    physicalValidation: "NOT PERFORMED",
    sheet: {
      file: sheetFile,
      width: sheetWidth,
      height: sheetHeight,
      bytes: sheet.length,
      sha256: hash(sheet),
    },
    results,
  };
  await writeFile(
    "docs/detail-preservation-study.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        rendererVersion: RENDERER_VERSION,
        sheet: report.sheet,
        variants: results.length * levels.length,
        results: results.map((result) => ({
          fixture: result.fixture,
          marks: result.variants.map((v) => v.markCount),
          inkAreaMm2: result.variants.map((v) => v.inkAreaMm2),
          gapsMm: result.variants.map((v) => v.minimumClearGapMm),
          deltaAtOne: result.variants[2].comparedWithDetailZero,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
