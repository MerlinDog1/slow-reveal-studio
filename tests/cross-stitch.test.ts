import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  CROSS_STITCH_PRESETS,
  DEFAULT_SETTINGS,
  MAX_MARKS,
  RENDERER_VERSION,
  normalizeSettings,
  renderImage,
  toSvg,
  type RenderSettings,
} from "../lib/renderers";
import { settingsSchema, designSchema } from "../lib/server/schema";
import { createPresetSchema } from "../lib/server/presets";
import { presetSettings } from "../lib/preset-types";
import { validateRestorableProject } from "../lib/studio-state";
import { buildKitGuide, kitGuidePages, kitGuideText } from "../lib/kit-guide";
import { getAvailableModes, getPreviewModes } from "../lib/mode-availability";
import { prototypeKitFiles } from "../lib/prototype-kit";
import { createProductionKit } from "../lib/server/production-kit";
import {
  DEFAULT_MARKER_PROFILE_ID,
  getMarkerPalette,
  getMarkerPaletteProfile,
} from "../lib/marker-palettes";

function photo(
  kind: "black" | "white" | "mixed" | "transparent",
  resolution = 80,
) {
  const width = resolution,
    height = resolution;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const rgb =
        kind === "white" ||
        (kind === "mixed" && x > width / 2 && y > height / 2)
          ? [255, 255, 255]
          : kind === "mixed" && x > width / 2
            ? [210, 40, 40]
            : [0, 0, 0];
      data.set([...rgb, kind === "transparent" ? 0 : 255], (y * width + x) * 4);
    }
  return { data, width, height };
}
function settings(changes: Partial<RenderSettings> = {}): RenderSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...CROSS_STITCH_PRESETS.standard,
    mode: "cross-stitch",
    widthMm: 100,
    heightMm: 100,
    palette: ["#000000", "#d22828"],
    autoExposure: false,
    contrast: 1,
    gamma: 1,
    edgeEmphasis: 0,
    ...changes,
  };
}
const shapeOnly = (g: ReturnType<typeof renderImage>) =>
  g.cells.map(({ color: _color, label: _label, ...shape }) => shape);

test("Cross Stitch keeps every guide site and X outline identical across black, colour, white and transparent photographs", () => {
  const geometries = ["black", "white", "mixed", "transparent"].map((kind) =>
    renderImage(photo(kind as Parameters<typeof photo>[0]), settings()),
  );
  assert.ok(geometries[0].cells.length > 100);
  for (const geometry of geometries) {
    assert.deepEqual(shapeOnly(geometry), shapeOnly(geometries[0]));
    assert.equal(
      new Set(geometry.cells.map((cell) => `${cell.width},${cell.height}`))
        .size,
      1,
    );
    assert.equal(geometry.circles.length + geometry.paths.length, 0);
    assert.equal(geometry.stats.markCount, geometry.cells.length);
    assert.deepEqual(renderImage(photo("mixed"), settings()), geometries[2]);
    const outlines =
      toSvg(geometry, "template").match(/<polygon\b[^>]*>/g) ?? [];
    assert.deepEqual(
      outlines,
      toSvg(geometries[0], "template").match(/<polygon\b[^>]*>/g),
    );
  }
  assert.notDeepEqual(
    geometries[0].cells.map((c) => c.label),
    geometries[2].cells.map((c) => c.label),
  );
  assert.deepEqual(
    shapeOnly(renderImage(photo("mixed", 320), settings())),
    shapeOnly(geometries[2]),
  );
});

test("paper key zero remains a guide instruction and never creates finished ink or a white marker requirement", () => {
  for (const source of [photo("white"), photo("transparent")]) {
    const geometry = renderImage(source, settings());
    assert.ok(
      geometry.cells.every(
        (cell) => cell.label === "0" && cell.color === "#ffffff",
      ),
    );
    assert.equal(geometry.stats.inkAreaMm2, 0);
    assert.equal(geometry.stats.estimatedCompletionMinutes, 0);
    assert.doesNotMatch(
      toSvg(geometry, "finished", { background: false }),
      /<polygon\b/,
    );
    assert.equal(
      (toSvg(geometry, "template").match(/<polygon\b/g) ?? []).length,
      geometry.cells.length,
    );
    assert.match(toSvg(geometry, "template"), /aria-label="0"/);
    const guide = buildKitGuide(geometry);
    assert.equal(guide.blankCellCount, geometry.cells.length);
    assert.ok(
      guide.legend.every(
        (entry) => entry.index !== 0 && entry.usedCellCount === 0,
      ),
    );
    assert.ok(guide.materials.every((item) => !item.id.startsWith("marker-")));
    assert.match(guide.warnings.join(" "), /No artwork marks/);
    assert.match(kitGuideText(guide), /Key 0: leave/);
  }
});

