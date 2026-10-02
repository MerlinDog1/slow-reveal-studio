import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SUBJECT_MASK_PIXELS,
  assertSubjectMaskBinding,
  createSubjectMaskSampler,
  decodeSubjectMaskData,
  encodeSubjectMaskData,
  maskRasterDimensions,
  normalizeSubjectMask,
  type SubjectMask,
  type SubjectMaskBinding,
} from "../lib/subject-mask";
import {
  DEFAULT_SETTINGS,
  RENDERER_VERSION,
  normalizeSettings,
  renderImage,
  toSvg,
  type PixelImage,
  type RenderMode,
  type RenderSettings,
} from "../lib/renderers";
import { hashBlob } from "../lib/browser-subject-mask";
import {
  validateRestorableProject,
  parseLocalPresets,
  parsePublishedPresets,
  applyStudioPreset,
} from "../lib/studio-state";
import { presetSettings } from "../lib/preset-types";
import { orderReviewDetails } from "../lib/order-review";
import type { Order } from "../lib/server/schema";

const binding: SubjectMaskBinding = {
  sourceSha256: "a1".repeat(32),
  crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
  widthMm: 120,
  heightMm: 160,
};
function mask(
  alpha:
    | number
    | ((x: number, y: number, width: number, height: number) => number) = 255,
  patch: Partial<SubjectMaskBinding> & { feather?: number } = {},
): SubjectMask {
  const physical = { ...binding, ...patch };
  const { width, height } = maskRasterDimensions(
    physical.widthMm,
    physical.heightMm,
  );
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data[y * width + x] =
        typeof alpha === "number" ? alpha : alpha(x, y, width, height);
  return normalizeSubjectMask({
    version: 1,
    space: "cropped-v1",
    ...physical,
    width,
    height,
    data: encodeSubjectMaskData(data),
    feather: patch.feather ?? 0,
  });
}
function source(value = 0, width = 96, height = 128): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4)
    data.set([value, value, value, 255], i);
  return { data, width, height };
}
function settings(patch: Partial<RenderSettings> = {}): RenderSettings {
  return {
    ...DEFAULT_SETTINGS,
    widthMm: binding.widthMm,
    heightMm: binding.heightMm,
    safeMarginMm: 6,
    autoExposure: false,
    ...patch,
  };
}

test("mask codec is bounded, canonical and lossless for alpha8 and JSON round trips", () => {
  for (const [widthMm, heightMm] of [
    [30, 1500],
    [400, 500],
    [500, 400],
    [400, 400],
  ]) {
    const selection = mask((x, y) => (x * 17 + y * 11) % 256, {
      widthMm,
      heightMm,
    });
    assert.equal(Math.max(selection.width, selection.height), 512);
    assert.ok(selection.width * selection.height <= MAX_SUBJECT_MASK_PIXELS);
    assert.ok(
      Math.abs(selection.width / selection.height - widthMm / heightMm) <=
        1 / selection.height,
    );
    const bytes = decodeSubjectMaskData(selection);
    assert.equal(selection.data, Buffer.from(bytes).toString("base64"));
    assert.equal(bytes.length, selection.width * selection.height);
    for (const i of [0, 1, Math.floor(bytes.length / 2), bytes.length - 1]) {
      const x = i % selection.width,
        y = Math.floor(i / selection.width);
      assert.equal(bytes[i], (x * 17 + y * 11) % 256);
    }
    assert.deepEqual(
      normalizeSubjectMask(JSON.parse(JSON.stringify(selection))),
      selection,
    );
    assert.deepEqual(decodeSubjectMaskData(selection), bytes);
  }
  const uppercase = mask(255, {
    sourceSha256: binding.sourceSha256.toUpperCase(),
  });
  assert.equal(uppercase.sourceSha256, binding.sourceSha256);
  const normalized = normalizeSubjectMask(uppercase);
  normalized.crop.x = 0.25;
  assert.equal(
    uppercase.crop.x,
    0,
    "normalization does not share a mutable crop reference",
  );
});

