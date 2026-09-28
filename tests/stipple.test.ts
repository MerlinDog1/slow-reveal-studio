import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  MAX_MARKS,
  renderImage,
  toSvg,
  RENDERER_VERSION,
  type Circle,
  type RenderSettings,
} from "../lib/renderers";
import { settingsSchema, designSchema } from "../lib/server/schema";
import { createPresetSchema } from "../lib/server/presets";
import { presetSettings } from "../lib/preset-types";
import { validateRestorableProject } from "../lib/studio-state";
import { buildKitGuide, kitGuidePages } from "../lib/kit-guide";
import { getAvailableModes } from "../lib/mode-availability";
import { createProductionKit } from "../lib/server/production-kit";
import { prototypeKitFiles } from "../lib/prototype-kit";

const source = (value: number, alpha = 255, width = 80, height = 100) => ({
  width,
  height,
  data: new Uint8ClampedArray(
    Array.from({ length: width * height }, () => [
      value,
      value,
      value,
      alpha,
    ]).flat(),
  ),
});
const settings = (patch: Partial<RenderSettings> = {}): RenderSettings => ({
  ...DEFAULT_SETTINGS,
  ...PRESETS.standard,
  mode: "stipple",
  widthMm: 120,
  heightMm: 160,
  autoExposure: false,
  contrast: 1,
  brightness: 0,
  gamma: 1,
  edgeEmphasis: 0,
  threshold: 0,
  ...patch,
});

