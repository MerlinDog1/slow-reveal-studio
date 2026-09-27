import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  FONT_OUTLINE_VERSION,
  MAX_MARKS,
  PRESETS,
  effectiveGuideWidthMm,
  measureLettering,
  normalizeSettings,
  outlineLettering,
  renderImage,
  toSvg,
  type Circle,
  type PixelImage,
  type RenderMode,
  type RenderSettings,
} from "../lib/renderers/index";

function image(
  width = 96,
  height = 120,
  pixel: (
    x: number,
    y: number,
  ) => number | [number, number, number, number] = () => 0,
): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = pixel(
        x / Math.max(1, width - 1),
        y / Math.max(1, height - 1),
      );
      data.set(
        typeof value === "number" ? [value, value, value, 255] : value,
        (y * width + x) * 4,
      );
    }
  return { data, width, height };
}

const settings = (patch: Partial<RenderSettings> = {}): RenderSettings => ({
  ...DEFAULT_SETTINGS,
  widthMm: 120,
  heightMm: 160,
  safeMarginMm: 6,
  ...patch,
});

function assertCircleGaps(
  circles: Circle[],
  pitch: number,
  minGap = 0.249,
): void {
  const buckets = new Map<string, Circle[]>();
  for (const circle of circles) {
    const x = Math.floor(circle.x / pitch),
      y = Math.floor(circle.y / pitch);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        for (const other of buckets.get(`${x + dx}:${y + dy}`) ?? []) {
          const gap =
            Math.hypot(circle.x - other.x, circle.y - other.y) -
            circle.r -
            other.r;
          assert.ok(gap >= minGap, `Dot gap ${gap} is below ${minGap} mm.`);
        }
      }
    const key = `${x}:${y}`;
    buckets.set(key, [...(buckets.get(key) ?? []), circle]);
  }
}

test("dense dark dots preserve print minimum, safe area and clear inter-dot gaps", () => {
  const s = settings({
    spacingMm: 1.2,
    minDiameterMm: 0.7,
    maxDiameterMm: 5,
    density: 3,
  });
  const g = renderImage(image(), s);
  assert.ok(g.circles.length > 1000);
  for (const dot of g.circles) {
    assert.ok(dot.r * 2 >= s.minDiameterMm - 0.0001);
    assert.ok(dot.r * 2 <= s.maxDiameterMm + 0.0001);
    assert.ok(dot.x - dot.r >= s.safeMarginMm - 0.0001);
    assert.ok(dot.y - dot.r >= s.safeMarginMm - 0.0001);
    assert.ok(dot.x + dot.r <= s.widthMm - s.safeMarginMm + 0.0001);
    assert.ok(dot.y + dot.r <= s.heightMm - s.safeMarginMm + 0.0001);
  }
  assertCircleGaps(g.circles, g.stats.effectiveSpacingMm);
});

test("geometry and SVG are deterministic and survive JSON round trips", () => {
  const source = image(121, 143, (x, y) =>
    Math.round((Math.sin(x * 16) * Math.cos(y * 12) + 1) * 127),
  );
  for (const mode of [
    "dots",
    "mosaic",
    "contour",
    "line-amplification",
  ] as RenderMode[]) {
    const first = renderImage(source, settings({ mode }));
    const second = renderImage(source, settings({ mode }));
    assert.deepEqual(first, second);
    assert.equal(
      toSvg(first, "template"),
      toSvg(JSON.parse(JSON.stringify(first)), "template"),
    );
    assert.ok(
      first.stats.markCount > 0,
      `${mode} should produce activity marks`,
    );
  }
});

test("white and transparent source pixels do not become ink", () => {
  for (const source of [
    image(80, 100, () => 255),
    image(80, 100, () => [0, 0, 0, 0]),
  ]) {
    const g = renderImage(source, settings());
    assert.equal(g.stats.markCount, 0);
    assert.equal(g.stats.estimatedCompletionMinutes, 0);
  }
});

