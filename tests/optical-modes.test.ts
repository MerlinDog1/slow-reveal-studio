import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createHash } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  MAX_MARKS,
  RENDERER_VERSION,
  normalizeSettings,
  renderImage,
  toSvg,
  type RenderSettings,
} from "../lib/renderers";
import { OPTICAL_MARKER_PALETTE } from "../lib/optical-palette";
import { settingsSchema, designSchema } from "../lib/server/schema";
import { createPresetSchema } from "../lib/server/presets";
import { presetSettings } from "../lib/preset-types";
import { buildKitGuide, kitGuidePages } from "../lib/kit-guide";
import { createProductionKit } from "../lib/server/production-kit";
import { prototypeKitFiles } from "../lib/prototype-kit";
import { validateRestorableProject } from "../lib/studio-state";
import { getAvailableModes } from "../lib/mode-availability";
import { renderOptical } from "../lib/renderers/optical";

const MODES = ["colour-blend", "tv-weave"] as const;
const linear = (n: number) =>
  n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
const encoded = (n: number) =>
  n <= 0.0031308 ? n * 12.92 : 1.055 * n ** (1 / 2.4) - 0.055;
const rgb = (hex: string) =>
  [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
function image(
  pixel: (x: number, y: number) => number[],
  width = 96,
  height = 120,
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { data, width, height };
}
const settings = (
  mode: (typeof MODES)[number],
  patch: Partial<RenderSettings> = {},
): RenderSettings => ({
  ...DEFAULT_SETTINGS,
  ...PRESETS.standard,
  mode,
  widthMm: 120,
  heightMm: 160,
  contrast: 1,
  gamma: 1,
  autoExposure: false,
  edgeEmphasis: 0,
  threshold: 0,
  palette: [...OPTICAL_MARKER_PALETTE],
  ...patch,
});

for (const mode of MODES) {
  test(`${mode} mixes neighbouring pen colours to reduce average linear-colour error`, () => {
    const palette = ["#204060", "#c09070"];
    const inks = palette.map((hex) => rgb(hex).map((n) => linear(n / 255)));
    const target = inks[0].map((n, channel) => (n + inks[1][channel]) / 2);
    const pixel = target.map((n) => Math.round(encoded(n) * 255));
    const source = image(() => [...pixel, 255]);
    const s = settings(mode, { palette });
    const g = renderImage(source, s);
    // Count all lattice sites independently using an entirely dark reference.
    const sites = renderImage(
      image(() => [0, 0, 0, 255]),
      s,
    ).cells.length;
    const average = [0, 1, 2].map(
      (channel) =>
        (g.cells.reduce(
          (sum, cell) => sum + linear(rgb(cell.color!)[channel] / 255),
          0,
        ) +
          sites -
          g.cells.length) /
        sites,
    );
    const distance = (a: number[]) =>
      a.reduce((sum, n, channel) => sum + (n - target[channel]) ** 2, 0);
    const nearestError = Math.min(...[...inks, [1, 1, 1]].map(distance));
    assert.equal(new Set(g.cells.map((cell) => cell.label)).size, 2);
    assert.ok(
      distance(average) < nearestError / 20,
      "spatial mixture should outperform one nearest pen at mark sites",
    );
    assert.deepEqual(renderImage(source, s), g);
    assert.equal(
      toSvg(JSON.parse(JSON.stringify(g)), "template"),
      toSvg(g, "template"),
    );
  });

  test(`${mode} preserves blank paper and has bounded, separated numbered shapes at every detail level`, () => {
    for (const pixel of [
      [255, 255, 255, 255],
      [0, 0, 0, 0],
    ])
      assert.equal(
        renderImage(
          image(() => pixel),
          settings(mode),
        ).stats.markCount,
        0,
      );
    for (const preset of [PRESETS.easy, PRESETS.standard, PRESETS.detailed]) {
      const s = settings(mode, preset);
      const g = renderImage(
        image(() => [20, 20, 20, 255]),
        s,
      );
      const rows = new Map<number, typeof g.cells>();
      for (const cell of g.cells) {
        assert.equal(cell.color, s.palette![Number(cell.label) - 1]);
        assert.ok(
          cell.x >= s.safeMarginMm - 0.0001 &&
            cell.y >= s.safeMarginMm - 0.0001,
        );
        assert.ok(cell.x + cell.width <= s.widthMm - s.safeMarginMm + 0.0001);
        assert.ok(cell.y + cell.height <= s.heightMm - s.safeMarginMm + 0.0001);
        assert.ok(
          cell.width >= s.minDiameterMm - 0.0001 &&
            cell.height <= s.maxDiameterMm + 0.0001,
        );
        assert.equal(cell.radius, Math.round((cell.width / 2) * 10000) / 10000);
        if (mode === "colour-blend") assert.equal(cell.width, cell.height);
        else assert.ok(cell.height > cell.width * 1.7);
        rows.set(cell.y, [...(rows.get(cell.y) ?? []), cell]);
      }
      const ordered = [...rows.entries()].sort((a, b) => a[0] - b[0]);
      for (const [i, [y, cells]] of ordered.entries()) {
        cells.sort((a, b) => a.x - b.x);
        for (let j = 1; j < cells.length; j++)
          assert.ok(cells[j].x - cells[j - 1].x - cells[j - 1].width >= 0.25);
        if (i) {
          const previous = ordered[i - 1][1];
          // Measure the actual circle/capsule edges: hexagonal circles can
          // have overlapping bounding boxes without touching one another.
          for (const cell of cells)
            for (const other of previous) {
              const dx = cell.x + cell.width / 2 - other.x - other.width / 2;
              const dy = Math.max(
                0,
                y - other.y - other.height + (cell.width + other.width) / 2,
              );
              assert.ok(
                Math.hypot(dx, dy) - (cell.width + other.width) / 2 >= 0.25,
              );
            }
          const pitchX = cells[1].x - cells[0].x;
          assert.ok(
            Math.abs(
              cells[0].x - ordered[0][1][0].x - (i % 2 ? pitchX / 2 : 0),
            ) < 0.0002,
          );
          assert.equal(cells.length, ordered[0][1].length - (i % 2));
          const expectedY =
            mode === "colour-blend"
              ? (pitchX * Math.sqrt(3)) / 2
              : s.spacingMm / Math.sqrt(s.density);
          assert.ok(Math.abs(y - ordered[i - 1][0] - expectedY) < 0.0002);
        }
      }
      const svg = toSvg(g, "template");
      assert.match(svg, /width="120mm" height="160mm"/);
      assert.doesNotMatch(svg, /<text\b/);
      assert.ok(svg.includes(`aria-label="${g.cells[0].label}"`));
      assert.match(toSvg(g, "finished"), /fill="#ffffff"/);
    }
    for (const [widthMm, heightMm] of [
      [1500, 1500],
      [1500, 30],
      [30, 1500],
    ]) {
      const g = renderImage(
        image(() => [0, 0, 0, 255], 8, 8),
        settings(mode, {
          widthMm,
          heightMm,
          spacingMm: 0.5,
          minDiameterMm: 0.3,
          maxDiameterMm: 0.7,
          density: 3,
        }),
      );
      assert.ok(g.stats.markCount > 0 && g.stats.markCount <= MAX_MARKS);
      assert.ok(g.warnings.some((w) => w.includes("60,000")));
    }
  });

  test(`${mode} samples each displaced mark centre and handles single rows and columns`, () => {
    for (const [width, height] of [
      [100, 140],
      [10, 140],
      [100, 10],
    ]) {
      const samples: [number, number][] = [];
      const s = settings(mode, {
        spacingMm: 30,
        maxDiameterMm: 3.8,
        palette: ["#000000", "#ffffff"],
      });
      const cells = renderOptical({
        settings: s,
        bounds: { x: 10, y: 10, width, height },
        pitch: 30,
        maxDiameter: 3.8,
        tone: {
          width: 100,
          height: 140,
          mean: 0,
          range: 1,
          meanEdge: 0,
          exposureScale: 1,
          sample: () => 1,
          color: (u, v) => {
            samples.push([u, v]);
            return [0, 0, 0];
          },
        },
      });
      assert.equal(samples.length, cells.length);
      cells.forEach((cell, i) => {
        assert.ok(
          Math.abs(samples[i][0] * width + 10 - cell.x - cell.width / 2) <
            0.0001,
        );
        assert.ok(
          Math.abs(samples[i][1] * height + 10 - cell.y - cell.height / 2) <
            0.0001,
        );
        assert.ok(cell.x >= 10 && cell.y >= 10);
        assert.ok(cell.x + cell.width <= 10 + width + 0.0001);
        assert.ok(cell.y + cell.height <= 10 + height + 0.0001);
      });
      if (width === 10) {
        assert.equal(new Set(cells.map((cell) => cell.x)).size, 1);
        for (let i = 1; i < cells.length; i++)
          assert.ok(cells[i].y - cells[i - 1].y - cells[i - 1].height >= 0.25);
      }
      if (height === 10)
        assert.equal(new Set(cells.map((cell) => cell.y)).size, 1);
    }
  });

  test(`${mode} settings, private-save schema, preset and local restoration preserve the same numbered palette`, () => {
    const s = normalizeSettings(settingsSchema.parse(settings(mode)));
    const saved = designSchema.parse({
      mode,
      productId: "30x40",
      finishId: "rolled",
      inkId: "black",
      settings: s,
      crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
      source: { dataUrl: "data:image/png;base64,test" },
      rightsConfirmed: true,
    });
    assert.deepEqual(saved.settings.palette, OPTICAL_MARKER_PALETTE);
    assert.equal(
      createPresetSchema.parse({
        name: "Optical trial",
        mode,
        settings: presetSettings(s),
      }).mode,
      mode,
    );
    const restored = validateRestorableProject(
      {
        id: "trial",
        name: "Trial",
        updatedAt: new Date(0).toISOString(),
        image: new Blob(["test"], { type: "image/png" }),
        productId: "30x40",
        finishId: "rolled",
        settings: s,
        crop: saved.crop,
        rendererVersion: RENDERER_VERSION,
      },
      [mode],
    );
    assert.deepEqual(restored.project.settings.palette, s.palette);
    assert.equal(restored.needsRendererReview, false);
    assert.equal(
      validateRestorableProject(
        {
          ...restored.project,
          rendererVersion: "slow-reveal-geometry/1.4.0",
        },
        [mode],
      ).needsRendererReview,
      true,
    );
    assert.equal(
      normalizeSettings(settings(mode, { palette: undefined })).palette!.length,
      8,
    );
    assert.throws(
      () => normalizeSettings(settings(mode, { invert: true })),
      /light canvas/,
    );
    assert.throws(
      () =>
        normalizeSettings(settings(mode, { palette: ["#000000", "url(bad)"] })),
      /palette/,
    );
    assert.throws(
      () =>
        renderImage(
          image(() => [0, 0, 0, 255]),
          settings(mode, { subjectMaskStrength: 1 }),
        ),
      /Dots only/,
    );
    assert.deepEqual(getAvailableModes({ NODE_ENV: "production" }), ["dots"]);
    assert.ok(getAvailableModes({ NODE_ENV: "development" }).includes(mode));
  });

  test(`${mode} tone controls affect colour output and guides carry the exact key and activity`, () => {
    const source = image((x, y) => [
      (x * 3) % 256,
      (y * 2) % 256,
      (x + y) % 256,
      255,
    ]);
    const s = settings(mode);
    const g = renderImage(source, s);
    for (const patch of [
      { brightness: 0.2 },
      { contrast: 1.6 },
      { gamma: 1.5 },
      { threshold: 0.5 },
    ])
      assert.notDeepEqual(
        renderImage(source, { ...s, ...patch }).cells,
        g.cells,
      );
    const guide = buildKitGuide(g);
    assert.deepEqual(
      guide.legend.map((entry) => entry.color),
      s.palette,
    );
    assert.equal(
      guide.legend.reduce((n, entry) => n + entry.usedCellCount, 0),
      g.cells.length,
    );
    assert.ok(
      guide.steps.some((step) =>
        step.body.includes(mode === "tv-weave" ? "dash" : "circles"),
      ),
    );
    assert.ok(guide.steps.some((step) => step.body.includes("distance")));
    const pages = kitGuidePages(g);
    assert.equal(pages.length, 3);
    for (const page of pages)
      for (const match of page.matchAll(/data-bounds-mm="([^"]+)"/g)) {
        const [x, y, w, h] = match[1].split(",").map(Number);
        assert.ok(x >= 11 && y >= 9 && x + w <= 199 && y + h <= 289);
      }
    const wrong = structuredClone(g);
    wrong.cells[0].color = "#123456";
    assert.throws(() => buildKitGuide(wrong), /do not match/);
  });
}