test("malformed, oversized and noncanonical masks fail before sampling", () => {
  const selection = mask(0, { widthMm: 400, heightMm: 500 });
  const invalid: unknown[] = [
    null,
    [],
    {},
    { ...selection, version: 2 },
    { ...selection, space: "source" },
    { ...selection, sourceSha256: "not-a-source-hash" },
    { ...selection, width: selection.width + 1 },
    { ...selection, height: 513 },
    { ...selection, widthMm: Infinity },
    { ...selection, heightMm: 0 },
    { ...selection, feather: -0.01 },
    { ...selection, feather: 0.051 },
    { ...selection, feather: NaN },
    { ...selection, feather: "0.01" },
    { ...selection, crop: { ...selection.crop, zoom: 5 } },
    { ...selection, crop: { ...selection.crop, x: -1.01 } },
    { ...selection, crop: { ...selection.crop, y: Infinity } },
    { ...selection, crop: { ...selection.crop, rotation: 45 } },
    { ...selection, crop: { ...selection.crop, extra: true } },
    { ...selection, privateUrl: "https://example.test/photo" },
    { ...selection, data: selection.data.slice(0, -1) },
    { ...selection, data: ` ${selection.data.slice(1)}` },
    { ...selection, data: `_${selection.data.slice(1)}` },
    { ...selection, data: `${selection.data.slice(0, -2)}AA` },
    {
      ...selection,
      data: "A".repeat(Math.ceil((MAX_SUBJECT_MASK_PIXELS + 1) / 3) * 4),
    },
  ];
  for (const value of invalid)
    assert.throws(() => normalizeSubjectMask(value), /mask/i);
  for (const dimensions of [
    [NaN, 400],
    [400, 0],
    [1501, 500],
  ])
    assert.throws(
      () => maskRasterDimensions(dimensions[0], dimensions[1]),
      /dimensions/,
    );
  for (const data of [
    new Uint8Array(),
    new Uint8Array(MAX_SUBJECT_MASK_PIXELS + 1),
  ])
    assert.throws(() => encodeSubjectMaskData(data), /alpha data/);
  // Both legal padding lengths must also have zero unused bits, even if atob accepts them.
  for (const widthMm of [400, 399]) {
    const canonical = mask(0, { widthMm, heightMm: 500 });
    const body = canonical.data.replace(/=+$/, "");
    const bad = body.slice(0, -1) + "B" + canonical.data.slice(body.length);
    assert.deepEqual(
      Buffer.from(bad, "base64"),
      Buffer.from(canonical.data, "base64"),
    );
    assert.throws(
      () => normalizeSubjectMask({ ...canonical, data: bad }),
      /padding bits/,
    );
  }
});

test("mask binding rejects every changed photo, crop and physical dimension", () => {
  const selection = mask();
  assert.doesNotThrow(() => assertSubjectMaskBinding(selection, binding));
  const changed: SubjectMaskBinding[] = [
    { ...binding, sourceSha256: "b2".repeat(32) },
    { ...binding, widthMm: 240, heightMm: 320 }, // Same aspect is insufficient.
    { ...binding, widthMm: 121 },
    { ...binding, heightMm: 161 },
    ...Object.entries({ zoom: 1.01, x: 0.001, y: -0.001, rotation: 90 }).map(
      ([key, value]) => ({
        ...binding,
        crop: { ...binding.crop, [key]: value },
      }),
    ),
  ];
  for (const expected of changed)
    assert.throws(
      () => assertSubjectMaskBinding(selection, expected),
      /different photo, crop or canvas/,
    );
  assert.deepEqual(selection.crop, binding.crop);
});

test("feather sampling matches an independent bounded box average including clamped edges", () => {
  const selection = mask((x, y) => (x * 19 + y * 7) % 256, {
    widthMm: 400,
    heightMm: 400,
    feather: 0.05,
  });
  const bytes = decodeSubjectMaskData(selection);
  const sample = createSubjectMaskSampler(selection);
  const radius = Math.round(
    selection.feather * Math.min(selection.width, selection.height),
  );
  for (const [x, y] of [
    [0, 0],
    [5, 2],
    [255, 250],
    [511, 511],
  ]) {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.max(0, Math.min(selection.width - 1, x + dx));
        const yy = Math.max(0, Math.min(selection.height - 1, y + dy));
        sum += bytes[yy * selection.width + xx];
      }
    const expected = sum / (radius * 2 + 1) ** 2 / 255;
    assert.ok(Math.abs(sample(x / 511, y / 511) - expected) < 1e-12);
  }
  for (const alpha of [0, 255]) {
    const constant = createSubjectMaskSampler(mask(alpha, { feather: 0.05 }));
    for (const point of [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [-1, 2],
    ])
      assert.equal(constant(point[0], point[1]), alpha / 255);
  }
  assert.throws(() => sample(NaN, 0), /finite/);
  assert.throws(() => sample(0, Infinity), /finite/);
});

