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
import { OPTICAL_MARKER_PALETTE } from "../lib/optical-palette";

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
  mode: "fibonacci",
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

test("colour Fibonacci keeps the same sunflower sites and physical gaps for both palettes", () => {
  for (const preset of [PRESETS.easy, PRESETS.standard, PRESETS.detailed]) {
    const mono = renderImage(source(0), settings(preset));
    for (const count of [8, 16]) {
      const s = settings({
        ...preset,
        palette: OPTICAL_MARKER_PALETTE.slice(0, count),
      });
      const g = renderImage(source(0), s);
      assert.equal(g.circles.length, 0);
      assert.equal(g.cells.length, mono.circles.length);
      const dots = g.cells.map((cell, index) => {
        assert.equal(cell.label, "1");
        assert.equal(cell.color, s.palette![0]);
        assert.equal(cell.width, cell.height);
        const dot = {
          x: cell.x + cell.width / 2,
          y: cell.y + cell.height / 2,
          r: cell.width / 2,
        };
        assert.ok(Math.abs(dot.x - mono.circles[index].x) < 0.0002);
        assert.ok(Math.abs(dot.y - mono.circles[index].y) < 0.0002);
        return dot;
      });
      boundsAndGaps(dots, s, g.stats.effectiveSpacingMm);
      assert.ok(
        Math.abs(
          g.stats.inkAreaMm2 - g.cells.length * Math.PI * dots[0].r ** 2,
        ) < 0.1,
      );
      assert.deepEqual(renderImage(source(0), s), g);
      assert.equal(renderImage(source(255), s).stats.markCount, 0);
      assert.equal(renderImage(source(0, 0), s).stats.markCount, 0);
      assert.equal(
        toSvg(JSON.parse(JSON.stringify(g)), "template"),
        toSvg(g, "template"),
      );
      assert.throws(
        () => renderImage(source(0), { ...s, invert: true }),
        /light canvas/,
      );
    }
  }
});

test("colour Fibonacci mixes neighbouring pens rather than flattening to the nearest colour", () => {
  const linear = (v: number) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const encode = (v: number) =>
    v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  const palette = ["#204060", "#c09070"];
  const inks = palette.map((hex) =>
    [1, 3, 5].map((at) => linear(parseInt(hex.slice(at, at + 2), 16) / 255)),
  );
  const target = inks[0].map((n, channel) => (n + inks[1][channel]) / 2);
  const pixel = target.map((v) => Math.round(encode(v) * 255));
  const input = source(0);
  for (let at = 0; at < input.data.length; at += 4)
    input.data.set([...pixel, 255], at);
  const s = settings({ palette }),
    g = renderImage(input, s);
  const count = renderImage(source(0), s).cells.length;
  const average = [0, 1, 2].map(
    (channel) =>
      (g.cells.reduce(
        (sum, cell) => sum + inks[Number(cell.label) - 1][channel],
        0,
      ) +
        count -
        g.cells.length) /
      count,
  );
  const error = (color: number[]) =>
    color.reduce((sum, n, channel) => sum + (n - target[channel]) ** 2, 0);
  assert.equal(new Set(g.cells.map((cell) => cell.label)).size, 2);
  assert.ok(error(average) < Math.min(...inks.map(error)) / 20);
  assert.deepEqual(g, renderImage(input, s));
  for (const patch of [{ brightness: 0.3 }, { gamma: 1.8 }, { contrast: 1.8 }])
    assert.notDeepEqual(g.cells, renderImage(input, { ...s, ...patch }).cells);
});

