import {
  maskRasterDimensions,
  normalizeSubjectMask,
} from "../lib/subject-mask";
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  renderImage,
  normalizeSettings,
  toSvg,
  type RenderSettings,
} from "../lib/renderers";
import { settingsSchema } from "../lib/server/schema";
import { photoPalette } from "../lib/photo-palette";
import { colourCandidates } from "../lib/renderers/optical";
import { makingPlan } from "../lib/making-plan";
import { sampleSheetSvg } from "../lib/sample-sheet";
import {
  encodeProjectBackup,
  decodeProjectBackup,
} from "../lib/project-backup";
import { validateRestorableProject } from "../lib/studio-state";
import { replaceFile } from "../lib/server/atomic-file";

const image = {
  width: 80,
  height: 100,
  data: Uint8ClampedArray.from({ length: 80 * 100 * 4 }, (_, i) =>
    i % 4 === 3 ? 255 : 20 + (Math.floor(i / 4) % 80) * 2,
  ),
};
const settings = (patch: Partial<RenderSettings> = {}): RenderSettings => ({
  ...DEFAULT_SETTINGS,
  widthMm: 100,
  heightMm: 140,
  autoExposure: false,
  ...patch,
});

test("creative settings survive server parsing and reject invalid values without changing legacy defaults", () => {
  const chosen = settings({
    colourCompensation: 0.5,
    shadowLift: 0.3,
    focusX: 0.2,
    focusY: 0.7,
    focusRadius: 0.1,
    focusBrightness: -0.2,
    focusDetail: 0.8,
    selectiveColour: true,
    compositionShape: "oval",
    spiralX: 0.1,
    spiralY: 0.9,
    spiralRotation: 180,
    linePattern: "flow",
  });
  assert.deepEqual(
    normalizeSettings(settingsSchema.parse(chosen)),
    normalizeSettings(chosen),
  );
  for (const field of [
    "colourCompensation",
    "shadowLift",
    "focusX",
    "spiralX",
    "focusDetail",
  ] as const)
    for (const value of [-0.01, 1.01, NaN, Infinity])
      assert.throws(() => normalizeSettings(settings({ [field]: value })));
  const original = renderImage(image, settings());
  const neutral = renderImage(
    image,
    settings({
      colourCompensation: 0,
      shadowLift: 0,
      focusBrightness: 0,
      focusDetail: 0,
      selectiveColour: false,
      compositionShape: "rectangle",
    }),
  );
  assert.deepEqual(original.circles, neutral.circles);
});

test("off-centre Fibonacci circles retain physical clearances and circular/oval apertures contain complete marks", () => {
  for (const compositionShape of ["rectangle", "circle", "oval"] as const) {
    const s = settings({
      mode: "fibonacci",
      spiralX: 0.1,
      spiralY: 0.85,
      spiralRotation: 71,
      compositionShape,
    });
    const g = renderImage(image, s);
    assert.ok(g.circles.length > 50);
    assert.deepEqual(g, renderImage(image, JSON.parse(JSON.stringify(s))));
    for (let i = 0; i < g.circles.length; i++) {
      const c = g.circles[i];
      assert.ok(
        c.x - c.r >= 10 - 1e-3 &&
          c.y - c.r >= 10 - 1e-3 &&
          c.x + c.r <= 90 + 1e-3 &&
          c.y + c.r <= 130 + 1e-3,
      );
      if (compositionShape !== "rectangle") {
        const rx = 40 - c.r,
          ry = (compositionShape === "circle" ? 40 : 60) - c.r;
        assert.ok(((c.x - 50) / rx) ** 2 + ((c.y - 70) / ry) ** 2 <= 1.0001);
      }
      for (let j = 0; j < i; j++) {
        const other = g.circles[j];
        assert.ok(
          Math.hypot(c.x - other.x, c.y - other.y) - c.r - other.r >=
            0.25 - 1e-3,
        );
      }
    }
  }
});

test("experimental ribbons are bounded polygons with matching template and finished SVG dimensions", () => {
  for (const linePattern of ["spiral", "flow", "crosshatch"] as const) {
    const g = renderImage(
      image,
      settings({ mode: "line-amplification", linePattern }),
    );
    assert.ok(g.cells.length > 50 && g.cells.length <= 60000);
    for (const c of g.cells) {
      assert.equal(c.points?.length, 4);
      assert.ok(
        c.points!.every(
          (p) => p.x >= 10 && p.x <= 90 && p.y >= 10 && p.y <= 130,
        ),
      );
    }
    for (const variant of ["finished", "template"] as const) {
      const svg = toSvg(g, variant);
      assert.match(svg, /width="100mm" height="140mm"/);
      assert.equal((svg.match(/<polygon /g) ?? []).length, g.cells.length);
      assert.doesNotMatch(svg, /NaN|Infinity/);
    }
  }
});

