import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  buildKitGuide,
  kitGuidePages,
  kitGuideText,
  KIT_GUIDE_PAGE,
} from "../lib/kit-guide";
import {
  DEFAULT_SETTINGS,
  renderImage,
  toSvg,
  type RenderGeometry,
  type RenderMode,
} from "../lib/renderers";

function fixture(mode: RenderMode = "dots"): RenderGeometry {
  const data = new Uint8ClampedArray(40 * 50 * 4);
  for (let y = 0; y < 50; y++)
    for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4,
        tone = Math.round(25 + (170 * Math.hypot(x - 20, y - 25)) / 33);
      data[i] = data[i + 1] = data[i + 2] = tone;
      data[i + 3] = 255;
    }
  return renderImage(
    { data, width: 40, height: 50 },
    {
      ...DEFAULT_SETTINGS,
      mode,
      widthMm: 120,
      heightMm: 160,
      text: { value: "Private family wording", sizeMm: 4 },
    },
  );
}

function paletteFixture(): RenderGeometry {
  const geometry = fixture("mosaic");
  geometry.settings.palette = [
    "#1e1e1c",
    "#8b4732",
    "#d4b47e",
    "#335544",
    "#334477",
    "#884488",
    "#778899",
    "#ffffff",
  ];
  geometry.cells = geometry.settings.palette
    .slice(0, 7)
    .flatMap((color, index) =>
      Array.from({ length: index + 1 }, (_, repetition) => ({
        x: 15 + index * 10,
        y: 15 + repetition * 10,
        width: 5,
        height: 5,
        color,
        label: String(index + 1),
      })),
    );
  return geometry;
}

test("canonical key keeps saved palette IDs and exact used-cell counts without a paper entry", () => {
  const geometry = paletteFixture(),
    model = buildKitGuide(geometry);
  assert.deepEqual(
    model.legend.map((entry) => [
      entry.id,
      entry.index,
      entry.color,
      entry.usedCellCount,
    ]),
    geometry.settings.palette!.map((color, index) => [
      String(index + 1),
      index + 1,
      color,
      index === 7 ? 0 : index + 1,
    ]),
  );
  assert.equal(model.legend.length, 8);
  assert.equal(
    model.materials.filter((item) => item.id.startsWith("marker-")).length,
    7,
  );
  assert.ok(!model.materials.some((item) => item.id === "marker-8"));
  assert.equal(
    model.legend.reduce((sum, entry) => sum + entry.usedCellCount, 0),
    geometry.cells.length,
  );
  assert.match(kitGuideText(model), /Blank|unmarked canvas/);
});

test("wrong, missing, noncanonical and remapped palette assignments fail instead of publishing a false key", () => {
  const changes: ((g: RenderGeometry) => void)[] = [
    (g) => {
      g.cells[0].label = "2";
    },
    (g) => {
      g.cells[0].label = "01";
    },
    (g) => {
      delete g.cells[0].label;
    },
    (g) => {
      delete g.cells[0].color;
    },
    (g) => {
      g.cells[0].color = "#123456";
    },
    (g) => {
      g.settings.palette![1] = g.settings.palette![0];
    },
    (g) => {
      g.settings.palette!.reverse();
    },
  ];
  for (const change of changes) {
    const geometry = paletteFixture();
    change(geometry);
    assert.throws(() => buildKitGuide(geometry), /palette/);
    assert.throws(() => kitGuidePages(geometry), /palette/);
  }
});

test("all modes have faithful activities, single ink inheritance and unconfirmed material requirements", () => {
  for (const mode of [
    "dots",
    "mosaic",
    "contour",
    "line-amplification",
  ] as const) {
    const geometry = fixture(mode),
      model = buildKitGuide(geometry);
    assert.equal(model.status, "draft-for-physical-trial");
    assert.deepEqual(model.dimensions, { widthMm: 120, heightMm: 160 });
    assert.deepEqual(model.legend, [
      {
        id: "ink",
        index: null,
        color: geometry.settings.inkColor,
        usedCellCount: geometry.cells.length,
      },
    ]);
    assert.ok(
      model.materials.every((item) => item.assignmentStatus === "unresolved"),
    );
    assert.equal(
      model.materials.some((item) => item.id === "straight-edge"),
      mode === "line-amplification",
    );
    if (mode === "line-amplification") {
      assert.match(kitGuideText(model), /between the two printed boundaries/);
      assert.match(
        kitGuideText(model),
        /not replace it with one thin centre line/,
      );
    }
    if (mode === "contour")
      assert.match(kitGuideText(model), /Do not fill between paths/);
    if (mode === "dots")
      assert.match(kitGuideText(model), /Keep separate circles separate/);
  }
  const inverted = fixture();
  inverted.settings.inkColor = "#f4efe6";
  inverted.settings.invert = true;
  assert.equal(buildKitGuide(inverted).legend[0].color, "#f4efe6");
});