test("bilinear mask coverage and feather transitions are independent of preview pixels", () => {
  const hardMask = mask((x, _y, width) => (x < width / 2 ? 255 : 0));
  const hard = createSubjectMaskSampler(hardMask);
  const soft = createSubjectMaskSampler({ ...hardMask, feather: 0.05 });
  assert.equal(hard(0.5, 0.5), 0.5);
  assert.equal(hard(0.47, 0.5), 1);
  assert.equal(hard(0.53, 0.5), 0);
  assert.ok(soft(0.47, 0.5) < 1 && soft(0.47, 0.5) > 0.5);
  assert.ok(soft(0.53, 0.5) > 0 && soft(0.53, 0.5) < 0.5);
  assert.equal(soft(0.25, 0.5), 1);
  assert.equal(soft(0.75, 0.5), 0);
  const s = settings({ subjectMaskStrength: 1 });
  assert.deepEqual(
    renderImage(source(0, 30, 40), s, hardMask).circles,
    renderImage(source(0, 300, 400), s, hardMask).circles,
  );
});

test("zero strength is an exact no-op and full alpha preserves unmasked Dots primitives", () => {
  const photo = source(70);
  const base = renderImage(photo, settings());
  assert.deepEqual(
    renderImage(photo, settings({ subjectMaskStrength: 0 }), mask(0)),
    base,
  );
  const full = renderImage(
    photo,
    settings({ subjectMaskStrength: 1 }),
    mask(255, { feather: 0.05 }),
  );
  assert.deepEqual(full.circles, base.circles);
  assert.deepEqual(full.stats, base.stats);
  assert.match(
    full.warnings.join(" "),
    /Manual subject mask.*No automatic segmentation/,
  );
  assert.equal("subjectMask" in full, false);
  assert.equal("subjectMask" in full.settings, false);
  assert.equal(JSON.stringify(full).includes(binding.sourceSha256), false);
});

test("manual mask suppresses background after inversion and edge emphasis without changing foreground or print safeguards", () => {
  const selection = mask((x, _y, width) => (x < width / 2 ? 255 : 0));
  for (const invert of [false, true]) {
    const photo = source(invert ? 255 : 0);
    const s = settings({
      invert,
      edgeEmphasis: 2,
      minDiameterMm: 1.3,
      subjectMaskStrength: 1,
    });
    const unmasked = renderImage(photo, { ...s, subjectMaskStrength: 0 });
    const geometry = renderImage(photo, s, selection);
    const baseByCentre = new Map(
      unmasked.circles.map((dot) => [`${dot.x},${dot.y}`, dot]),
    );
    assert.ok(
      geometry.circles.length > 0 &&
        geometry.circles.length < unmasked.circles.length,
    );
    for (const dot of geometry.circles) {
      const original = baseByCentre.get(`${dot.x},${dot.y}`)!;
      assert.ok(original, "mask cannot move a lattice centre");
      assert.ok(dot.r <= original.r);
      assert.ok(dot.r * 2 >= s.minDiameterMm - 0.0001);
      const u = (dot.x - s.safeMarginMm) / (s.widthMm - 2 * s.safeMarginMm);
      assert.ok(u < 0.51, "fully suppressed background must contain no dots");
      if (u < 0.45) assert.deepEqual(dot, original);
      assert.ok(dot.x - dot.r >= s.safeMarginMm - 0.0001);
      assert.ok(dot.y - dot.r >= s.safeMarginMm - 0.0001);
      assert.ok(dot.y + dot.r <= s.heightMm - s.safeMarginMm + 0.0001);
    }
    // No centre moves and no radius grows: existing gaps can only increase.
    for (let i = 0; i < geometry.circles.length; i++)
      for (let j = i + 1; j < geometry.circles.length; j++) {
        const a = geometry.circles[i],
          b = geometry.circles[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r >= 0.249);
      }
    assert.equal(renderImage(photo, s, mask(0)).circles.length, 0);
    const partial = renderImage(
      photo,
      { ...s, subjectMaskStrength: 0.5 },
      mask(0),
    );
    assert.ok(
      partial.stats.inkAreaMm2 > 0 &&
        partial.stats.inkAreaMm2 < unmasked.stats.inkAreaMm2,
    );
  }
});

