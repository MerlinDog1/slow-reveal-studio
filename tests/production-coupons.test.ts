import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  FONT_OUTLINE_VERSION,
  RENDERER_VERSION,
  outlineLettering,
  toSvg,
} from "../lib/renderers";
import {
  buildProductionCoupons,
  couponObservationRecord,
  couponSheetSvg,
} from "../lib/production-coupons";

const close = (actual: number, expected: number, message: string) =>
  assert.ok(
    Math.abs(actual - expected) < 0.00001,
    `${message}: ${actual} != ${expected}`,
  );
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const pack = buildProductionCoupons();

test("coupon candidates cover the documented sweeps without normalizing away physical test values", () => {
  const samples = pack.sheets.slice(0, 2).flatMap((sheet) => sheet.samples);
  assert.equal(new Set(samples.map((sample) => sample.id)).size, 34);
  assert.deepEqual(
    samples
      .filter((sample) => sample.kind === "diameter")
      .map((sample) => sample.diameterMm),
    [0.8, 1, 1.2, 1.5, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    samples
      .filter((sample) => sample.kind === "gap")
      .map((sample) => sample.clearGapMm),
    [0.2, 0.4, 0.6, 0.8, 1],
  );
  const guides = samples.filter((sample) => sample.kind === "guide");
  assert.equal(guides.length, 20);
  assert.deepEqual(
    [...new Set(guides.map((sample) => sample.guideWidthMm))],
    [0.08, 0.12, 0.16, 0.2, 0.3],
  );
  assert.deepEqual(
    [...new Set(guides.map((sample) => sample.guideOpacity))],
    [0.1, 0.2, 0.3, 0.4],
  );
  for (const sample of samples) {
    const circles = sample.geometry.circles;
    assert.equal(circles.length, sample.kind === "guide" ? 3 : 8);
    circles.forEach((circle, index) => {
      close(
        circle.r * 2,
        sample.diameterMm ?? sample.diametersMm![index],
        `${sample.id} diameter`,
      );
      assert.ok(
        circle.x - circle.r >= 10 && circle.x + circle.r <= 180,
        `${sample.id} horizontal bounds`,
      );
      assert.ok(
        circle.y - circle.r >= 55 && circle.y + circle.r <= 224,
        `${sample.id} vertical bounds`,
      );
      if (sample.clearGapMm !== undefined && index > 0) {
        const previous = circles[index - 1];
        close(
          circle.x - circle.r - (previous.x + previous.r),
          sample.clearGapMm,
          `${sample.id} finished clear gap`,
        );
        assert.equal(circle.y, previous.y);
      }
    });
    const template = toSvg(sample.geometry, "template", { background: false });
    assert.ok(
      template.includes(`stroke-width="${sample.guideWidthMm}"`),
      `${sample.id} width preserved`,
    );
    assert.ok(
      template.includes(`opacity="${sample.guideOpacity}"`),
      `${sample.id} opacity preserved`,
    );
    const outputCircles = [
      ...template.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g),
    ];
    outputCircles.forEach((match, index) => {
      close(Number(match[1]), circles[index].x, "shared x");
      close(Number(match[2]), circles[index].y, "shared y");
      close(
        Number(match[3]) + sample.guideWidthMm / 2,
        circles[index].r,
        "guide ink outer boundary equals fill radius",
      );
    });
  }
});

test("coupon calibration measures 100 mm in both axes and a 20 mm centre-line square on every page", () => {
  for (const sheet of pack.sheets) {
    assert.equal(sheet.calibration.widthMm, 210);
    assert.equal(sheet.calibration.heightMm, 297);
    const [horizontal, vertical, ...rest] = sheet.calibration.paths;
    close(
      horizontal.points[1].x - horizontal.points[0].x,
      100,
      "X calibration",
    );
    close(vertical.points[1].y - vertical.points[0].y, 100, "Y calibration");
    assert.equal(horizontal.points[0].y, horizontal.points[1].y);
    assert.equal(vertical.points[0].x, vertical.points[1].x);
    assert.equal(rest.length, 23); // 22 ticks plus the square.
    const square = rest.at(-1)!;
    assert.deepEqual(square.points[0], square.points[4]);
    close(square.points[1].x - square.points[0].x, 20, "square width");
    close(square.points[2].y - square.points[1].y, 20, "square height");
    assert.ok(sheet.calibration.paths.every((line) => line.width === 0.2));
    assert.deepEqual(sheet.calibration, pack.sheets[0].calibration);
  }
});