test("cross geometry is physically bounded, separated and under the mark cap including extreme and personalised pages", () => {
  for (const size of [
    {
      widthMm: 30,
      heightMm: 1500,
      spacingMm: 0.5,
      minDiameterMm: 0.3,
      maxDiameterMm: 0.3,
    },
    {
      widthMm: 1500,
      heightMm: 30,
      spacingMm: 0.5,
      minDiameterMm: 0.3,
      maxDiameterMm: 0.3,
    },
    {
      widthMm: 1500,
      heightMm: 1500,
      spacingMm: 0.5,
      minDiameterMm: 0.3,
      maxDiameterMm: 0.3,
    },
    {
      widthMm: 100,
      heightMm: 100,
      text: { value: "Quiet moments", placement: "top-center" as const },
    },
  ]) {
    const geometry = renderImage(photo("mixed"), settings(size));
    assert.ok(geometry.cells.length > 0 && geometry.cells.length <= MAX_MARKS);
    assert.ok(
      geometry.stats.effectiveSpacingMm - geometry.cells[0].width >= 0.25,
    );
    for (const cell of geometry.cells) {
      assert.equal(cell.points?.length, 12);
      for (const p of cell.points!) {
        assert.ok(p.x >= 10 - 0.0001 && p.y >= 10 - 0.0001);
        assert.ok(
          p.x <= geometry.widthMm - 10 + 0.0001 &&
            p.y <= geometry.heightMm - 10 + 0.0001,
        );
      }
      if (geometry.text) assert.ok(cell.y > geometry.text.y);
    }
  }
  const counts = ["easy", "standard", "detailed"].map(
    (preset) =>
      renderImage(
        photo("black"),
        settings(
          CROSS_STITCH_PRESETS[preset as keyof typeof CROSS_STITCH_PRESETS],
        ),
      ).cells.length,
  );
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
});

test("number assignments, single polygon area and both serialized views remain deterministic and reject false paper keys", () => {
  const geometry = renderImage(photo("mixed"), settings());
  let area = 0;
  for (const cell of geometry.cells) {
    assert.equal(
      cell.color,
      cell.label === "0"
        ? "#ffffff"
        : geometry.settings.palette![Number(cell.label) - 1],
    );
    if (cell.label === "0") continue;
    const points = cell.points!;
    area +=
      Math.abs(
        points.reduce((sum, p, i) => {
          const q = points[(i + 1) % points.length];
          return sum + p.x * q.y - q.x * p.y;
        }, 0),
      ) / 2;
  }
  assert.ok(Math.abs(area - geometry.stats.inkAreaMm2) < 0.0001);
  for (const view of ["template", "finished"] as const) {
    assert.equal(
      toSvg(JSON.parse(JSON.stringify(geometry)), view),
      toSvg(geometry, view),
    );
    assert.match(toSvg(geometry, view), /width="100mm" height="100mm"/);
  }
  const corrupt = {
    ...geometry,
    cells: [{ ...geometry.cells[0], label: "0", color: "#d22828" }],
  };
  assert.throws(() => toSvg(corrupt, "finished"), /blank keys/);
  assert.throws(() => buildKitGuide(corrupt), /key 0/);
  assert.throws(
    () =>
      buildKitGuide({
        ...geometry,
        cells: [{ ...geometry.cells[0], label: "99" }],
      }),
    /label and colour/,
  );
  assert.throws(
    () => normalizeSettings(settings({ invert: true })),
    /light canvas/,
  );
  assert.throws(
    () => renderImage(photo("mixed"), settings({ subjectMaskStrength: 1 })),
    /Paint a subject selection/,
  );
});

test("Cross Stitch shares save, preset, restore and prototype-only mode policies", () => {
  const parsed = settingsSchema.parse(settings());
  const design = designSchema.parse({
    mode: "cross-stitch",
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
    settings: parsed,
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    source: { dataUrl: "data:image/png;base64,test" },
    rightsConfirmed: true,
  });
  assert.equal(
    createPresetSchema.parse({
      mode: "cross-stitch",
      name: "Uniform grid",
      settings: presetSettings(parsed),
    }).mode,
    "cross-stitch",
  );
  const project = {
    id: "cross-stitch",
    name: "Uniform grid",
    updatedAt: new Date(0).toISOString(),
    image: new Blob(["test"], { type: "image/png" }),
    productId: "30x40",
    finishId: "rolled",
    settings: parsed,
    crop: design.crop,
    rendererVersion: RENDERER_VERSION,
  };
  assert.equal(
    validateRestorableProject(project, ["cross-stitch"]).needsRendererReview,
    false,
  );
  assert.equal(
    validateRestorableProject(
      { ...project, rendererVersion: "slow-reveal-geometry/1.7.0" },
      ["cross-stitch"],
    ).needsRendererReview,
    true,
  );
  assert.deepEqual(getAvailableModes({ NODE_ENV: "production" }), ["dots"]);
  assert.ok(
    getPreviewModes({
      NODE_ENV: "production",
      PUBLIC_PROTOTYPE_MODES_ENABLED: "true",
      LIVE_CHECKOUT_ENABLED: "false",
    }).includes("cross-stitch"),
  );
});