test("active masks require valid selection across modes; frozen serialized selections yield deterministic SVG", () => {
  assert.equal(
    normalizeSettings(settings({ subjectMaskStrength: undefined }))
      .subjectMaskStrength,
    0,
  );
  for (const strength of [-0.001, 1.001, NaN, Infinity])
    assert.throws(
      () => renderImage(source(), settings({ subjectMaskStrength: strength })),
      /subjectMaskStrength/,
    );
  assert.throws(
    () => renderImage(source(), settings({ subjectMaskStrength: 1 })),
    /Paint a subject selection/,
  );
  for (const mode of [
    "mosaic",
    "contour",
    "line-amplification",
  ] as RenderMode[])
    assert.doesNotThrow(() =>
      renderImage(source(), settings({ mode, subjectMaskStrength: 1 }), mask()),
    );
  assert.throws(
    () =>
      renderImage(
        source(),
        settings(),
        mask(255, { widthMm: 240, heightMm: 320 }),
      ),
    /canvas size/,
  );
  const selection = mask((x, y) => (x + y) % 256, { feather: 0.01 });
  Object.freeze(selection.crop);
  Object.freeze(selection);
  const s = settings({ subjectMaskStrength: 0.72 });
  const first = renderImage(source(45), s, selection);
  const second = renderImage(
    source(45),
    s,
    JSON.parse(JSON.stringify(selection)),
  );
  assert.deepEqual(first, second);
  assert.equal(toSvg(first, "template"), toSvg(second, "template"));
});

test("render worker forwards a private mask and returns structured errors when it is missing", async () => {
  const previousHandler = Object.getOwnPropertyDescriptor(
    globalThis,
    "onmessage",
  );
  const previousPost = Object.getOwnPropertyDescriptor(
    globalThis,
    "postMessage",
  );
  const responses: {
    id: number;
    geometry?: ReturnType<typeof renderImage>;
    error?: string;
  }[] = [];
  Object.defineProperty(globalThis, "postMessage", {
    configurable: true,
    value: (message: (typeof responses)[number]) => responses.push(message),
  });
  try {
    await import("../workers/render.worker");
    const scope = globalThis as unknown as {
      onmessage: (event: { data: unknown }) => void;
    };
    const s = settings({ subjectMaskStrength: 1 });
    scope.onmessage({
      data: { id: 1, input: source(), settings: s, subjectMask: mask(0) },
    });
    scope.onmessage({ data: { id: 2, input: source(), settings: s } });
    assert.equal(responses[0].id, 1);
    assert.equal(responses[0].geometry?.circles.length, 0);
    assert.equal(responses[0].error, undefined);
    assert.equal(responses[1].id, 2);
    assert.equal(responses[1].geometry, undefined);
    assert.match(responses[1].error!, /Paint a subject selection/);
  } finally {
    if (previousHandler)
      Object.defineProperty(globalThis, "onmessage", previousHandler);
    else Reflect.deleteProperty(globalThis, "onmessage");
    if (previousPost)
      Object.defineProperty(globalThis, "postMessage", previousPost);
    else Reflect.deleteProperty(globalThis, "postMessage");
  }
});

test("restoration preserves valid private masks, rejects missing/stale selection and keeps legacy settings usable", async () => {
  const image = new Blob(["Original private photo fixture"], {
    type: "image/jpeg",
  });
  const selection = mask(255, { sourceSha256: await hashBlob(image) });
  const saved = {
    id: "current",
    name: "Private fixture",
    updatedAt: "2026-09-28T00:00:00Z",
    image,
    settings: settings({ subjectMaskStrength: 0.7 }),
    crop: binding.crop,
    productId: "30x40",
    finishId: "rolled",
    rendererVersion: RENDERER_VERSION,
    subjectMask: selection,
  };
  const before = JSON.stringify(saved);
  const restored = validateRestorableProject(saved, ["dots"]);
  assert.deepEqual(restored.project.subjectMask, selection);
  assert.equal(restored.project.settings.subjectMaskStrength, 0.7);
  assert.equal(restored.needsRendererReview, false);
  assert.doesNotThrow(() =>
    assertSubjectMaskBinding(restored.project.subjectMask!, {
      ...binding,
      sourceSha256: selection.sourceSha256,
    }),
  );
  for (const change of [
    { subjectMask: undefined },
    { subjectMask: { ...selection, data: "broken" } },
    { crop: { ...binding.crop, zoom: 1.1 } },
    { settings: { ...saved.settings, widthMm: 121 } },
  ])
    assert.throws(
      () =>
        validateRestorableProject({ ...saved, ...change }, ["dots", "mosaic"]),
      /subject|mask|selection/i,
    );
  const otherImage = new Blob(["Different private photo fixture"], {
    type: "image/jpeg",
  });
  const unverified = validateRestorableProject(
    { ...saved, image: otherImage },
    ["dots"],
  );
  const otherHash = await hashBlob(unverified.project.image);
  assert.throws(
    () =>
      assertSubjectMaskBinding(unverified.project.subjectMask!, {
        ...binding,
        sourceSha256: otherHash,
      }),
    /different photo/,
  );
  assert.equal(
    JSON.stringify(saved),
    before,
    "failed checks never overwrite the saved original",
  );
  const legacySettings = { ...DEFAULT_SETTINGS };
  delete legacySettings.subjectMaskStrength;
  const legacy = validateRestorableProject(
    {
      ...saved,
      settings: legacySettings,
      subjectMask: undefined,
      rendererVersion: "slow-reveal-geometry/1.1.0",
    },
    ["dots"],
  );
  assert.equal(legacy.project.settings.subjectMaskStrength, 0);
  assert.equal(legacy.needsRendererReview, true);
});

