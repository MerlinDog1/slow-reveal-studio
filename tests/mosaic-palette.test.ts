import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { MOSAIC_MARKER_PALETTE } from "../lib/mosaic-palette";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  renderImage,
  toSvg,
} from "../lib/renderers";
import { settingsSchema } from "../lib/server/schema";
import { presetSettingsSchema } from "../lib/server/presets";
import { presetSettings } from "../lib/preset-types";
import { buildKitGuide, kitGuidePages } from "../lib/kit-guide";
import { prototypeKitFiles } from "../lib/prototype-kit";
import { createProductionKit } from "../lib/server/production-kit";

function fixture(
  colourCount: 16 | 32,
  cellShape: "square" | "rounded" | "hexagon" = "rounded",
) {
  const width = 192,
    height = colourCount * 12;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colour =
        MOSAIC_MARKER_PALETTE[Math.floor(y / 48) * 4 + Math.floor(x / 48)];
      data.set(
        [1, 3, 5]
          .map((at) => parseInt(colour.slice(at, at + 2), 16))
          .concat(255),
        (y * width + x) * 4,
      );
    }
  }
  const settings = {
    ...DEFAULT_SETTINGS,
    mode: "mosaic" as const,
    widthMm: 200,
    heightMm: colourCount * 12.5,
    spacingMm: 6,
    maxDiameterMm: 5.5,
    cellShape,
    palette: MOSAIC_MARKER_PALETTE.slice(0, colourCount),
  };
  return { input: { data, width, height }, settings };
}