test("shared effective guide width matches SVG outlines and preserves narrower paths", () => {
  const s = settings({ minDiameterMm: 0.3, guideWidthMm: 0.5 });
  assert.equal(effectiveGuideWidthMm(s), 0.15);
  assert.equal(effectiveGuideWidthMm({ minDiameterMm: 0.9 }), 0.15);
  assert.equal(effectiveGuideWidthMm(settings({ guideWidthMm: 0.08 })), 0.08);
  const geometry = renderImage(image(), s);
  geometry.paths = [
    {
      points: [
        { x: 20, y: 20 },
        { x: 30, y: 20 },
      ],
      width: 0.06,
    },
    {
      points: [
        { x: 20, y: 30 },
        { x: 30, y: 30 },
      ],
      width: 0.4,
    },
  ];
  const template = toSvg(geometry, "template");
  assert.match(template, /<g[^>]*stroke-width="0\.15"/);
  assert.match(template, /d="M20 20 L30 20"[^>]*stroke-width="0\.06"/);
  assert.match(template, /d="M20 30 L30 30"[^>]*stroke-width="0\.15"/);
  assert.match(
    toSvg(geometry, "finished"),
    /d="M20 30 L30 30"[^>]*stroke-width="0\.4"/,
  );
});

test("physical mark lattice is independent of analysis resolution", () => {
  const small = renderImage(image(80, 100), settings());
  const large = renderImage(image(800, 1000), settings());
  assert.deepEqual(small.circles, large.circles);
  assert.equal(small.stats.effectiveSpacingMm, large.stats.effectiveSpacingMm);
});

test("easy and detailed presets change physical workload", () => {
  const source = image(100, 100, () => 90);
  const easy = renderImage(source, settings(PRESETS.easy));
  const detailed = renderImage(source, settings(PRESETS.detailed));
  assert.ok(detailed.stats.markCount > easy.stats.markCount * 2);
  assert.ok(
    detailed.stats.estimatedCompletionMinutes >
      easy.stats.estimatedCompletionMinutes,
  );
  assert.ok(
    Math.max(...easy.circles.map((c) => c.r)) >
      Math.max(...detailed.circles.map((c) => c.r)),
  );
});

test("source tone changes dot area monotonically without changing physical centres", () => {
  const dark = renderImage(
    image(80, 100, () => 40),
    settings(),
  );
  const light = renderImage(
    image(80, 100, () => 170),
    settings(),
  );
  assert.equal(dark.circles.length, light.circles.length);
  assert.ok(dark.stats.inkAreaMm2 > light.stats.inkAreaMm2);
  assert.deepEqual(
    dark.circles.map(({ x, y }) => [x, y]),
    light.circles.map(({ x, y }) => [x, y]),
  );
});

test("extreme valid canvas settings are bounded to 60,000 dots", () => {
  const g = renderImage(
    image(32, 32),
    settings({
      widthMm: 1500,
      heightMm: 1500,
      spacingMm: 0.5,
      minDiameterMm: 0.3,
      maxDiameterMm: 0.7,
      density: 3,
    }),
  );
  assert.ok(g.stats.markCount <= MAX_MARKS);
  assert.ok(g.stats.markCount > 40000);
  assert.ok(g.warnings.some((w) => w.includes("60,000")));
});

test("SVG uses exact physical page dimensions and can omit the substrate", () => {
  const g = renderImage(image(), settings({ widthMm: 300, heightMm: 400 }));
  const transparent = toSvg(g, "template", { background: false });
  assert.match(
    transparent,
    /width="300mm" height="400mm" viewBox="0 0 300 400"/,
  );
  assert.ok(!transparent.includes('<rect width="300"'));
  const filled = toSvg(g, "finished");
  assert.ok(filled.includes('<rect width="300"'));
  assert.equal(
    (filled.match(/<circle /g) ?? []).length,
    (transparent.match(/<circle /g) ?? []).length,
  );
});

test("guide outlines stay inside the filled mark boundary", () => {
  const g = renderImage(
    image(),
    settings({ minDiameterMm: 0.3, maxDiameterMm: 0.3, guideWidthMm: 0.5 }),
  );
  const svg = toSvg(g, "template");
  const radius = Number(svg.match(/<circle[^>]+ r="([\d.]+)"/)?.[1]);
  const stroke = Number(svg.match(/stroke-width="([\d.]+)"/)?.[1]);
  assert.ok(radius * 2 + stroke <= 0.3001);
});

test("personalisation is escaped and separated from artwork at every placement", () => {
  for (const placement of [
    "bottom-center",
    "bottom-left",
    "bottom-right",
    "top-center",
  ] as const) {
    const g = renderImage(
      image(),
      settings({
        text: { value: '<script>alert("x")</script>&', placement, sizeMm: 9 },
      }),
    );
    const svg = toSvg(g, "template", { title: 'A "quoted" <title>' });
    assert.ok(!svg.includes("<script>"));
    assert.ok(svg.includes("&lt;script&gt;"));
    assert.ok(svg.includes("&quot;quoted&quot;"));
    assert.ok(g.text!.maxWidthMm <= g.widthMm - g.settings.safeMarginMm * 2);
    if (placement === "top-center")
      assert.ok(Math.min(...g.circles.map((c) => c.y - c.r)) > g.text!.y);
    else
      assert.ok(
        Math.max(...g.circles.map((c) => c.y + c.r)) <
          g.text!.y - g.text!.sizeMm,
      );
  }
});

