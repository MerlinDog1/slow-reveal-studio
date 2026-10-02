import { type RenderGeometry } from "./renderers";
import { measureLettering } from "./renderers/fonts";

export function makingPlan(g: RenderGeometry, columns = 4, rows = 4) {
  const regions = Array.from({ length: columns * rows }, (_, index) => ({
    id: `${(index % columns) + 1}-${Math.floor(index / columns) + 1}`,
    x: ((index % columns) * g.widthMm) / columns,
    y: (Math.floor(index / columns) * g.heightMm) / rows,
    width: g.widthMm / columns,
    height: g.heightMm / rows,
    marks: 0,
    colours: new Set<string>(),
  }));
  const add = (x: number, y: number, colour?: string) => {
    const col = Math.min(
        columns - 1,
        Math.max(0, Math.floor((x / g.widthMm) * columns)),
      ),
      row = Math.min(
        rows - 1,
        Math.max(0, Math.floor((y / g.heightMm) * rows)),
      );
    const area = regions[row * columns + col];
    area.marks++;
    if (colour) area.colours.add(colour);
  };
  g.circles.forEach((c) => add(c.x, c.y, g.settings.inkColor));
  g.cells.forEach((c) => {
    if (g.mode === "cross-stitch" && c.label === "0") return;
    add(c.x + c.width / 2, c.y + c.height / 2, c.color ?? g.settings.inkColor);
  });
  g.paths.forEach((p) => {
    if (p.points.length) add(p.points[0].x, p.points[0].y, g.settings.inkColor);
  });
  let smallestLabelMm = Infinity,
    smallLabels = 0;
  for (const cell of g.cells)
    if (cell.label) {
      const m = measureLettering(cell.label, "sans-serif"),
        nominal = Math.min(
          1.8,
          cell.height * (g.mode === "cross-stitch" ? 0.28 : 0.5),
        );
      const size = Math.min(nominal, (cell.width * 0.75) / (m.width / m.units));
      const capHeight = (size * (m.maxY - m.minY)) / m.units;
      smallestLabelMm = Math.min(smallestLabelMm, capHeight);
      if (capHeight < 1.2) smallLabels++;
    }
  return {
    regions: regions.map((r) => ({ ...r, colours: [...r.colours] })),
    smallestLabelMm: Number.isFinite(smallestLabelMm) ? smallestLabelMm : null,
    smallLabels,
  };
}
