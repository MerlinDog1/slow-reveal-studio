import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  FONT_OUTLINE_VERSION,
  effectiveGuideColor,
  renderImage,
  toSvg,
  type RenderGeometry,
  type RenderMode,
} from "../lib/renderers";

const ink = "#173d57",
  guide = "#8c7967";

/** A serializer fixture exercises every mark kind and both outlined lettering paths. */
function specimen(): RenderGeometry {
  const pixels = new Uint8ClampedArray(32 * 40 * 4).fill(255);
  const geometry = renderImage(
    { data: pixels, width: 32, height: 40 },
    {
      ...DEFAULT_SETTINGS,
      widthMm: 100,
      heightMm: 120,
      inkColor: ink,
      guideOpacity: 0.25,
      guideWidthMm: 0.2,
    },
  );
  return {
    ...geometry,
    circles: [{ x: 20, y: 20, r: 2 }],
    cells: [
      {
        x: 30,
        y: 20,
        width: 5,
        height: 5,
        radius: 1,
        color: "#a65533",
        label: "1",
      },
      {
        x: 40,
        y: 20,
        width: 6,
        height: 6,
        color: "#54725b",
        label: "2",
        points: [
          { x: 43, y: 20 },
          { x: 46, y: 23 },
          { x: 43, y: 26 },
          { x: 40, y: 23 },
        ],
      },
    ],
    paths: [
      {
        points: [
          { x: 20, y: 40 },
          { x: 50, y: 50 },
        ],
        width: 0.12,
      },
    ],
    text: {
      value: "Milo & Ada",
      fontFamily: "serif",
      fontVersion: FONT_OUTLINE_VERSION,
      x: 50,
      y: 90,
      sizeMm: 6,
      anchor: "middle",
      maxWidthMm: 70,
    },
  };
}

test("independent guide colour covers circles, cells, paths, numerals and personalised outline lettering", () => {
  const geometry = specimen();
  geometry.settings.guideColor = "#8C7967";
  const svg = toSvg(geometry, "template", { background: false });
  assert.match(
    svg,
    /<g fill="none" stroke="#8c7967" stroke-width="0.2" opacity="0.25">/,
  );
  assert.match(svg, /<circle cx="20" cy="20" r="1.9"\/>/);
  assert.match(
    svg,
    /<rect x="30.1" y="20.1" width="4.8" height="4.8" rx="0.9"\/>/,
  );
  assert.match(svg, /<polygon points="/);
  assert.match(
    svg,
    /<path d="M20 40 L50 50" fill="none" stroke="#8c7967" stroke-width="0.12"[^>]*opacity="0.25"/,
  );
  for (const label of ["1", "2", "Milo &amp; Ada"])
    assert.ok(svg.includes(`aria-label="${label}" fill="${guide}"`), label);
  assert.doesNotMatch(svg, /#173d57|#a65533|#54725b|<text\b/);
});

test("guide changes leave all serialized positions, outlines, opacity and diagnostic colours intact", () => {
  const base = specimen();
  const changed = {
    ...base,
    settings: { ...base.settings, guideColor: guide },
  };
  const options = { background: "#eeeeee", includeSafeArea: true };
  const legacy = toSvg(base, "template", options);
  const coloured = toSvg(changed, "template", options);
  assert.equal(coloured.replaceAll(guide, ink), legacy);
  assert.match(coloured, /width="100mm" height="120mm" viewBox="0 0 100 120"/);
  assert.match(coloured, /<rect width="100" height="120" fill="#eeeeee"/);
  assert.match(
    coloured,
    /stroke="#9c7454" stroke-width="0.3" stroke-dasharray="2 2"/,
  );
  assert.equal(
    toSvg(changed, "template", { background: false }).includes(
      'fill="#eeeeee"',
    ),
    false,
  );
  assert.deepEqual(changed.circles, base.circles);
  assert.deepEqual(changed.cells, base.cells);
  assert.deepEqual(changed.paths, base.paths);
});

test("finished outputs preserve artwork ink, Mosaic palette and solid lettering across every mode", () => {
  for (const mode of [
    "dots",
    "mosaic",
    "contour",
    "line-amplification",
  ] as RenderMode[]) {
    const base = specimen();
    base.mode = mode;
    base.settings.mode = mode;
    const changed = {
      ...base,
      settings: { ...base.settings, guideColor: guide },
    };
    const finished = toSvg(changed, "finished", { background: false });
    assert.equal(
      finished,
      toSvg(base, "finished", { background: false }),
      mode,
    );
    assert.ok(finished.includes(`fill="${ink}"`));
    assert.match(finished, /fill="#a65533"/);
    assert.match(finished, /fill="#54725b"/);
    assert.ok(finished.includes(`aria-label="Milo &amp; Ada" fill="${ink}"`));
    assert.doesNotMatch(finished, /#8c7967|opacity="0.25"/);
  }
});

test("omission inherits current ink after changes, explicit colour survives JSON and inversion", () => {
  const base = specimen();
  for (const inkColor of ["#123456", "#f0ede5"]) {
    const inherited = {
      ...base,
      settings: { ...base.settings, inkColor, invert: true },
    };
    const explicit = {
      ...inherited,
      settings: { ...inherited.settings, guideColor: inkColor },
    };
    assert.equal(toSvg(inherited, "template"), toSvg(explicit, "template"));
    const fixed = {
      ...inherited,
      settings: { ...inherited.settings, guideColor: guide },
    };
    assert.equal(
      toSvg(fixed, "template"),
      toSvg(JSON.parse(JSON.stringify(fixed)), "template"),
    );
    assert.match(
      toSvg(fixed, "template"),
      /<rect width="100" height="120" fill="#1e1e1c"/,
    );
    assert.ok(toSvg(fixed, "template").includes(`stroke="${guide}"`));
  }
});

test("malformed or injected guide colours fail validation for both template and finished export", () => {
  for (const guideColor of [
    "red",
    "#abc",
    "#12345678",
    "url(https://example.com)",
    '#123456" onload="alert(1)',
    null,
  ]) {
    const base = specimen();
    const settings = {
      ...base.settings,
      guideColor,
    } as unknown as RenderGeometry["settings"];
    for (const variant of ["template", "finished"] as const)
      assert.throws(
        () => toSvg({ ...base, settings }, variant),
        /guide colour/i,
      );
  }
});

test("shared effective guide colour resolves explicit and inherited ink consistently before and after inversion mapping", () => {
  assert.equal(
    effectiveGuideColor({ inkColor: "#1E1E1C", invert: true }),
    "#f4efe6",
  );
  assert.equal(
    effectiveGuideColor({ inkColor: "#f4efe6", invert: true }),
    "#f4efe6",
  );
  assert.equal(
    effectiveGuideColor({ inkColor: "#1e1e1c", invert: false }),
    "#1e1e1c",
  );
  assert.equal(
    effectiveGuideColor({ inkColor: "#123ABC", invert: true }),
    "#123abc",
  );
  assert.equal(
    effectiveGuideColor({
      inkColor: "#1e1e1c",
      invert: true,
      guideColor: "#8C7967",
    }),
    guide,
  );
  const source = new Uint8ClampedArray(32 * 40 * 4).fill(255);
  const settings = { ...DEFAULT_SETTINGS, invert: true };
  const geometry = renderImage(
    { data: source, width: 32, height: 40 },
    settings,
  );
  assert.equal(
    effectiveGuideColor(settings),
    effectiveGuideColor(geometry.settings),
  );
  assert.ok(toSvg(geometry, "template").includes('stroke="#f4efe6"'));
});
