import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  MAX_MARKS,
  normalizeSettings,
  renderImage,
  toSvg,
  type Circle,
  type PixelImage,
  type RenderGeometry,
  type RenderMode,
  type RenderSettings,
} from "../lib/renderers";
import {
  maskRasterDimensions,
  encodeSubjectMaskData,
  type SubjectMask,
} from "../lib/subject-mask";

function image(
  pixel: (x: number, y: number, width: number, height: number) => number,
  width = 96,
  height = 120,
): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = pixel(x, y, width, height);
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  return { data, width, height };
}
function settings(patch: Partial<RenderSettings> = {}): RenderSettings {
  return {
    ...DEFAULT_SETTINGS,
    widthMm: 120,
    heightMm: 160,
    safeMarginMm: 6,
    ...patch,
  };
}
function primitives(geometry: RenderGeometry) {
  return {
    circles: geometry.circles,
    cells: geometry.cells,
    paths: geometry.paths,
    text: geometry.text,
  };
}
const centreKey = (dot: Circle) => `${dot.x},${dot.y}`;
const coverage = (dot: Circle, maximumDiameter: number) =>
  ((2 * dot.r) / maximumDiameter) ** 2;
const neutral = () =>
  settings({
    contrast: 1,
    brightness: 0,
    gamma: 1,
    autoExposure: false,
    threshold: 0,
    edgeEmphasis: 0,
    minDiameterMm: 0.3,
  });

test("missing and zero detail preserve exact renderer1.2 primitives in every mode", () => {
  // Captured from 7ed5e92 before introducing the new control. Settings/version
  // metadata intentionally is not part of this geometry compatibility contract.
  const hashes: Record<RenderMode, string> = {
    dots: "ae8a19e8eeeb031911d15d6c32b88f6155f0feb0cb1a715d8590036fdb9df9d0",
    mosaic: "122023433f1cf350b53895f208b1cf6da0092dd1e1430bfd41fefdda6ba94757",
    contour: "e17270100bc8ace87bd6c38b621393b98f03a3731a6e7eda51cbb0fa8103808a",
    "line-amplification":
      "68a80f5164c964f7a3576405407afcde361bd0551db8d084ba2d26aa21b7018b",
  };
  const photo = image((x, y) => (x * 17 + y * 23 + (x ^ y) * 5) % 256);
  for (const mode of Object.keys(hashes) as RenderMode[]) {
    const oldSettings = settings({ mode });
    delete oldSettings.detailPreservation;
    const legacy = renderImage(photo, oldSettings);
    const zero = renderImage(photo, { ...oldSettings, detailPreservation: 0 });
    assert.deepEqual(primitives(legacy), primitives(zero));
    assert.equal(
      createHash("sha256")
        .update(JSON.stringify(primitives(zero)))
        .digest("hex"),
      hashes[mode],
    );
    assert.equal(legacy.settings.detailPreservation, 0);
    if (mode !== "dots")
      assert.deepEqual(
        primitives(
          renderImage(photo, { ...oldSettings, detailPreservation: 1 }),
        ),
        primitives(zero),
      );
  }
});