test("two A4 pages use portable outlines, bounded annotation layout and identical saved sample primitives", () => {
  const modes = [
    fixture("dots"),
    paletteFixture(),
    fixture("mosaic"),
    fixture("contour"),
    fixture("line-amplification"),
  ];
  assert.deepEqual(KIT_GUIDE_PAGE, { widthMm: 210, heightMm: 297 });
  for (const geometry of modes) {
    const model = buildKitGuide(geometry),
      pages = kitGuidePages(geometry);
    assert.equal(pages.length, 2);
    for (const page of pages) {
      assert.match(page, /width="210mm" height="297mm" viewBox="0 0 210 297"/);
      assert.doesNotMatch(page, /<text\b|<image\b|Private family wording/);
      assert.match(page, /DRAFT FOR PHYSICAL TRIAL - NOT APPROVED/);
      for (const bounds of page.matchAll(/data-bounds-mm="([^"]+)"/g)) {
        const [x, y, width, height] = bounds[1].split(",").map(Number);
        assert.ok(
          x >= 11 && y >= 9 && x + width <= 199 && y + height <= 289,
          `${geometry.mode}: ${bounds[1]}`,
        );
      }
    }
    const selected = {
      ...geometry,
      settings: { ...geometry.settings, text: undefined },
      text: undefined,
      circles: model.sample.circleIndices.map((i) => geometry.circles[i]),
      cells: model.sample.cellIndices.map((i) => geometry.cells[i]),
      paths: model.sample.pathIndices.map((i) => geometry.paths[i]),
    };
    for (const variant of ["template", "finished"] as const) {
      const svg = toSvg(selected, variant, {
        background: false,
        title: `Selected ${variant} marks`,
      });
      assert.ok(
        pages[0].includes(
          svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>")),
        ),
        `${geometry.mode} ${variant}`,
      );
    }
    const scales = [...pages[0].matchAll(/data-scale="([^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.equal(scales.length, 2);
    assert.equal(scales[0], scales[1]);
  }
});

test("model and page generation are repeatable, nonmutating and omit private lettering and source metadata", () => {
  const geometry = paletteFixture(),
    before = JSON.stringify(geometry);
  const firstModel = buildKitGuide(geometry),
    firstPages = kitGuidePages(geometry);
  assert.equal(JSON.stringify(geometry), before);
  const hash = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.equal(hash(firstModel), hash(buildKitGuide(JSON.parse(before))));
  assert.equal(hash(firstPages), hash(kitGuidePages(JSON.parse(before))));
  assert.doesNotMatch(
    JSON.stringify(firstModel) + firstPages.join("") + kitGuideText(firstModel),
    /Private family wording|sourceSha256|proofHash|revisionId/,
  );
  firstModel.steps[0].body = "mutated result";
  assert.notEqual(buildKitGuide(geometry).steps[0].body, "mutated result");
});

test("empty artwork is explicitly unresolved and malformed geometry cannot produce a plausible guide", () => {
  const empty = fixture();
  empty.circles = [];
  assert.match(kitGuideText(buildKitGuide(empty)), /No artwork marks/);
  assert.match(kitGuidePages(empty)[0], /No artwork marks/);
  for (const change of [
    (g: RenderGeometry) => {
      g.widthMm += 1;
    },
    (g: RenderGeometry) => {
      g.mode = "contour";
    },
    (g: RenderGeometry) => {
      g.circles[0].r = -1;
    },
    (g: RenderGeometry) => {
      g.circles[0].x = NaN;
    },
    (g: RenderGeometry) => {
      g.circles[0].x = 500;
    },
  ]) {
    const geometry = fixture();
    change(geometry);
    assert.throws(() => buildKitGuide(geometry));
  }
});

test("all eight used palette entries fit the two-page guide at maximum canvas dimensions, and all empty modes remain labelled", () => {
  const geometry = paletteFixture();
  geometry.settings.palette![7] = "#baaabb";
  geometry.cells.push({
    x: 95,
    y: 15,
    width: 5,
    height: 5,
    color: "#baaabb",
    label: "8",
  });
  geometry.widthMm = geometry.settings.widthMm = 1500;
  geometry.heightMm = geometry.settings.heightMm = 1500;
  const model = buildKitGuide(geometry);
  assert.equal(
    model.materials.filter((item) => item.id.startsWith("marker-")).length,
    8,
  );
  const pages = kitGuidePages(geometry);
  assert.equal(pages.length, 2);
  assert.match(pages[1], /Key 8  #baaabb/);
  assert.match(pages[1], /1500 x 1500 mm/);
  assert.match(pages[1], /Marker matching key 8/);
  for (const mode of [
    "dots",
    "mosaic",
    "contour",
    "line-amplification",
  ] as const) {
    const empty = fixture(mode);
    empty.circles = [];
    empty.cells = [];
    empty.paths = [];
    assert.match(kitGuideText(buildKitGuide(empty)), /No artwork marks/);
    assert.equal(kitGuidePages(empty).length, 2);
  }
});