test("invalid pixels, parameters and SVG colour injection are rejected", () => {
  assert.throws(
    () =>
      renderImage(
        { width: 2, height: 2, data: new Uint8ClampedArray(3) },
        settings(),
      ),
    /RGBA/,
  );
  for (const patch of [
    { spacingMm: NaN },
    { widthMm: Infinity },
    { minDiameterMm: 9, maxDiameterMm: 1 },
    { inkColor: 'red" onload="alert(1)' },
    { safeMarginMm: 70 },
  ]) {
    assert.throws(() => renderImage(image(), settings(patch)));
  }
  assert.throws(() =>
    normalizeSettings(settings({ palette: ["#ffffff", "url(evil)"] })),
  );
  const g = renderImage(image(), settings());
  assert.throws(
    () => toSvg(g, "finished", { background: 'red" onload="alert(1)' }),
    /colour/,
  );
});

test("palette mosaics produce bounded numbered cells and escaped template labels", () => {
  const g = renderImage(
    image(100, 100, (x) => (x < 0.5 ? [20, 20, 20, 255] : [180, 80, 60, 255])),
    settings({
      mode: "mosaic",
      palette: ["#141414", "#b4503c"],
      cellShape: "hexagon",
    }),
  );
  assert.ok(g.cells.length > 0);
  assert.deepEqual([...new Set(g.cells.map((c) => c.label))].sort(), [
    "1",
    "2",
  ]);
  assert.ok(g.cells.every((c) => c.points?.length === 6));
  const svg = toSvg(g, "template");
  assert.match(svg, /<polygon/);
  assert.match(svg, /data-lettering="outlines" aria-label="1"/);
  assert.ok(!svg.includes("<text"));
  assert.ok(g.warnings.some((w) => w.includes("colour key")));
});

test("contours join and simplify boundaries into traceable finite paths", () => {
  const g = renderImage(
    image(120, 120, (x, y) => (Math.hypot(x - 0.5, y - 0.5) < 0.32 ? 20 : 245)),
    settings({ mode: "contour" }),
  );
  assert.ok(g.paths.length >= 1 && g.paths.length <= 4);
  for (const path of g.paths) {
    assert.ok(path.points.length > 5 && path.points.length < 100);
    assert.ok(
      path.points.every(
        (p) =>
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          p.x >= g.settings.safeMarginMm &&
          p.y >= g.settings.safeMarginMm,
      ),
    );
  }
  assert.ok(g.warnings.some((w) => w.includes("without face segmentation")));
});

test("inversion maps bright source regions to light marks and carries the production warning", () => {
  const g = renderImage(
    image(80, 100, () => 255),
    settings({ invert: true }),
  );
  assert.ok(g.circles.length > 0);
  assert.equal(g.settings.inkColor, "#f4efe6");
  assert.ok(g.warnings.some((w) => w.includes("dark canvas")));
});

test("Line Amplification export outlines fillable strips and requires a ruler", () => {
  const g = renderImage(image(), settings({ mode: "line-amplification" }));
  assert.ok(g.cells.length > 0);
  assert.ok(g.cells.every((c) => c.width > c.height));
  assert.ok(toSvg(g, "template").includes('fill="none"'));
  assert.ok(g.warnings.some((w) => w.includes("ruler")));
});

test("personalisation uses shared licensed vector paths with exact glyph metrics", () => {
  for (const fontFamily of ["serif", "sans-serif"] as const) {
    const g = renderImage(
      image(),
      settings({
        text: {
          value: "Zoë · Élodie — Łukasz & Dvořák ’26 £€",
          fontFamily,
          sizeMm: 12,
        },
      }),
    );
    assert.equal(g.text!.fontVersion, FONT_OUTLINE_VERSION);
    const finished = toSvg(g, "finished"),
      template = toSvg(g, "template");
    assert.ok(!finished.includes("<text"));
    assert.ok(!template.includes("font-family="));
    const geometryPaths = /<g data-lettering="outlines"[\s\S]*?<\/g>/;
    const a = finished
      .match(geometryPaths)![0]
      .replace(/ opacity="[^"]+"/g, "");
    const b = template
      .match(geometryPaths)![0]
      .replace(/ opacity="[^"]+"/g, "");
    assert.equal(
      a,
      b,
      "Only ink opacity changes between finished and template lettering",
    );
    assert.equal(toSvg(JSON.parse(JSON.stringify(g)), "finished"), finished);
    assert.deepEqual(
      outlineLettering(g.text!),
      outlineLettering(JSON.parse(JSON.stringify(g.text!))),
    );
    assert.ok(
      measureLettering("iiii", fontFamily).width <
        measureLettering("MMMM", fontFamily).width / 2,
    );
    assert.ok(
      measureLettering("AV", fontFamily).advance <
        measureLettering("A", fontFamily).advance +
          measureLettering("V", fontFamily).advance,
      "Font pair kerning is retained",
    );
  }
});

