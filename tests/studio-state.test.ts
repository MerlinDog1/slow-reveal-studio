import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, RENDERER_VERSION } from "../lib/renderers";
import {
  applyStudioPreset,
  parseLocalPresets,
  parsePublishedPresets,
  parseStudioCatalogue,
  productDimensions,
  reconcileStudioSelection,
  validateRestorableProject,
} from "../lib/studio-state";
import { presetSettings } from "../lib/preset-types";

const catalogue = () =>
  parseStudioCatalogue({
    prototype: false,
    products: [
      {
        id: "40x50",
        label: "40 × 50 cm",
        widthMm: 400,
        heightMm: 500,
        pricePence: 4995,
      },
    ],
    finishes: [{ id: "rolled", label: "Rolled canvas", additionalPence: 0 }],
  });
const project = () => ({
  id: "current",
  name: "Test photograph",
  updatedAt: "2026-09-28T00:00:00.000Z",
  image: new Blob(["private photo fixture"], { type: "image/jpeg" }),
  settings: { ...DEFAULT_SETTINGS },
  crop: { zoom: 1.25, x: -0.2, y: 0.1, rotation: 90 },
  productId: "40x50",
  finishId: "rolled",
  rendererVersion: RENDERER_VERSION,
});

test("catalogue parsing preserves exact pennies and rejects malformed, duplicate or negative prices", () => {
  assert.equal(catalogue().products[0].pricePence, 4995);
  for (const change of [
    { products: [{ ...catalogue().products[0], pricePence: 49.95 }] },
    { products: [{ ...catalogue().products[0], widthMm: NaN }] },
    { finishes: [{ ...catalogue().finishes[0], additionalPence: -1 }] },
    { products: [catalogue().products[0], catalogue().products[0]] },
    { products: null },
  ])
    assert.throws(
      () => parseStudioCatalogue({ ...catalogue(), ...change }),
      /catalogue/,
    );
});

test("empty catalogue yields no fallback options or authoritative selection", () => {
  const empty = parseStudioCatalogue({ products: [], finishes: [] });
  const state = reconcileStudioSelection(empty, project());
  assert.deepEqual(empty.products, []);
  assert.deepEqual(empty.finishes, []);
  assert.equal(state.ready, false);
  assert.equal(state.product, undefined);
  assert.equal(state.finish, undefined);
  assert.equal(state.messages.length, 2);
});

test("removed size and finish are both reported without changing saved selection", () => {
  const saved = {
    ...project(),
    productId: "retired-size",
    finishId: "retired-finish",
  };
  const before = structuredClone(saved);
  const state = reconcileStudioSelection(catalogue(), saved);
  assert.equal(state.ready, false);
  assert.equal(state.messages.length, 2);
  assert.match(state.messages[0], /size.*no longer/);
  assert.match(state.messages[1], /finish.*no longer/);
  assert.deepEqual(saved, before);
});

test("dimension changes require explicit application and preserve landscape orientation", () => {
  const saved = {
    ...project(),
    settings: { ...DEFAULT_SETTINGS, widthMm: 600, heightMm: 400 },
  };
  const state = reconcileStudioSelection(catalogue(), saved);
  assert.equal(state.ready, false);
  assert.match(state.messages[0], /dimensions.*changed/);
  assert.deepEqual(state.dimensions, { widthMm: 500, heightMm: 400 });
  assert.equal(saved.settings.widthMm, 600);
  assert.equal(
    reconcileStudioSelection(catalogue(), {
      ...saved,
      settings: { ...saved.settings, ...state.dimensions },
    }).ready,
    true,
  );
  assert.deepEqual(
    productDimensions(catalogue().products[0], DEFAULT_SETTINGS),
    { widthMm: 400, heightMm: 500 },
  );
});

test("restoration validates full saved data and fails closed for malformed or unavailable modes", () => {
  const saved = project();
  assert.equal(
    validateRestorableProject(saved, ["dots"]).needsRendererReview,
    false,
  );
  for (const malformed of [
    null,
    [],
    { ...saved, settings: {} },
    { ...saved, crop: { ...saved.crop, zoom: NaN } },
    { ...saved, image: "image path" },
    { ...saved, image: new Blob(["<svg/>"], { type: "image/svg+xml" }) },
    { ...saved, updatedAt: "unknown" },
    { ...saved, settings: { ...saved.settings, mode: "unknown" } },
  ]) {
    assert.throws(() => validateRestorableProject(malformed, ["dots"]));
  }
  assert.throws(
    () =>
      validateRestorableProject(
        { ...saved, settings: { ...saved.settings, mode: "contour" } },
        ["dots"],
      ),
    /currently unavailable.*original is unchanged/,
  );
  assert.throws(
    () => validateRestorableProject(saved, []),
    /currently unavailable/,
  );
});

test("legacy and different renderer versions require rebuild review and leave stored data unchanged", () => {
  for (const rendererVersion of [
    undefined,
    "slow-reveal-geometry/0.9.0",
    "slow-reveal-geometry/99.0.0",
  ]) {
    const saved = { ...project(), rendererVersion };
    const before = structuredClone(saved);
    const result = validateRestorableProject(saved, ["dots"]);
    assert.equal(result.needsRendererReview, true);
    assert.deepEqual(saved, before);
    assert.deepEqual(result.project.crop, saved.crop);
    assert.equal(result.project.settings.widthMm, saved.settings.widthMm);
  }
});