test("preset ingestion and copying exclude private selection data and cannot alter active strength", () => {
  const selection = mask(255);
  const contaminated = {
    ...settings({ subjectMaskStrength: 0.8 }),
    subjectMask: selection,
    data: selection.data,
    sourceSha256: selection.sourceSha256,
    crop: selection.crop,
    text: { value: "Private lettering" },
  };
  const copied = presetSettings(contaminated);
  for (const key of [
    "subjectMask",
    "subjectMaskStrength",
    "data",
    "sourceSha256",
    "crop",
    "text",
  ])
    assert.equal(key in copied, false, key);
  const local = parseLocalPresets([
    { name: "Safe tuning", settings: contaminated, subjectMask: selection },
  ]);
  assert.equal(local.length, 1);
  assert.equal(local[0].settings.subjectMaskStrength, 0);
  assert.equal(JSON.stringify(local).includes(selection.sourceSha256), false);
  assert.equal(JSON.stringify(local).includes("Private lettering"), false);
  const published = parsePublishedPresets(
    {
      presets: [
        {
          id: "safe-tuning",
          version: 1,
          name: "Safe tuning",
          description: "Fixture",
          mode: "dots",
          rendererVersion: RENDERER_VERSION,
          settings: contaminated,
        },
      ],
    },
    "dots",
  );
  assert.equal(published.length, 1);
  assert.equal("subjectMaskStrength" in published[0].settings, false);
  assert.equal(
    JSON.stringify(published).includes(selection.sourceSha256),
    false,
  );
  const current = settings({ subjectMaskStrength: 0.4 });
  assert.equal(
    applyStudioPreset(current, published[0]).subjectMaskStrength,
    0.4,
  );
});

test("operator review never resurrects a paid mask when the current revision deliberately cleared it", () => {
  const originalMask = {
    key: "orders/fixture/original-mask.json",
    mime: "application/json",
    bytes: 512,
    sha256: "a1".repeat(32),
  };
  const replacementMask = {
    key: "orders/fixture/replacement-mask.json",
    mime: "application/json",
    bytes: 512,
    sha256: "b2".repeat(32),
  };
  const artwork = { manifest: {}, snapshotHash: "fixture" };
  const order = {
    currentRevisionId: "current",
    originalSnapshot: {
      design: {
        settings: settings({ subjectMaskStrength: 1 }),
        subjectMask: originalMask,
        crop: binding.crop,
        warnings: [],
      },
      package: artwork,
    },
    revisions: [
      {
        id: "current",
        settings: settings(),
        crop: binding.crop,
        package: artwork,
      },
    ],
  } as unknown as Order;
  assert.equal(orderReviewDetails(order).subjectMask, undefined);
  assert.equal(orderReviewDetails(order).settings.subjectMaskStrength, 0);
  order.revisions[0].subjectMask = replacementMask;
  assert.deepEqual(orderReviewDetails(order).subjectMask, replacementMask);
  assert.deepEqual(order.originalSnapshot.design.subjectMask, originalMask);
  order.revisions = [];
  assert.deepEqual(orderReviewDetails(order).subjectMask, originalMask);
});