test("detail recovers narrow dark and light features at fixed physical centres independently of edge gain", () => {
  const s = neutral();
  const lattice = renderImage(
    image(() => 0),
    s,
  );
  const target = lattice.circles.reduce((best, dot) =>
    Math.hypot(dot.x - 60, dot.y - 80) < Math.hypot(best.x - 60, best.y - 80)
      ? dot
      : best,
  );
  const targetU =
    (target.x - s.safeMarginMm) / (s.widthMm - 2 * s.safeMarginMm);
  const feature = (kind: "dark" | "light" | "pair") =>
    image(
      (x, _y, width) => {
        const distanceMm =
          Math.abs((x + 0.5) / width - targetU) *
          (s.widthMm - 2 * s.safeMarginMm);
        if (kind === "pair")
          return distanceMm < 0.5 ? 0 : distanceMm < 1 ? 255 : 128;
        return distanceMm < 0.5
          ? kind === "dark"
            ? 0
            : 255
          : kind === "dark"
            ? 255
            : 0;
      },
      800,
      1000,
    );
  const atTarget = (photo: PixelImage, patch: Partial<RenderSettings>) => {
    const geometry = renderImage(photo, { ...s, ...patch });
    const dot = geometry.circles.find(
      (item) => centreKey(item) === centreKey(target),
    );
    return dot ? coverage(dot, geometry.stats.effectiveMaxDiameterMm) : 0;
  };
  const dark = feature("dark"),
    light = feature("light"),
    pair = feature("pair");
  const darkCoarse = atTarget(dark, { detailPreservation: 0 });
  const darkFine = atTarget(dark, { detailPreservation: 1 });
  const lightCoarse = atTarget(light, { detailPreservation: 0 });
  const lightFine = atTarget(light, { detailPreservation: 1 });
  assert.ok(
    darkFine - darkCoarse > 0.3,
    "narrow dark structure should retain more dot area",
  );
  assert.ok(
    lightCoarse - lightFine > 0.3,
    "narrow light structure should retain negative space",
  );
  assert.ok(
    atTarget(pair, { detailPreservation: 1 }) >
      atTarget(pair, { detailPreservation: 0, edgeEmphasis: 2 }) + 0.12,
    "small-scale sampling must differ from simply increasing broad edge gain",
  );
});

test("flat fields stay unchanged and noisy-field detail is a bounded blend rather than extra contrast gain", () => {
  const s = neutral();
  for (const value of [0, 80, 160, 255]) {
    const photo = image(() => value);
    const unchanged = renderImage(photo, s);
    for (const detailPreservation of [0.25, 0.5, 1])
      assert.deepEqual(
        primitives(renderImage(photo, { ...s, detailPreservation })),
        primitives(unchanged),
      );
  }
  const noise = image(
    (x, y) =>
      108 +
      (((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0) % 41),
    400,
    500,
  );
  const coarse = renderImage(noise, { ...s, detailPreservation: 0 });
  const mid = renderImage(noise, { ...s, detailPreservation: 0.5 });
  const fine = renderImage(noise, { ...s, detailPreservation: 1 });
  assert.equal(coarse.circles.length, fine.circles.length);
  assert.equal(mid.circles.length, fine.circles.length);
  for (let i = 0; i < fine.circles.length; i++) {
    assert.equal(centreKey(coarse.circles[i]), centreKey(fine.circles[i]));
    const low = coverage(
      coarse.circles[i],
      coarse.stats.effectiveMaxDiameterMm,
    );
    const middle = coverage(mid.circles[i], mid.stats.effectiveMaxDiameterMm);
    const high = coverage(fine.circles[i], fine.stats.effectiveMaxDiameterMm);
    assert.ok(Math.abs(middle - (low + high) / 2) < 0.0002);
    assert.ok(
      high >= 1 - 148 / 255 - 0.0002 && high <= 1 - 108 / 255 + 0.0002,
      "fine sampling cannot amplify grain beyond its source range when edge gain is off",
    );
  }
  assert.deepEqual(fine.stats.meanLuminance, coarse.stats.meanLuminance);
  assert.deepEqual(fine.stats.exposureScale, coarse.stats.exposureScale);
});

test("detail keeps deterministic physical bounds, printable diameters, clear gaps and mark limits", () => {
  const s = settings({
    widthMm: 500,
    heightMm: 700,
    spacingMm: 0.5,
    minDiameterMm: 0.3,
    maxDiameterMm: 25,
    density: 3,
    detailPreservation: 1,
    edgeEmphasis: 2,
  });
  const photo = image((x, y) => (x * 37 + y * 7) % 200);
  const geometry = renderImage(photo, s);
  assert.ok(
    geometry.circles.length > 10000 && geometry.circles.length <= MAX_MARKS,
  );
  const buckets = new Map<string, Circle[]>();
  const pitch = geometry.stats.effectiveSpacingMm;
  for (const dot of geometry.circles) {
    assert.ok([dot.x, dot.y, dot.r].every(Number.isFinite));
    assert.ok(dot.r * 2 >= s.minDiameterMm - 0.0001);
    assert.ok(dot.r * 2 <= geometry.stats.effectiveMaxDiameterMm + 0.0001);
    assert.ok(dot.x - dot.r >= s.safeMarginMm - 0.0001);
    assert.ok(dot.y - dot.r >= s.safeMarginMm - 0.0001);
    assert.ok(dot.x + dot.r <= s.widthMm - s.safeMarginMm + 0.0001);
    assert.ok(dot.y + dot.r <= s.heightMm - s.safeMarginMm + 0.0001);
    const x = Math.floor(dot.x / pitch),
      y = Math.floor(dot.y / pitch);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const other of buckets.get(`${x + dx},${y + dy}`) ?? [])
          assert.ok(
            Math.hypot(dot.x - other.x, dot.y - other.y) - dot.r - other.r >=
              0.249,
          );
    const key = `${x},${y}`;
    buckets.set(key, [...(buckets.get(key) ?? []), dot]);
  }
  assert.deepEqual(renderImage(photo, s), geometry);
  assert.equal(
    toSvg(geometry, "template"),
    toSvg(JSON.parse(JSON.stringify(geometry)), "template"),
  );
});

