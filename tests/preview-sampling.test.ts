import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  downsamplePreview,
  previewRasterPlan,
  previewSvgAtSize,
} from "../lib/preview-sampling";

test("Fit sampling follows screen density within fixed memory limits, and zoomed inspection stays vector", () => {
  const normal = previewRasterPlan(400, 500, 1, 1)!;
  const retina = previewRasterPlan(400, 500, 2, 1)!;
  assert.equal(normal.width, 400);
  assert.equal(retina.width, 800);
  assert.equal(retina.height, 1000);
  for (const [width, height, dpr] of [
    [320, 400, 1],
    [1920, 1080, 2],
    [16000, 9000, 8],
    [20, 20000, 4],
  ]) {
    const plan = previewRasterPlan(width, height, dpr, 1.5)!;
    assert.ok(plan.samples >= 2 && plan.samples <= 4);
    assert.ok(plan.width * plan.height <= 2_097_152);
    assert.ok(plan.sampleWidth * plan.sampleHeight <= 8_388_608);
    assert.ok(Math.max(plan.sampleWidth, plan.sampleHeight) <= 4096);
    assert.ok(
      Math.abs(plan.width / plan.height - width / height) <
        Math.max(0.005, 1 / plan.height),
    );
  }
  for (const zoom of [2, 3, 4, 8, 16])
    assert.equal(previewRasterPlan(400, 500, 2, zoom), null);
  for (const invalid of [0, -1, Infinity, NaN]) {
    assert.equal(previewRasterPlan(invalid, 500, 1, 1), null);
    assert.equal(previewRasterPlan(400, invalid, 1, 1), null);
    assert.equal(previewRasterPlan(400, 500, invalid, 1), null);
  }
});

test("preview raster bounds preserve every artwork primitive, physical viewBox and original SVG", () => {
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="500mm" viewBox="0 0 400 500" role="img"><path d="M1 2h3v4z"/><circle cx="3.1" cy="4.2" r=".5"/></svg>';
  const preview = previewSvgAtSize(source, 1200, 1500);
  assert.match(preview, /width="1200" height="1500"/);
  assert.match(preview, /viewBox="0 0 400 500"/);
  assert.equal(
    preview.slice(preview.indexOf(">")),
    source.slice(source.indexOf(">")),
  );
  assert.match(source, /width="400mm" height="500mm"/);
  assert.throws(() => previewSvgAtSize(source, 4097, 1));
  assert.throws(() => previewSvgAtSize(source, 10.5, 1));
  assert.throws(() => previewSvgAtSize("not an artwork", 1, 1));
});

test("area sampling preserves flat colour, transparent coverage and deterministic bytes without hidden-colour halos", () => {
  const flat = new Uint8ClampedArray(
    Array.from({ length: 16 }, () => [31, 85, 149, 255]).flat(),
  );
  const flatBefore = flat.slice();
  assert.deepEqual([...downsamplePreview(flat, 1, 1, 4)], [31, 85, 149, 255]);
  assert.deepEqual(flat, flatBefore);
  const edge = new Uint8ClampedArray([
    200, 20, 10, 255, 0, 255, 255, 0, 200, 20, 10, 255, 0, 255, 255, 0,
  ]);
  assert.deepEqual([...downsamplePreview(edge, 1, 1, 2)], [200, 20, 10, 128]);
  assert.deepEqual(
    downsamplePreview(edge, 1, 1, 2),
    downsamplePreview(edge, 1, 1, 2),
  );
  assert.deepEqual(
    [...downsamplePreview(new Uint8ClampedArray(16), 1, 1, 2)],
    [0, 0, 0, 0],
  );
  assert.throws(() => downsamplePreview(edge, 2, 1, 2));
  assert.throws(() => downsamplePreview(edge, 1, 1, 1));
  assert.throws(() => downsamplePreview(edge, 1, 1, 5));
});

test("subpixel dot coverage is closer to a 16x reference after Fit supersampling than direct tiny rasterization", async () => {
  const width = 96,
    height = 120;
  let marks = "";
  for (let y = -1; y < height + 1; y += 1.08) {
    for (let x = -1; x < width + 1; x += 1.08) {
      marks += `<circle cx="${x + 0.17}" cy="${y + 0.17}" r=".39" fill="#204020"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${marks}</svg>`;
  const [native, four, reference] = await Promise.all(
    [1, 4, 16].map((scale) =>
      sharp(Buffer.from(previewSvgAtSize(svg, width * scale, height * scale)))
        .ensureAlpha()
        .raw()
        .toBuffer(),
    ),
  );
  const integrated = downsamplePreview(
    new Uint8ClampedArray(four),
    width,
    height,
    4,
  );
  let nativeError = 0,
    integratedError = 0,
    count = 0;
  // Independent numerical integration, away from clipped canvas edges.
  for (let y = 4; y < height - 4; y++) {
    for (let x = 4; x < width - 4; x++) {
      let expected = 0;
      for (let sy = 0; sy < 16; sy++) {
        for (let sx = 0; sx < 16; sx++)
          expected += reference[((y * 16 + sy) * width * 16 + x * 16 + sx) * 4];
      }
      expected /= 256;
      const at = (y * width + x) * 4;
      nativeError += (native[at] - expected) ** 2;
      integratedError += (integrated[at] - expected) ** 2;
      count++;
    }
  }
  const nativeRmse = Math.sqrt(nativeError / count);
  const integratedRmse = Math.sqrt(integratedError / count);
  assert.ok(
    integratedRmse < nativeRmse / 2,
    `Native RMSE ${nativeRmse}; integrated ${integratedRmse}`,
  );
  assert.ok(
    integratedRmse < 3,
    `Subpixel coverage error ${integratedRmse}/255`,
  );
});