function boundsAndGaps(circles: Circle[], s: RenderSettings, pitch: number) {
  const buckets = new Map<string, Circle[]>();
  for (const dot of circles) {
    assert.ok(dot.r * 2 >= s.minDiameterMm - 0.0001);
    assert.ok(dot.r * 2 <= s.maxDiameterMm + 0.0001);
    assert.ok(
      dot.x - dot.r >= s.safeMarginMm - 0.0001 &&
        dot.y - dot.r >= s.safeMarginMm - 0.0001,
    );
    assert.ok(dot.x + dot.r <= s.widthMm - s.safeMarginMm + 0.0001);
    assert.ok(dot.y + dot.r <= s.heightMm - s.safeMarginMm + 0.0001);
    const x = Math.floor(dot.x / pitch),
      y = Math.floor(dot.y / pitch);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const other of buckets.get(`${x + dx}:${y + dy}`) ?? [])
          assert.ok(
            Math.hypot(dot.x - other.x, dot.y - other.y) - dot.r - other.r >=
              0.25,
            "stipple marks keep a real 0.25 mm clear gap",
          );
    const key = `${x}:${y}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(dot);
    buckets.set(key, bucket);
  }
}

test("stipple is deterministic, irregular and physically separated at every detail level", () => {
  let previousCount = 0;
  for (const preset of [PRESETS.easy, PRESETS.standard, PRESETS.detailed]) {
    const s = settings(preset),
      g = renderImage(source(0), s);
    assert.ok(g.circles.length > previousCount * 1.4);
    previousCount = g.circles.length;
    assert.deepEqual(g, renderImage(source(0), s));
    assert.deepEqual(
      g.circles,
      renderImage(source(0, 255, 800, 1000), s).circles,
    );
    boundsAndGaps(g.circles, s, g.stats.effectiveSpacingMm);
    assert.ok(
      new Set(g.circles.map((p) => p.y)).size > g.circles.length * 0.95,
      "no visible rows",
    );
    assert.ok(
      new Set(g.circles.map((p) => p.x)).size > g.circles.length * 0.95,
      "no visible columns",
    );
    assert.notDeepEqual(
      g.circles,
      renderImage(source(0), { ...s, mode: "dots" }).circles,
    );
    assert.equal(g.cells.length + g.paths.length, 0);
    assert.equal(
      toSvg(JSON.parse(JSON.stringify(g)), "template"),
      toSvg(g, "template"),
    );
  }
});

test("stipple shadows gain dots and ink while highlights and transparency remain open", () => {
  const levels = [255, 220, 170, 100, 0].map((value) =>
    renderImage(source(value), settings()),
  );
  assert.equal(levels[0].stats.markCount, 0);
  assert.equal(renderImage(source(0, 0), settings()).stats.markCount, 0);
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i].stats.markCount > levels[i - 1].stats.markCount);
    assert.ok(levels[i].stats.inkAreaMm2 > levels[i - 1].stats.inkAreaMm2);
  }
  // Expected area is proportional to darkness despite varying dot sizes.
  const ratio = levels[2].stats.inkAreaMm2 / levels[4].stats.inkAreaMm2;
  assert.ok(Math.abs(ratio - (1 - 170 / 255)) < 0.05);
  assert.equal(
    renderImage(source(0), settings({ invert: true })).stats.markCount,
    0,
  );
  assert.ok(
    renderImage(source(255), settings({ invert: true })).stats.markCount > 0,
  );
  for (const patch of [
    { brightness: 0.2 },
    { contrast: 1.8 },
    { gamma: 1.8 },
    { threshold: 0.8 },
  ])
    assert.notDeepEqual(
      renderImage(source(170), settings(patch)).circles,
      levels[2].circles,
    );
});

test("stipple stays bounded for extreme sizes, dense settings and reserved lettering", () => {
  for (const [widthMm, heightMm] of [
    [1500, 1500],
    [1500, 30],
    [30, 1500],
    [30, 30],
  ]) {
    const s = settings({
      widthMm,
      heightMm,
      spacingMm: 0.5,
      minDiameterMm: 0.3,
      maxDiameterMm: 0.7,
      density: 3,
    });
    const g = renderImage(source(0, 255, 8, 8), s);
    assert.ok(g.stats.markCount > 0 && g.stats.markCount <= MAX_MARKS);
    boundsAndGaps(g.circles, s, g.stats.effectiveSpacingMm);
    assert.ok(
      (g.circles.some((p) => p.y < heightMm * 0.3) &&
        g.circles.some((p) => p.y > heightMm * 0.7)) ||
        heightMm === 30,
    );
  }
  const g = renderImage(
    source(0),
    settings({ text: { value: "A quiet moment", placement: "top-center" } }),
  );
  assert.ok(g.text && g.circles.every((dot) => dot.y - dot.r > g.text!.y));
});

test("stipple settings, private saves, presets and restore share the same mode and review gate", () => {
  const s = settingsSchema.parse(settings());
  const design = designSchema.parse({
    mode: "stipple",
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
    settings: s,
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    source: { dataUrl: "data:image/png;base64,test" },
    rightsConfirmed: true,
  });
  assert.equal(
    createPresetSchema.parse({
      name: "Ink study",
      mode: "stipple",
      settings: presetSettings(settings()),
    }).mode,
    "stipple",
  );
  const project = {
    id: "stipple",
    name: "Ink study",
    updatedAt: new Date(0).toISOString(),
    image: new Blob(["test"], { type: "image/png" }),
    productId: "30x40",
    finishId: "rolled",
    settings: design.settings,
    crop: design.crop,
    rendererVersion: RENDERER_VERSION,
  };
  assert.equal(
    validateRestorableProject(project, ["stipple"]).needsRendererReview,
    false,
  );
  assert.equal(
    validateRestorableProject(
      { ...project, rendererVersion: "slow-reveal-geometry/1.4.1" },
      ["stipple"],
    ).needsRendererReview,
    true,
  );
  assert.ok(
    !getAvailableModes({ NODE_ENV: "development" }).includes("stipple"),
  );
  assert.deepEqual(getAvailableModes({ NODE_ENV: "production" }), ["dots"]);
  assert.deepEqual(
    getAvailableModes({
      NODE_ENV: "production",
      PHYSICAL_VALIDATION_APPROVED: "true",
      PHYSICALLY_VALIDATED_MODES: "stipple",
    }),
    ["dots"],
  );
  assert.throws(
    () => renderImage(source(0), settings({ subjectMaskStrength: 1 })),
    /Dots only/,
  );
});

test("stipple exports the same circles and single ink in local/server guides and SVGs", async () => {
  const g = renderImage(
    source(70),
    settings({ inkColor: "#445533", guideColor: "#665544" }),
  );
  const finished = toSvg(g, "finished"),
    template = toSvg(g, "template");
  assert.equal((finished.match(/<circle\b/g) ?? []).length, g.circles.length);
  assert.equal((template.match(/<circle\b/g) ?? []).length, g.circles.length);
  assert.match(finished, /width="120mm" height="160mm"/);
  assert.match(template, /#665544/);
  assert.match(finished, /#445533/);
  const guide = buildKitGuide(g);
  assert.match(guide.title, /scattered dots/);
  assert.deepEqual(
    guide.legend.map((entry) => entry.color),
    ["#445533"],
  );
  assert.equal(kitGuidePages(g).length, 2);
  const local = await prototypeKitFiles(g, async (svg, width, height, dpi) => {
    const png = await sharp(
      Buffer.from(
        svg.replace(
          /width="210mm" height="297mm"/,
          `width="${width}px" height="${height}px"`,
        ),
      ),
    )
      .withMetadata({ density: dpi })
      .png()
      .toBuffer();
    return new Blob([new Uint8Array(png)], { type: "image/png" });
  });
  const server = await createProductionKit(g, {
    orderId: "trial",
    revisionId: "trial",
    snapshotHash: "a".repeat(64),
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
  });
  assert.equal(local.manifest.pages, 2);
  assert.equal(server.manifest.pages, local.manifest.pages);
  const serverPacking = JSON.parse(
    server.files
      .find((file) => file.path === "kit/packing-list.json")!
      .data.toString("utf8"),
  );
  assert.equal(serverPacking.mode, "stipple");
  const packing = JSON.parse(
    await local.files
      .find((file) => file.key === "packingListJson")!
      .blob.text(),
  );
  assert.equal(packing.mode, "stipple");
});
