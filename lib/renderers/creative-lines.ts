import type { ModeContext } from "./modes";
import { clamp, round, type Cell, type Point, MAX_MARKS } from "./types";

/** Closed, independent ribbon segments in mm. Guides follow exactly the same polygons. */
export function renderCreativeLines(c: ModeContext): Cell[] {
  const { bounds: b, settings: s, tone, pitch, maxDiameter } = c;
  const cells: Cell[] = [];
  const step = Math.max(0.8, pitch * 0.65);
  const inside = (p: Point) =>
    p.x >= b.x && p.y >= b.y && p.x <= b.x + b.width && p.y <= b.y + b.height;
  const ribbon = (a: Point, z: Point, gain = 1) => {
    if (cells.length >= MAX_MARKS) return;
    const dx = z.x - a.x,
      dy = z.y - a.y,
      length = Math.hypot(dx, dy);
    if (!length) return;
    const value = tone.sample(
      ((a.x + z.x) / 2 - b.x) / b.width,
      ((a.y + z.y) / 2 - b.y) / b.height,
      step / b.width / 3,
      step / b.height / 3,
    );
    if (value <= s.threshold) return;
    const width =
      maxDiameter *
      gain *
      Math.sqrt(clamp((value - s.threshold) / (1 - s.threshold)));
    if (width < s.minDiameterMm) return;
    const nx = ((-dy / length) * width) / 2,
      ny = ((dx / length) * width) / 2;
    const points = [
      { x: a.x + nx, y: a.y + ny },
      { x: z.x + nx, y: z.y + ny },
      { x: z.x - nx, y: z.y - ny },
      { x: a.x - nx, y: a.y - ny },
    ];
    if (!points.every(inside)) return;
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    cells.push({
      x: round(Math.min(...xs)),
      y: round(Math.min(...ys)),
      width: round(Math.max(...xs) - Math.min(...xs)),
      height: round(Math.max(...ys) - Math.min(...ys)),
      points: points.map((p) => ({ x: round(p.x), y: round(p.y) })),
    });
  };
  if (s.linePattern === "spiral") {
    const cx = b.x + b.width * (s.spiralX ?? 0.5),
      cy = b.y + b.height * (s.spiralY ?? 0.5);
    const k = pitch / (2 * Math.PI);
    const limit = Math.hypot(b.width, b.height);
    let t = 0,
      previous = { x: cx, y: cy };
    for (let i = 0; i < MAX_MARKS * 3 && k * t <= limit; i++) {
      t += Math.min(0.25, step / Math.max(step, k * t));
      const angle = t + ((s.spiralRotation ?? 0) * Math.PI) / 180;
      const next = {
        x: cx + k * t * Math.cos(angle),
        y: cy + k * t * Math.sin(angle),
      };
      ribbon(previous, next);
      previous = next;
    }
  } else if (s.linePattern === "crosshatch") {
    // Two angled families deliberately intersect: this is a layered engraving study.
    for (const sign of [-1, 1])
      for (
        let offset = -b.width;
        offset <= b.height + b.width;
        offset += pitch * 1.5
      ) {
        for (let x = 0; x < b.width; x += step) {
          ribbon(
            { x: b.x + x, y: b.y + offset + sign * x * 0.65 },
            {
              x: b.x + Math.min(b.width, x + step),
              y: b.y + offset + sign * Math.min(b.width, x + step) * 0.65,
            },
            0.48,
          );
        }
      }
  } else {
    // Common displacement gives parallel curves without neighbouring rows crossing.
    for (let row = 0; row < b.height; row += pitch) {
      let previous: Point | undefined;
      for (let x = 0; x <= b.width; x += step) {
        const u = x / b.width;
        const bend =
          Math.sin(u * Math.PI * 2) * Math.min(b.height * 0.045, pitch * 2.2);
        const p = { x: b.x + x, y: b.y + row + bend };
        if (previous) ribbon(previous, p);
        previous = p;
      }
    }
  }
  return cells;
}