test("historical single-ink Fibonacci geometry ignores previously unused palette settings", () => {
  const original = renderImage(source(80), settings({ invert: true }));
  const legacy = {
    ...original,
    version: "slow-reveal-geometry/1.6.0",
    settings: { ...original.settings, palette: [...OPTICAL_MARKER_PALETTE] },
  };
  const guide = buildKitGuide(legacy);
  assert.deepEqual(
    guide.legend.map((item) => item.color),
    [original.settings.inkColor],
  );
  assert.equal(guide.title, buildKitGuide(original).title);
  assert.equal(
    toSvg({ ...legacy, version: original.version }, "finished"),
    toSvg(original, "finished"),
  );
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
            "fibonacci marks keep a real 0.25 mm clear gap",
          );
    const key = `${x}:${y}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(dot);
    buckets.set(key, bucket);
  }
}

test("fibonacci is deterministic, ordered and physically separated at every detail level", () => {
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
    // Recover the radial site number independently and check the golden angle.
    // This catches random or grid placement passing generic spacing checks.
    let lastIndex = -1;
    for (const dot of g.circles) {
      const x = dot.x - s.widthMm / 2,
        y = dot.y - s.heightMm / 2;
      const scale = (s.spacingMm / Math.sqrt(s.density)) * 0.62;
      const index = Math.round((x * x + y * y) / (scale * scale) - 0.5);
      const expectedRadius = scale * Math.sqrt(index + 0.5);
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      assert.ok(
        index > lastIndex,
        "marks progress outwards along the sunflower sequence",
      );
      assert.ok(Math.abs(x - expectedRadius * Math.cos(angle)) < 0.0001);
      assert.ok(Math.abs(y - expectedRadius * Math.sin(angle)) < 0.0001);
      lastIndex = index;
    }
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

test("fibonacci shadows gain dots and ink while highlights and transparency remain open", () => {
  const levels = [255, 220, 170, 100, 0].map((value) =>
    renderImage(source(value), settings()),
  );
  assert.equal(levels[0].stats.markCount, 0);
  assert.equal(renderImage(source(0, 0), settings()).stats.markCount, 0);
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i].stats.markCount >= levels[i - 1].stats.markCount);
    assert.ok(levels[i].stats.inkAreaMm2 > levels[i - 1].stats.inkAreaMm2);
  }
  // Expected area is proportional to darkness despite varying dot sizes.
  const ratio = levels[2].stats.inkAreaMm2 / levels[4].stats.inkAreaMm2;
  assert.ok(Math.abs(ratio - (1 - 170 / 255)) < 0.05);
  assert.deepEqual(
    levels[2].circles.map(({ x, y }) => ({ x, y })),
    levels[4].circles.map(({ x, y }) => ({ x, y })),
    "midtones retain every spiral site and change size instead of random occupancy",
  );
  assert.equal(
    renderImage(source(254), settings()).stats.markCount,
    0,
    "sub-minimum highlight dots are omitted without a random pattern",
  );
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

test("fibonacci stays bounded for extreme sizes, dense settings and reserved lettering", () => {
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

test("fibonacci settings, private saves, presets and restore share the same mode and review gate", () => {
  const s = settingsSchema.parse(settings());
  const design = designSchema.parse({
    mode: "fibonacci",
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
      mode: "fibonacci",
      settings: presetSettings(settings()),
    }).mode,
    "fibonacci",
  );
  const project = {
    id: "fibonacci",
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
    validateRestorableProject(project, ["fibonacci"]).needsRendererReview,
    false,
  );
  assert.equal(
    validateRestorableProject(
      { ...project, rendererVersion: "slow-reveal-geometry/1.5.0" },
      ["fibonacci"],
    ).needsRendererReview,
    true,
  );
  assert.ok(
    getAvailableModes({ NODE_ENV: "development" }).includes("fibonacci"),
  );
  assert.deepEqual(getAvailableModes({ NODE_ENV: "production" }), ["dots"]);
  assert.deepEqual(
    getAvailableModes({
      NODE_ENV: "production",
      PHYSICAL_VALIDATION_APPROVED: "true",
      PHYSICALLY_VALIDATED_MODES: "fibonacci",
    }),
    ["dots", "fibonacci"],
  );
  assert.throws(
    () => renderImage(source(0), settings({ subjectMaskStrength: 1 })),
    /Dots only/,
  );
});

for (const palette of [undefined, [...OPTICAL_MARKER_PALETTE]])
  test(`fibonacci exports matching ${palette ? "16-colour" : "single-ink"} local/server guides and SVGs`, async () => {
    const g = renderImage(
      source(70),
      settings({ inkColor: "#445533", guideColor: "#665544", palette }),
    );
    const finished = toSvg(g, "finished"),
      template = toSvg(g, "template");
    assert.equal((finished.match(/<circle\b/g) ?? []).length, g.circles.length);
    assert.equal((template.match(/<circle\b/g) ?? []).length, g.circles.length);
    assert.match(finished, /width="120mm" height="160mm"/);
    assert.match(template, /#665544/);
    if (palette) {
      assert.ok(g.cells.length > 0);
      for (const cell of g.cells)
        assert.equal(cell.color, palette[Number(cell.label) - 1]);
      assert.match(template, /aria-label="[0-9]+"/);
      assert.ok(template.includes('fill="#ffffff"'));
      settingsSchema.parse(g.settings);
      assert.deepEqual(presetSettings(g.settings).palette, palette);
      assert.throws(
        () => buildKitGuide({ ...g, cells: [{ ...g.cells[0], label: "99" }] }),
        /label and colour/,
      );
    } else assert.match(finished, /#445533/);
    const guide = buildKitGuide(g);
    assert.match(guide.title, /sunflower spirals/);
    assert.deepEqual(
      guide.legend.map((entry) => entry.color),
      palette ?? ["#445533"],
    );
    assert.equal(kitGuidePages(g).length, palette ? 3 : 2);
    const local = await prototypeKitFiles(
      g,
      async (svg, width, height, dpi) => {
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
      },
    );
    const server = await createProductionKit(g, {
      orderId: "trial",
      revisionId: "trial",
      snapshotHash: "a".repeat(64),
      productId: "30x40",
      finishId: "rolled",
      inkId: "black",
    });
    assert.equal(local.manifest.pages, palette ? 3 : 2);
    assert.equal(server.manifest.pages, local.manifest.pages);
    const serverPacking = JSON.parse(
      server.files
        .find((file) => file.path === "kit/packing-list.json")!
        .data.toString("utf8"),
    );
    assert.equal(serverPacking.mode, "fibonacci");
    const packing = JSON.parse(
      await local.files
        .find((file) => file.key === "packingListJson")!
        .blob.text(),
    );
    assert.equal(packing.mode, "fibonacci");
    assert.deepEqual(packing.palette, guide.legend);
    assert.deepEqual(serverPacking.palette, guide.legend);
  });