test("palette clustering preserves locked colours, alpha-white and determinism; coverage compensation models lighter visible pigments", () => {
  const palette = photoPalette(image, 8, ["#ff1000"]);
  assert.equal(palette[0], "#ff1000");
  assert.ok(palette.length <= 8 && palette.length >= 2);
  assert.deepEqual(palette, photoPalette(image, 8, ["#ff1000"]));
  assert.throws(() => photoPalette(image, 1));
  assert.throws(() => photoPalette(image, 2, ["<script>"]));
  const raw = colourCandidates(["#000000", "#ff0000"], 0.5, 0),
    compensated = colourCandidates(["#000000", "#ff0000"], 0.5, 1);
  assert.deepEqual(raw[1], [0, 0, 0]);
  assert.deepEqual(compensated[1], [0.5, 0.5, 0.5]);
  assert.deepEqual(compensated[0], [1, 1, 1]);
});

test("making sections account for every mark and the sample preserves mm geometry on exact A4", () => {
  const g = renderImage(
    image,
    settings({ mode: "fibonacci", palette: ["#182d45", "#c89c50"] }),
  );
  const plan = makingPlan(g);
  assert.equal(
    plan.regions.reduce((sum, r) => sum + r.marks, 0),
    g.stats.markCount,
  );
  assert.ok(plan.smallestLabelMm && plan.smallestLabelMm > 0);
  const sheet = sampleSheetSvg(g);
  assert.match(sheet, /width="210mm" height="297mm" viewBox="0 0 210 297"/);
  assert.match(sheet, /This line must measure 100 mm/);
  assert.match(sheet, /clip-path="url\(#sample\)"/);
});

test("portable backup verifies source checksum, omits capabilities and restores through existing validation", async () => {
  const project = {
    id: "current",
    name: "Private fixture",
    updatedAt: new Date().toISOString(),
    image: new Blob(["synthetic image"], { type: "image/png" }),
    settings: settings(),
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    productId: "30x40",
    finishId: "rolled",
    privateDesign: { token: "must-not-export" },
  };
  const blob = await encodeProjectBackup(project as never),
    text = await blob.text();
  assert.ok(!text.includes("must-not-export"));
  const restored = validateRestorableProject(await decodeProjectBackup(blob), [
    "dots",
  ]);
  assert.equal(await restored.project.image.text(), "synthetic image");
  const damaged = JSON.parse(text);
  damaged.source.base64 = btoa("different");
  await assert.rejects(
    () => decodeProjectBackup(new Blob([JSON.stringify(damaged)])),
    /damaged/,
  );
  await assert.rejects(
    () => decodeProjectBackup(new Blob(["x".repeat(14 * 1024 * 1024)])),
    /under 13 MB/,
  );
});

test("record rename retries only transient sharing errors and never deletes the last good record", async () => {
  let calls = 0;
  const pauses: number[] = [];
  await replaceFile(
    "temporary",
    "record",
    async () => {
      if (++calls < 3)
        throw Object.assign(new Error("held"), { code: "EPERM" });
    },
    async (ms) => {
      pauses.push(ms);
    },
  );
  assert.equal(calls, 3);
  assert.deepEqual(pauses, [20, 40]);
  calls = 0;
  await assert.rejects(
    () =>
      replaceFile(
        "temporary",
        "record",
        async () => {
          calls++;
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        },
        async () => {},
      ),
    /missing/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    () =>
      replaceFile(
        "temporary",
        "record",
        async () => {
          calls++;
          throw Object.assign(new Error("held"), { code: "EPERM" });
        },
        async () => {},
      ),
    /held/,
  );
  assert.equal(calls, 6);
});

test("optical masks stay blank after negative brightness and contrast adjustments", () => {
  const dimensions = maskRasterDimensions(100, 140);
  const mask = normalizeSubjectMask({
    version: 1,
    space: "cropped-v1",
    sourceSha256: "a".repeat(64),
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    widthMm: 100,
    heightMm: 140,
    ...dimensions,
    data: Buffer.alloc(dimensions.width * dimensions.height).toString("base64"),
    feather: 0,
  });
  for (const mode of [
    "colour-blend",
    "tv-weave",
    "fibonacci",
    "cross-stitch",
  ] as const) {
    const g = renderImage(
      image,
      settings({
        mode,
        brightness: -0.3,
        contrast: 0.5,
        palette: ["#182d45", "#c89c50"],
        subjectMaskStrength: 1,
      }),
      mask,
    );
    if (mode === "cross-stitch") {
      assert.ok(g.cells.length > 0, "Retain the uniform blank guide grid");
      assert.ok(g.cells.every((cell) => cell.label === "0"));
      const plan = makingPlan(g);
      assert.equal(
        plan.regions.reduce((sum, area) => sum + area.marks, 0),
        0,
      );
      assert.ok(plan.regions.every((area) => area.colours.length === 0));
    } else assert.equal(g.stats.markCount, 0);
  }
});