test("detail retains physical sampling scale across resolutions and inversion, with mask suppression last", () => {
  const s = neutral();
  const make = (width: number, height: number, inverted: boolean) =>
    image(
      (x, y) => {
        const value =
          (Math.floor((x * 12) / width) + Math.floor((y * 16) / height)) % 2
            ? 180
            : 30;
        return inverted ? 255 - value : value;
      },
      width,
      height,
    );
  const base = renderImage(make(600, 800, false), {
    ...s,
    detailPreservation: 0.8,
  });
  const inverted = renderImage(make(600, 800, true), {
    ...s,
    detailPreservation: 0.8,
    invert: true,
  });
  assert.deepEqual(inverted.circles, base.circles);
  // Constant detail input makes exact geometry parity independent of source raster size.
  assert.deepEqual(
    renderImage(
      image(() => 50, 60, 80),
      { ...s, detailPreservation: 1 },
    ).circles,
    renderImage(
      image(() => 50, 600, 800),
      { ...s, detailPreservation: 1 },
    ).circles,
  );
  const dimensions = maskRasterDimensions(s.widthMm, s.heightMm);
  const selection: SubjectMask = {
    version: 1,
    space: "cropped-v1",
    sourceSha256: "ab".repeat(32),
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    widthMm: s.widthMm,
    heightMm: s.heightMm,
    ...dimensions,
    data: encodeSubjectMaskData(
      new Uint8Array(dimensions.width * dimensions.height),
    ),
    feather: 0.05,
  };
  for (const invert of [false, true])
    assert.equal(
      renderImage(
        make(600, 800, invert),
        {
          ...s,
          detailPreservation: 1,
          edgeEmphasis: 2,
          subjectMaskStrength: 1,
          invert,
        },
        selection,
      ).circles.length,
      0,
    );
});

test("detail settings reject invalid strengths and normalize legacy omission without changing presets", () => {
  for (const value of [-0.01, 1.01, NaN, Infinity, "0.5", null])
    assert.throws(
      () =>
        normalizeSettings({
          ...settings(),
          detailPreservation: value,
        } as RenderSettings),
      /detailPreservation/,
    );
  assert.equal(
    normalizeSettings(settings({ detailPreservation: undefined }))
      .detailPreservation,
    0,
  );
  for (const detailPreservation of [0, 0.3, 1])
    assert.equal(
      normalizeSettings(settings({ detailPreservation })).detailPreservation,
      detailPreservation,
    );
});
