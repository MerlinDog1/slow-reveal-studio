import { effectiveGuideColor, effectiveGuideWidthMm } from "./renderers/svg";
import { outlineLettering, measureLettering } from "./renderers/fonts";
import {
  usesOpticalColour,
  type RenderGeometry,
  type TextGeometry,
} from "./renderers/types";

export type DrawingOptions = {
  variant?: "finished" | "template";
  pixelsPerMm?: number;
  bounds?: { x: number; y: number; width: number; height: number };
  colour?: string;
  progress?: number;
  safeArea?: boolean;
};
const paths = new Map<string, Path2D>();
function glyphPath(d: string) {
  let path = paths.get(d);
  if (!path) {
    path = new Path2D(d);
    paths.set(d, path);
  }
  return path;
}
function lettering(ctx: CanvasRenderingContext2D, text: TextGeometry) {
  const shape = outlineLettering(text);
  ctx.save();
  ctx.translate(shape.x, shape.y);
  ctx.scale(shape.scale, shape.scale);
  for (const glyph of shape.glyphs) {
    ctx.save();
    ctx.translate(glyph.x, 0);
    ctx.fill(glyphPath(glyph.d));
    ctx.restore();
  }
  ctx.restore();
}

/** Fast viewport drawing of the authoritative mm geometry; exports remain outlined SVG. */
export function drawArtwork(
  ctx: CanvasRenderingContext2D,
  g: RenderGeometry,
  options: DrawingOptions = {},
) {
  const s = g.settings,
    finished = options.variant !== "template",
    guide = effectiveGuideWidthMm(s);
  const ink = finished ? s.inkColor : effectiveGuideColor(s);
  ctx.fillStyle =
    usesOpticalColour(s) && !g.circles.length
      ? "#ffffff"
      : s.invert
        ? "#1e1e1c"
        : "#f8f5ef";
  ctx.fillRect(0, 0, g.widthMm, g.heightMm);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = guide;
  const visible = (x: number, y: number, w: number, h: number) => {
    const b = options.bounds;
    return (
      !b ||
      (x <= b.x + b.width &&
        y <= b.y + b.height &&
        x + w >= b.x &&
        y + h >= b.y)
    );
  };
  const limit = Math.ceil((options.progress ?? 1) * g.stats.markCount);
  let index = 0;
  for (const c of g.circles) {
    if (index++ >= limit) break;
    if (!visible(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2)) continue;
    ctx.globalAlpha = finished ? 1 : s.guideOpacity;
    ctx.beginPath();
    ctx.arc(
      c.x,
      c.y,
      finished ? c.r : Math.max(0.01, c.r - guide / 2),
      0,
      Math.PI * 2,
    );
    if (finished) ctx.fill();
    else ctx.stroke();
  }
  for (const c of g.cells) {
    if (index++ >= limit) break;
    if (!visible(c.x, c.y, c.width, c.height)) continue;
    ctx.globalAlpha =
      (options.colour && c.color !== options.colour ? 0.09 : 1) *
      (finished ? 1 : s.guideOpacity);
    ctx.fillStyle = finished ? (c.color ?? ink) : ink;
    ctx.beginPath();
    if (c.points) {
      const scale = finished
        ? 1
        : Math.max(0.1, 1 - guide / (Math.min(c.width, c.height) * 0.85));
      c.points.forEach((p, i) => {
        const x = c.x + c.width / 2 + (p.x - c.x - c.width / 2) * scale,
          y = c.y + c.height / 2 + (p.y - c.y - c.height / 2) * scale;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
    } else {
      const inset = finished ? 0 : guide / 2;
      ctx.roundRect(
        c.x + inset,
        c.y + inset,
        Math.max(0.01, c.width - inset * 2),
        Math.max(0.01, c.height - inset * 2),
        Math.max(0, (c.radius ?? 0) - inset),
      );
    }
    if (finished) ctx.fill();
    else ctx.stroke();
    const size = Math.min(1.8, c.height * 0.5);
    if (!finished && c.label && size * (options.pixelsPerMm ?? 1) >= 7) {
      const m = measureLettering(c.label, "sans-serif");
      lettering(ctx, {
        value: c.label,
        x: c.x + c.width / 2,
        y: c.y + c.height / 2 - (((m.minY + m.maxY) / 2) * size) / m.units,
        sizeMm: size,
        fontFamily: "sans-serif",
        anchor: "middle",
        maxWidthMm: c.width * 0.75,
      });
    }
  }
  ctx.globalAlpha = finished ? 1 : s.guideOpacity;
  ctx.fillStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of g.paths) {
    if (index++ >= limit) break;
    ctx.beginPath();
    p.points.forEach((point, i) =>
      i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
    );
    ctx.lineWidth = finished ? p.width : Math.min(p.width, guide);
    ctx.stroke();
  }
  if (g.text) lettering(ctx, g.text);
  ctx.globalAlpha = 1;
  if (options.safeArea) {
    ctx.strokeStyle = "#9c7454";
    ctx.lineWidth = 0.3;
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(
      s.safeMarginMm,
      s.safeMarginMm,
      g.widthMm - 2 * s.safeMarginMm,
      g.heightMm - 2 * s.safeMarginMm,
    );
    ctx.setLineDash([]);
  }
}