test("guide and filled pages share geometry and every annotation stays inside A4 with outlined type", () => {
  assert.deepEqual(pack.sheets[0].samples, pack.sheets[2].samples);
  assert.deepEqual(pack.sheets[1].samples, pack.sheets[3].samples);
  assert.equal(pack.rendererVersion, RENDERER_VERSION);
  assert.equal(pack.fontVersion, FONT_OUTLINE_VERSION);
  assert.deepEqual(pack, buildProductionCoupons());
  for (const sheet of pack.sheets) {
    for (const text of sheet.annotations) {
      const { bounds, glyphs } = outlineLettering(text);
      assert.ok(glyphs.length > 0, text.value);
      assert.ok(
        bounds.x >= 8 && bounds.x + bounds.width <= 203,
        `Horizontal label bounds: ${text.value}`,
      );
      assert.ok(
        bounds.y >= 8 && bounds.y + bounds.height <= 291,
        `Vertical label bounds: ${text.value}`,
      );
    }
    const svg = couponSheetSvg(sheet);
    assert.match(svg, /width="210mm" height="297mm" viewBox="0 0 210 297"/);
    assert.doesNotMatch(svg, /<text\b|font-family=/);
    assert.match(svg, /data-lettering="outlines"/);
    assert.match(svg, /data-annotation="solid-black"/);
    assert.match(svg, /Print at 100% \/ Actual size. Never use Fit to page./);
    assert.match(svg, /No substrate, marker or setting is approved/);
    assert.equal(svg, couponSheetSvg(JSON.parse(JSON.stringify(sheet))));
  }
});

test("blank observation record has all 34 IDs and no recorded trial or production approval", () => {
  const record = couponObservationRecord(pack);
  const rows = record
    .split("\n")
    .filter((line) => /^\| (D\d|G\d|W\d)/.test(line));
  assert.equal(rows.length, 34);
  assert.ok(rows.every((row) => row.endsWith("|  |  |  |  |  |")));
  assert.match(record, /blank form grants no production approval/);
  assert.match(record, /digital targets, not completed trials/);
  assert.match(record, /PDF file SHA-256 \(from manifest\): __________/);
});

test("generated PDF, vectors and manifest are consistent, exact-size and public-copy identical", async () => {
  const manifest = JSON.parse(
    await readFile("output/pdf/srs-dot-coupons-manifest.json", "utf8"),
  );
  assert.equal(manifest.uniqueSamples, 34);
  assert.deepEqual(manifest.page, {
    widthMm: 210,
    heightMm: 297,
    dpi: 300,
    count: 4,
    widthPx: 2480,
    heightPx: 3508,
    pdfWidthPt: (210 * 72) / 25.4,
    pdfHeightPt: (297 * 72) / 25.4,
  });
  for (const artifact of manifest.artifacts as {
    file: string;
    bytes: number;
    sha256: string;
    ignoredReviewIntermediate?: boolean;
  }[]) {
    // Large PNG review files are intentionally ignored; validate them if generated locally.
    const bytes = await readFile(artifact.file).catch((error) => {
      if (artifact.ignoredReviewIntermediate && error.code === "ENOENT")
        return null;
      throw error;
    });
    if (!bytes) continue;
    assert.equal(bytes.length, artifact.bytes, artifact.file);
    assert.equal(sha256(bytes), artifact.sha256, artifact.file);
    if (artifact.file.endsWith(".png")) {
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, 2480);
      assert.equal(metadata.height, 3508);
      assert.equal(metadata.density, 300);
    }
  }
  const geometry = JSON.parse(
    await readFile("output/pdf/srs-dot-coupons/geometry.json", "utf8"),
  );
  assert.deepEqual(
    geometry,
    pack,
    "Rebuild coupons after changing the shared helper or renderer version.",
  );
  for (const sheet of pack.sheets)
    assert.equal(
      await readFile(`output/pdf/srs-dot-coupons/${sheet.id}.svg`, "utf8"),
      couponSheetSvg(sheet),
    );
  const canonical = await readFile(manifest.publicCopy.canonical);
  assert.deepEqual(await readFile(manifest.publicCopy.public), canonical);
  assert.equal(manifest.publicCopy.byteIdentical, true);
  assert.equal(manifest.publicCopy.sha256, sha256(canonical));
  const pdf = canonical.toString("latin1");
  const mediaBoxes = [
    ...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g),
  ];
  assert.equal(mediaBoxes.length, 4);
  assert.equal([...pdf.matchAll(/\/Type \/Page\b/g)].length, 4);
  for (const box of mediaBoxes) {
    close((Number(box[1]) * 25.4) / 72, 210, "PDF page width mm");
    close((Number(box[2]) * 25.4) / 72, 297, "PDF page height mm");
  }
  assert.equal(
    manifest.sheets[0].sampleGeometrySha256,
    manifest.sheets[2].sampleGeometrySha256,
  );
  assert.equal(
    manifest.sheets[1].sampleGeometrySha256,
    manifest.sheets[3].sampleGeometrySha256,
  );
});
