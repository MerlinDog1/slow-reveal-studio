import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  DEFAULT_SETTINGS,
  renderImage,
  toSvg,
  effectiveGuideColor,
  effectiveGuideWidthMm,
  round,
  type RenderGeometry,
} from "../lib/renderers";

function fixture() {
  const width = 120,
    height = 160;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const tone = x < 6 || y < 5 ? 255 : (x * 7 + y * 3) % 210;
      data.set([tone, tone, tone, 255], (y * width + x) * 4);
    }
  return renderImage(
    { data, width, height },
    {
      ...DEFAULT_SETTINGS,
      mode: "line-amplification",
      widthMm: width,
      heightMm: height,
      spacingMm: 3.3,
      minDiameterMm: 0.75,
      maxDiameterMm: 2.9,
      inkColor: "#233b56",
      guideColor: "#736258",
    },
  );
}

test("Line Study SVG uses independent closed rectangular curves at the exact strip positions", () => {
  const g = fixture();
  assert.ok(g.cells.length > 100);
  const frozen = JSON.stringify(g);
  for (const variant of ["template", "finished"] as const) {
    const svg = toSvg(g, variant, { background: false });
    assert.match(
      svg,
      /version="1.1" width="120mm" height="160mm" viewBox="0 0 120 160"/,
    );
    assert.doesNotMatch(
      svg,
      /<(?:rect|circle|polygon|g|use)\b|transform=|\brx=/,
    );
    const paths = [...svg.matchAll(/<path d="([^"]+)" ([^>]+)\/>/g)];
    assert.equal(paths.length, g.cells.length);
    const inset =
      variant === "finished" ? 0 : effectiveGuideWidthMm(g.settings) / 2;
    paths.forEach(([, d, style], index) => {
      const points = d.match(
        /^M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) Z$/,
      );
      assert.ok(
        points,
        "each mark has four absolute corners and its own closing command",
      );
      const [x, y, right, top, right2, bottom, left, bottom2] = points
        .slice(1)
        .map(Number);
      const cell = g.cells[index];
      assert.deepEqual(
        [x, y, right, bottom],
        [
          round(cell.x + inset),
          round(cell.y + inset),
          round(cell.x + cell.width - inset),
          round(cell.y + cell.height - inset),
        ],
      );
      assert.deepEqual([left, top, right2, bottom2], [x, y, right, bottom]);
      assert.ok(x >= 10 && y >= 10 && right <= 110.001 && bottom <= 150.001);
      assert.match(style, /stroke-width="0.15" stroke-linejoin="miter"/);
      assert.ok(
        style.includes(
          variant === "template"
            ? 'fill="none" stroke="#736258"'
            : 'fill="#233b56" stroke="none"',
        ),
      );
      assert.ok(
        style.includes(`opacity="${variant === "template" ? "0.3" : "1"}"`),
      );
    });
    assert.equal(
      toSvg(JSON.parse(frozen), variant, { background: false }),
      svg,
    );
  }
  assert.equal(
    JSON.stringify(g),
    frozen,
    "serialization never migrates saved geometry",
  );
});

// Independent representation of the prior SVG rectangles for appearance regression.
function rectangleReference(
  g: RenderGeometry,
  variant: "template" | "finished",
) {
  const finished = variant === "finished",
    s = g.settings;
  const stroke = effectiveGuideWidthMm(s),
    inset = finished ? 0 : stroke / 2;
  const ink = finished ? s.inkColor : effectiveGuideColor(s);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="160mm" viewBox="0 0 120 160"><g fill="${finished ? ink : "none"}" stroke="${finished ? "none" : ink}" stroke-width="${stroke}"${finished ? "" : ` opacity="${s.guideOpacity}"`}>${g.cells.map((cell) => `<rect x="${round(cell.x + inset)}" y="${round(cell.y + inset)}" width="${round(cell.width - inset * 2)}" height="${round(cell.height - inset * 2)}" rx="0"/>`).join("")}</g></svg>`;
}

test("Line Study curves preserve the old rectangle raster footprint in template and finished views", async () => {
  const g = fixture();
  const raster = async (svg: string) =>
    sharp(
      Buffer.from(
        svg.replace(
          'width="120mm" height="160mm"',
          'width="1200px" height="1600px"',
        ),
      ),
    )
      .ensureAlpha()
      .raw()
      .toBuffer();
  for (const variant of ["template", "finished"] as const) {
    const [before, after] = await Promise.all([
      raster(rectangleReference(g, variant)),
      raster(toSvg(g, variant, { background: false })),
    ]);
    assert.equal(before.length, after.length);
    let delta = 0;
    for (let i = 0; i < before.length; i++)
      delta += Math.abs(before[i] - after[i]);
    assert.ok(
      // Per-path opacity can change antialiasing where neighbouring edges meet.
      // Allow less than 0.04% of the 8-bit channel range, not a geometry shift.
      delta / before.length < 0.1,
      `mean channel difference ${delta / before.length}`,
    );
  }
});