for (const colourCount of [16, 32] as const) {
  const pageCount = colourCount === 16 ? 3 : 5;
  test(`${colourCount}-colour settings survive renderer, private-save and preset validation; oversized and invalid palettes fail`, () => {
    const { settings } = fixture(colourCount);
    const restored = normalizeSettings(
      settingsSchema.parse(JSON.parse(JSON.stringify(settings))),
    );
    assert.deepEqual(restored.palette, settings.palette);
    assert.deepEqual(
      presetSettingsSchema.parse(presetSettings(restored)).palette,
      settings.palette,
    );
    assert.deepEqual(MOSAIC_MARKER_PALETTE.slice(0, 16), [
      "#1e1e1c",
      "#68442f",
      "#b97a68",
      "#c6a25a",
      "#354e3b",
      "#445e7c",
      "#a49b84",
      "#dbccb4",
      "#b33c3c",
      "#d8873f",
      "#e5ca72",
      "#88a86e",
      "#3a9291",
      "#8ab7cf",
      "#765a91",
      "#d6a1b0",
    ]);
    for (const palette of [
      [...MOSAIC_MARKER_PALETTE, "#123456"],
      [...settings.palette.slice(0, -1), "url(bad)"],
    ]) {
      assert.throws(
        () => normalizeSettings({ ...settings, palette }),
        /palette/,
      );
      assert.equal(
        settingsSchema.safeParse({ ...settings, palette }).success,
        false,
      );
      assert.equal(
        presetSettingsSchema.safeParse({ ...presetSettings(settings), palette })
          .success,
        false,
      );
    }
    assert.throws(
      () =>
        normalizeSettings({
          ...settings,
          palette: Array(colourCount).fill("#112233"),
        }),
      /distinct/,
    );
  });

  test(`all ${colourCount} Mosaic keys map to their saved colours in deterministic finished and numbered template exports`, () => {
    for (const shape of ["square", "rounded", "hexagon"] as const) {
      const { input, settings } = fixture(colourCount, shape);
      const geometry = renderImage(input, settings);
      assert.equal(
        new Set(geometry.cells.map((cell) => cell.label)).size,
        colourCount,
      );
      for (const cell of geometry.cells) {
        assert.equal(cell.color, settings.palette[Number(cell.label) - 1]);
        assert.ok(cell.x >= 10 && cell.y >= 10);
        assert.ok(
          cell.x + cell.width <= settings.widthMm - 10 &&
            cell.y + cell.height <= settings.heightMm - 10,
        );
      }
      const finished = toSvg(geometry, "finished");
      const template = toSvg(geometry, "template");
      assert.ok(
        template.includes(`width="200mm" height="${settings.heightMm}mm"`),
      );
      assert.doesNotMatch(template, /<text\b/);
      for (const [index, colour] of settings.palette.entries()) {
        assert.ok(finished.includes(`fill="${colour}"`));
        assert.ok(template.includes(`aria-label="${index + 1}"`));
      }
      assert.equal(
        toSvg(JSON.parse(JSON.stringify(geometry)), "template"),
        template,
      );
      assert.deepEqual(renderImage(input, settings), geometry);
      const dots = renderImage(input, {
        ...settings,
        mode: "dots",
        palette: undefined,
      });
      assert.equal(dots.cells.length, 0);
      assert.ok(
        dots.circles.every((dot) => Object.keys(dot).sort().join() === "r,x,y"),
      );
    }
  });

  test(`all ${colourCount} used marker keys and packing requirements fit ${pageCount} A4 guide pages, including maximum canvas dimensions`, () => {
    const { input, settings } = fixture(colourCount);
    const geometry = renderImage(input, settings);
    geometry.widthMm = geometry.settings.widthMm = 1500;
    geometry.heightMm = geometry.settings.heightMm = 1500;
    const guide = buildKitGuide(geometry);
    assert.equal(guide.legend.length, colourCount);
    assert.equal(
      guide.materials.filter((item) => item.id.startsWith("marker-")).length,
      colourCount,
    );
    assert.equal(
      guide.legend.reduce((sum, entry) => sum + entry.usedCellCount, 0),
      geometry.cells.length,
    );
    const pages = kitGuidePages(geometry);
    assert.equal(pages.length, pageCount);
    for (const [i, page] of pages.entries()) {
      assert.match(page, /width="210mm" height="297mm"/);
      assert.ok(page.includes(`| ${i + 1} / ${pageCount}`));
      for (const bound of page.matchAll(/data-bounds-mm="([^"]+)"/g)) {
        const [x, y, w, h] = bound[1].split(",").map(Number);
        assert.ok(x >= 11 && y >= 9 && x + w <= 199 && y + h <= 289);
      }
    }
    const keyPages = pages.slice(1, 1 + colourCount / 16);
    const packingPages = pages.slice(1 + colourCount / 16);
    for (let i = 1; i <= colourCount; i++) {
      assert.ok(
        keyPages[Math.floor((i - 1) / 16)].includes(
          `Key ${i}  ${settings.palette[i - 1]}`,
        ),
      );
      assert.equal(
        packingPages.filter((page) =>
          page.includes(`Marker matching key ${i} (`),
        ).length,
        1,
      );
    }
    keyPages.forEach((page) =>
      assert.doesNotMatch(page, /OPERATOR: PACKING REQUIREMENTS/),
    );
    if (colourCount === 32)
      assert.ok(
        guide.steps.some((step) => step.body.includes("key on pages 2 and 3")),
      );
    assert.deepEqual(
      kitGuidePages(JSON.parse(JSON.stringify(geometry))),
      pages,
    );
  });

  test(`local and production packages contain all ${pageCount} guide pages, the complete ${colourCount}-colour key and correct file hashes`, async () => {
    const { input, settings } = fixture(colourCount);
    const geometry = renderImage(input, settings);
    const local = await prototypeKitFiles(
      geometry,
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
    const production = await createProductionKit(geometry, {
      orderId: "test-order",
      revisionId: "test-revision",
      snapshotHash: "a".repeat(64),
      productId: "test-canvas",
      finishId: "rolled",
      inkId: "black",
    });
    const hash = (data: Uint8Array) =>
      createHash("sha256").update(data).digest("hex");
    for (const manifest of [local.manifest, production.manifest]) {
      assert.equal(manifest.pages, pageCount);
      for (let i = 1; i <= pageCount; i++) {
        assert.equal(
          manifest.files[`guidePage${i}`].path,
          `kit/making-guide-page-${i}.svg`,
        );
      }
      assert.equal(
        Object.keys(manifest.files).filter((key) => /^guidePage\d+$/.test(key))
          .length,
        pageCount,
      );
    }
    for (const file of local.files) {
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      assert.equal(local.manifest.files[file.key].sha256, hash(bytes));
    }
    for (const descriptor of Object.values(production.manifest.files)) {
      const file = production.files.find(
        (entry) => entry.path === descriptor.path,
      )!;
      assert.equal(descriptor.sha256, hash(file.data));
    }
    const localPdf = await local.files
      .find((file) => file.key === "makingGuidePdf")!
      .blob.arrayBuffer();
    const productionPdf = production.files.find(
      (file) => file.path === "kit/making-guide.pdf",
    )!.data;
    for (const pdf of [Buffer.from(localPdf), productionPdf]) {
      assert.equal(
        (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length,
        pageCount,
      );
    }
    const localPacking = JSON.parse(
      await local.files
        .find((file) => file.key === "packingListJson")!
        .blob.text(),
    );
    const productionPacking = JSON.parse(
      production.files
        .find((file) => file.path === "kit/packing-list.json")!
        .data.toString(),
    );
    assert.deepEqual(localPacking.palette, productionPacking.palette);
    assert.equal(localPacking.palette.length, colourCount);
    assert.deepEqual(
      localPacking.palette.map((entry: { color: string }) => entry.color),
      settings.palette,
    );
  });
}

test("32-colour guides retain unused keys and only require used markers, without empty packing pages", () => {
  const { input, settings } = fixture(32);
  const geometry = renderImage(input, settings);
  geometry.cells = geometry.cells.filter((cell) => cell.label === "32");
  const guide = buildKitGuide(geometry);
  assert.equal(guide.legend.length, 32);
  assert.deepEqual(
    guide.materials.map((item) => item.id),
    ["canvas", "marker-32", "making-guide"],
  );
  assert.equal(
    guide.legend.filter((entry) => entry.usedCellCount === 0).length,
    31,
  );
  const pages = kitGuidePages(geometry);
  assert.equal(pages.length, 4);
  assert.ok(pages[1].includes("0 cells (unused)"));
  assert.ok(pages[2].includes(`Key 32  ${settings.palette[31]}`));
  assert.ok(pages[3].includes("Marker matching key 32 ("));
  assert.ok(pages[3].includes("| 4 / 4"));
});