test("both optical modes export real local/server guide PDFs with complete keys and verified file hashes", async () => {
  const source = image((x, y) => [
    ...rgb(OPTICAL_MARKER_PALETTE[Math.floor(x / 24) + 4 * Math.floor(y / 30)]),
    255,
  ]);
  const hash = (data: Uint8Array) =>
    createHash("sha256").update(data).digest("hex");
  for (const mode of MODES) {
    const g = renderImage(source, settings(mode));
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
    assert.equal(server.manifest.pages, local.manifest.pages);
    for (const file of local.files)
      assert.equal(
        hash(new Uint8Array(await file.blob.arrayBuffer())),
        local.manifest.files[file.key].sha256,
      );
    for (const descriptor of Object.values(server.manifest.files)) {
      const file = server.files.find((file) => file.path === descriptor.path)!;
      assert.equal(hash(file.data), descriptor.sha256);
    }
    for (const bytes of [
      Buffer.from(
        await local.files
          .find((file) => file.key === "makingGuidePdf")!
          .blob.arrayBuffer(),
      ),
      server.files.find((file) => file.path === "kit/making-guide.pdf")!.data,
    ])
      assert.equal(
        (bytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length,
        local.manifest.pages,
      );
    const packing = JSON.parse(
      await local.files
        .find((file) => file.key === "packingListJson")!
        .blob.text(),
    );
    assert.equal(packing.mode, mode);
    assert.deepEqual(packing.palette, server.manifest.palette);
  }
});