test("published presets preserve private and physical configuration and reject incompatible versions", () => {
  const current = {
    ...DEFAULT_SETTINGS,
    widthMm: 500,
    heightMm: 700,
    inkColor: "#233b56",
    text: { value: "Private lettering" },
  };
  const payload = {
    id: "portrait-v1",
    version: 2,
    name: "Published portrait",
    description: "Fine detail",
    mode: "dots",
    rendererVersion: RENDERER_VERSION,
    settings: {
      ...presetSettings(DEFAULT_SETTINGS),
      contrast: 1.8,
      widthMm: 1234,
      heightMm: 1234,
      inkColor: "#ffffff",
      text: { value: "Replace" },
      source: "secret",
      mode: "mosaic",
    },
  };
  const [preset] = parsePublishedPresets({ presets: [payload] }, "dots");
  assert.ok(preset);
  const next = applyStudioPreset(current, preset);
  assert.equal(next.contrast, 1.8);
  assert.equal(next.mode, "dots");
  assert.equal(next.widthMm, 500);
  assert.equal(next.heightMm, 700);
  assert.equal(next.inkColor, "#233b56");
  assert.equal(next.text?.value, "Private lettering");
  assert.equal("source" in next, false);
  assert.equal("text" in preset.settings, false);
  assert.equal(
    applyStudioPreset(
      { ...current, palette: ["#ffffff", "#000000"], cellShape: "hexagon" },
      preset,
    ).palette,
    undefined,
  );
  assert.equal(
    applyStudioPreset({ ...current, cellShape: "hexagon" }, preset).cellShape,
    undefined,
  );
  assert.deepEqual(
    parsePublishedPresets(
      {
        presets: [
          { ...payload, rendererVersion: "older" },
          { ...payload, mode: "mosaic" },
        ],
      },
      "dots",
    ),
    [],
  );
  assert.throws(
    () => applyStudioPreset(current, { ...preset, rendererVersion: "older" }),
    /update/,
  );
});

test("damaged local preset storage cannot crash the studio or apply arbitrary fields", () => {
  assert.deepEqual(parseLocalPresets({ name: "not an array" }), []);
  assert.deepEqual(
    parseLocalPresets([null, { name: "bad", settings: { contrast: NaN } }]),
    [],
  );
  const stored = parseLocalPresets([
    {
      name: "Local",
      settings: {
        ...DEFAULT_SETTINGS,
        text: { value: "Personal" },
        source: "secret",
      },
    },
  ]);
  const safe = presetSettings(stored[0].settings);
  assert.equal("text" in safe, false);
  assert.equal("source" in safe, false);
  assert.equal("widthMm" in safe, false);
});

test("renderer controls survive restoration and presets without retaining a previous custom guide", () => {
  const saved = {
    ...project(),
    settings: {
      ...DEFAULT_SETTINGS,
      detailPreservation: 0.65,
      guideColor: "#927461",
    },
  };
  const restored = validateRestorableProject(saved, ["dots"]).project;
  assert.equal(restored.settings.detailPreservation, 0.65);
  assert.equal(restored.settings.guideColor, "#927461");
  const [local] = parseLocalPresets([
    { name: "Fine pale guides", settings: saved.settings },
  ]);
  assert.equal(local.settings.detailPreservation, 0.65);
  assert.equal(local.settings.guideColor, "#927461");
  const base = {
    id: "fine",
    name: "Fine pale guides",
    description: "",
    version: 1,
    mode: "dots" as const,
    rendererVersion: RENDERER_VERSION,
  };
  const [published] = parsePublishedPresets(
    { presets: [{ ...base, settings: presetSettings(local.settings) }] },
    "dots",
  );
  assert.equal(
    applyStudioPreset(DEFAULT_SETTINGS, published).guideColor,
    "#927461",
  );
  const legacy = { ...DEFAULT_SETTINGS };
  delete legacy.detailPreservation;
  const old = validateRestorableProject(
    {
      ...project(),
      rendererVersion: "slow-reveal-geometry/1.2.0",
      settings: legacy,
    },
    ["dots"],
  );
  assert.equal(old.needsRendererReview, true);
  assert.equal(old.project.settings.detailPreservation, 0);
  assert.equal(old.project.settings.guideColor, undefined);
  const inherited = applyStudioPreset(saved.settings, {
    ...base,
    settings: presetSettings(legacy),
  });
  assert.equal(inherited.detailPreservation, 0);
  assert.equal(inherited.guideColor, undefined);
  for (const settings of [
    { ...legacy, detailPreservation: 2 },
    { ...legacy, guideColor: "url(secret)" },
  ]) {
    assert.throws(() =>
      validateRestorableProject({ ...project(), settings }, ["dots"]),
    );
    assert.deepEqual(parseLocalPresets([{ name: "Invalid", settings }]), []);
    assert.deepEqual(
      parsePublishedPresets({ presets: [{ ...base, settings }] }, "dots"),
      [],
    );
  }
});