test("long accented lettering stays inside safe bounds at every anchor and baseline", () => {
  const value =
    "Élève Àngela — François, Zoë & Łukasz · Dvořák 2026 / Æ Ø Œ ß £ € ";
  for (const fontFamily of ["serif", "sans-serif"] as const)
    for (const placement of [
      "top-center",
      "bottom-center",
      "bottom-left",
      "bottom-right",
    ] as const) {
      const g = renderImage(
        image(),
        settings({ text: { value, fontFamily, placement, sizeMm: 18 } }),
      );
      const { bounds } = outlineLettering(g.text!);
      const margin = g.settings.safeMarginMm;
      assert.ok(bounds.x >= margin - 0.0001);
      assert.ok(bounds.x + bounds.width <= g.widthMm - margin + 0.0001);
      assert.ok(bounds.y >= margin - 0.0001);
      assert.ok(bounds.y + bounds.height <= g.heightMm - margin + 0.0001);
    }
});

test("canonically equivalent accents create identical geometry and unsupported scripts fail explicitly", () => {
  const a = renderImage(image(), settings({ text: { value: "Café Zoë" } }));
  const b = renderImage(
    image(),
    settings({ text: { value: "Cafe\u0301 Zoe\u0308" } }),
  );
  assert.deepEqual(a, b);
  for (const value of [
    "Hello 🐕",
    "مرحبا",
    "你好",
    "Добрый день",
    "abc\u200d",
  ]) {
    assert.throws(
      () => renderImage(image(), settings({ text: { value } })),
      /Unsupported character/,
    );
  }
  const stale = { ...a.text!, fontVersion: "srs-outlines/999.0.0" };
  assert.throws(() => outlineLettering(stale), /different font revision/);
});

test(
  "browser and server rasterizers preserve the same outlined lettering footprint",
  { skip: process.env.RENDERER_BROWSER_QA !== "1" },
  async () => {
    const { chromium } = await import("@playwright/test");
    const sharp = (await import("sharp")).default;
    const browser = await chromium.launch({
      headless: true,
      channel: "msedge",
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 900, height: 1200 },
        deviceScaleFactor: 1,
      });
      for (const fontFamily of ["serif", "sans-serif"] as const) {
        const g = renderImage(
          image(1, 1, () => 255),
          settings({
            text: {
              value: "Élodie & Łukasz — 2026 £€",
              fontFamily,
              sizeMm: 12,
              placement: "top-center",
            },
          }),
        );
        const svg = toSvg(g, "finished", { background: "#ffffff" });
        // Match the production PNG pipeline: rasterize vectors directly at the
        // desired pixels, never enlarge a low-DPI intermediate raster.
        const rasterSvg = svg.replace(
          `width="${g.widthMm}mm" height="${g.heightMm}mm"`,
          'width="900px" height="1200px"',
        );
        const server = await sharp(Buffer.from(rasterSvg))
          .removeAlpha()
          .raw()
          .toBuffer();
        await page.setContent(
          `<body style="margin:0"><img id="art" width="900" height="1200" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"/></body>`,
        );
        await page
          .locator("#art")
          .evaluate((img: HTMLImageElement) => img.decode());
        const screenshot = await page.locator("#art").screenshot();
        const client = await sharp(screenshot).removeAlpha().raw().toBuffer();
        let intersection = 0,
          union = 0;
        for (let i = 0; i < client.length; i += 3) {
          const a = client[i] < 128,
            b = server[i] < 128;
          if (a && b) intersection++;
          if (a || b) union++;
        }
        const overlap = intersection / union;
        assert.ok(
          overlap > 0.93,
          `${fontFamily}: browser/server dark-pixel mask overlap ${overlap}; antialiasing may differ, glyph geometry must agree`,
        );
        console.log(
          `${fontFamily} outlined lettering raster-mask overlap: ${(overlap * 100).toFixed(2)}%`,
        );
      }
    } finally {
      await browser.close();
    }
  },
);
