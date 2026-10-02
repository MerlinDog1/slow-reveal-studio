import { toSvg, type RenderGeometry } from "./renderers";
import { escapeXml } from "./renderers/svg";

/** A4 sample, cropped at 1:1 from the saved mm geometry, with a physical ruler and practice marks. */
export function sampleSheetSvg(
  g: RenderGeometry,
  center = { x: g.widthMm / 2, y: g.heightMm / 2 },
) {
  const width = Math.min(180, g.widthMm),
    height = Math.min(195, g.heightMm);
  const x = Math.max(0, Math.min(g.widthMm - width, center.x - width / 2)),
    y = Math.max(0, Math.min(g.heightMm - height, center.y - height / 2));
  const intersects = (cx: number, cy: number, w: number, h: number) =>
    cx + w >= x && cy + h >= y && cx <= x + width && cy <= y + height;
  const subset = {
    ...g,
    circles: g.circles.filter((c) =>
      intersects(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2),
    ),
    cells: g.cells.filter((c) => intersects(c.x, c.y, c.width, c.height)),
    paths: g.paths.filter((p) =>
      p.points.some((point) => intersects(point.x, point.y, 0, 0)),
    ),
    text: undefined,
  };
  const template = toSvg(subset, "template", { background: false })
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");
  const palette = g.settings.palette ?? [g.settings.inkColor];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"><rect width="210" height="297" fill="#fff"/><style>text{font-family:Arial,sans-serif;fill:#202020;font-size:3.2px}</style><text x="15" y="13" style="font-size:5px">Your actual-size making sample</text><text x="15" y="21">${escapeXml(g.mode)} · ${g.widthMm} × ${g.heightMm} mm canvas · crop ${Math.round(x)}, ${Math.round(y)} mm</text><text x="15" y="27">Print at 100% / Actual size. This is a trial sheet, not print approval.</text><defs><clipPath id="sample"><rect x="15" y="35" width="${width}" height="${height}"/></clipPath></defs><g clip-path="url(#sample)"><g transform="translate(${15 - x} ${35 - y})">${template}</g></g><rect x="15" y="35" width="${width}" height="${height}" fill="none" stroke="#aaa" stroke-width="0.15"/><text x="15" y="240">Practice first: fill the rings, let them dry, then check coverage.</text>${palette
    .slice(0, 32)
    .map(
      (colour, i) =>
        `<circle cx="${20 + (i % 16) * 11}" cy="${249 + Math.floor(i / 16) * 12}" r="2.2" fill="none" stroke="#888" stroke-width="0.15"/><text x="${18 + (i % 16) * 11}" y="${256 + Math.floor(i / 16) * 12}">${i + 1}</text><rect x="${23 + (i % 16) * 11}" y="${247 + Math.floor(i / 16) * 12}" width="2" height="4" fill="${colour}"/>`,
    )
    .join(
      "",
    )}<path d="M15 280H115 M15 277V283 M115 277V283" fill="none" stroke="#222" stroke-width="0.3"/><text x="40" y="288">This line must measure 100 mm</text></svg>`;
}