test("Monochrome Mosaic uses one ink and variable tile areas while saved numbered palettes keep their original colours and keys", () => {
  const input = photo("mixed");
  const numbered = renderImage(
    input,
    settings({ mode: "mosaic", palette: ["#1e1e1c", "#ab3030"] }),
  );
  const original = JSON.stringify(numbered),
    originalSvg = toSvg(numbered, "finished");
  const mono = renderImage(input, {
    ...numbered.settings,
    palette: undefined,
    inkColor: "#233b56",
  });
  assert.ok(
    mono.cells.length > 0 &&
      mono.cells.every(
        (cell) => cell.color === undefined && cell.label === undefined,
      ),
  );
  assert.ok(new Set(mono.cells.map((cell) => cell.width)).size > 1);
  assert.equal(buildKitGuide(mono).legend.length, 1);
  assert.equal(buildKitGuide(mono).legend[0].color, "#233b56");
  assert.match(buildKitGuide(mono).title, /one ink/);
  assert.doesNotMatch(toSvg(mono, "template"), /aria-label="\d+"/);
  assert.equal(JSON.stringify(numbered), original);
  assert.equal(toSvg(JSON.parse(original), "finished"), originalSvg);
  assert.deepEqual(
    buildKitGuide(numbered).legend.map((item) => item.color),
    ["#1e1e1c", "#ab3030"],
  );
});

test("named marker profiles keep manufacturer codes in guide and packing requirements without remapping legacy palettes", () => {
  for (const count of [16, 32] as const) {
    const geometry = renderImage(
      photo("mixed"),
      settings({ palette: getMarkerPalette(DEFAULT_MARKER_PROFILE_ID, count) }),
    );
    const guide = buildKitGuide(geometry),
      profile = getMarkerPaletteProfile(DEFAULT_MARKER_PROFILE_ID)!;
    assert.equal(guide.markerProfile?.id, DEFAULT_MARKER_PROFILE_ID);
    assert.equal(guide.markerProfile?.status, "unvalidated");
    assert.deepEqual(
      guide.legend.map((entry) => entry.markerCode),
      profile.colours.slice(0, count).map((entry) => entry.code),
    );
    assert.equal(guide.legend.length, count);
    assert.equal(
      guide.blankCellCount! +
        guide.legend.reduce((sum, entry) => sum + entry.usedCellCount, 0),
      geometry.cells.length,
    );
    assert.ok(kitGuidePages(geometry).length <= 5);
    assert.match(kitGuidePages(geometry).join(""), /pen 120/);
    assert.match(kitGuidePages(geometry).join(""), /Reference set: Ohuhu/);
    for (const page of kitGuidePages(geometry)) {
      for (const match of page.matchAll(/data-bounds-mm="([^"]+)"/g)) {
        const [x, y, width, height] = match[1].split(",").map(Number);
        assert.ok(x >= 11 && y >= 9 && x + width <= 199 && y + height <= 289);
      }
    }
    assert.ok(guide.materials.every((entry) => entry.id !== "marker-0"));
  }
  const legacy = renderImage(
    photo("mixed"),
    settings({ palette: ["#102030", "#abcdef", "#992222"] }),
  );
  assert.equal(buildKitGuide(legacy).markerProfile, undefined);
  assert.deepEqual(
    buildKitGuide(legacy).legend.map((entry) => entry.color),
    ["#102030", "#abcdef", "#992222"],
  );
});

test("Cross Stitch local and production export guides preserve zero-paper instructions, geometry and marker assignments", async () => {
  const geometry = renderImage(photo("mixed"), settings());
  const local = await prototypeKitFiles(
    geometry,
    async (svg, width, height, dpi) => {
      const data = await sharp(
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
      return new Blob([new Uint8Array(data)], { type: "image/png" });
    },
  );
  const server = await createProductionKit(geometry, {
    orderId: "trial",
    revisionId: "trial",
    snapshotHash: "a".repeat(64),
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
  });
  assert.equal(local.manifest.pages, 2);
  assert.equal(server.manifest.pages, 2);
  const localPacking = JSON.parse(
    await local.files
      .find((file) => file.key === "packingListJson")!
      .blob.text(),
  );
  const serverPacking = JSON.parse(
    server.files
      .find((file) => file.path === "kit/packing-list.json")!
      .data.toString(),
  );
  for (const packing of [localPacking, serverPacking]) {
    assert.equal(packing.paperKey, "0");
    assert.equal(
      packing.blankCrosses,
      geometry.cells.filter((cell) => cell.label === "0").length,
    );
    assert.ok(
      packing.materials.every((item: { id: string }) => item.id !== "marker-0"),
    );
  }
  for (let i = 1; i <= 2; i++)
    assert.equal(
      await local.files
        .find((file) => file.key === `guidePage${i}`)!
        .blob.text(),
      server.files
        .find((file) => file.path === `kit/making-guide-page-${i}.svg`)!
        .data.toString(),
    );
  const pdf = server.files
    .find((file) => file.path === "kit/making-guide.pdf")!
    .data.toString("latin1");
  assert.match(pdf, /\/Count 2/);
});
