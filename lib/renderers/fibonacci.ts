import type { ModeContext } from "./modes";
import { clamp, round, type Circle, type Point, type Cell } from "./types";
import {
  COLOUR_WEIGHTS,
  linearChannel,
  sampleOpticalColour,
  colourCandidates,
} from "./optical";

/** Sunflower phyllotaxis: equal-area radial growth and golden-angle rotation.
 * The pattern is fixed in millimetres; the photograph changes dot area only. */
function fibonacciSites(c: ModeContext): Point[] {
  const { bounds: b, pitch, maxDiameter } = c;
  const cx = b.x + b.width * (c.settings.spiralX ?? 0.5),
    cy = b.y + b.height * (c.settings.spiralY ?? 0.5);
  const halfWidth = (b.width - maxDiameter) / 2,
    halfHeight = (b.height - maxDiameter) / 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const radialScale = pitch * 0.62;
  const count = Math.ceil(
    ((halfWidth + Math.abs(cx - b.x - b.width / 2)) ** 2 +
      (halfHeight + Math.abs(cy - b.y - b.height / 2)) ** 2) /
      radialScale ** 2,
  );
  const sites: Point[] = [];
  // Keep candidate spacing independent of tone, including at the spiral's core.
  const buckets = new Map<number, Point[]>();
  const columns = Math.ceil(b.width / pitch) + 2;
  for (let i = 0; i < count; i++) {
    const radius = radialScale * Math.sqrt(i + 0.5);
    const angle =
      i * goldenAngle + ((c.settings.spiralRotation ?? 0) * Math.PI) / 180;
    const dx = radius * Math.cos(angle),
      dy = radius * Math.sin(angle);
    const x = cx + dx,
      y = cy + dy;
    if (
      Math.abs(x - b.x - b.width / 2) > halfWidth + 1e-10 ||
      Math.abs(y - b.y - b.height / 2) > halfHeight + 1e-10
    )
      continue;
    const gx = Math.floor((x - b.x) / pitch),
      gy = Math.floor((y - b.y) / pitch);
    let clear = true;
    for (let yy = Math.max(0, gy - 1); yy <= gy + 1 && clear; yy++)
      for (let xx = Math.max(0, gx - 1); xx <= gx + 1 && clear; xx++)
        for (const other of buckets.get(yy * columns + xx) ?? [])
          if ((other.x - x) ** 2 + (other.y - y) ** 2 < pitch ** 2) {
            clear = false;
            break;
          }
    if (!clear) continue;
    const key = gy * columns + gx;
    const bucket = buckets.get(key) ?? [];
    bucket.push({ x, y });
    buckets.set(key, bucket);
    sites.push({ x, y });
  }
  return sites;
}

export function renderFibonacci(c: ModeContext): Circle[] {
  const { bounds: b, settings: s, tone, pitch, maxDiameter } = c;
  const ru = (pitch * 0.22) / b.width,
    rv = (pitch * 0.22) / b.height;
  const circles: Circle[] = [];
  for (const { x, y } of fibonacciSites(c)) {
    const u = (x - b.x) / b.width,
      v = (y - b.y) / b.height;
    const local = tone.sample(u, v, ru, rv);
    const darkness = clamp(
      local + (local - tone.sample(u, v, ru * 3, rv * 3)) * s.edgeEmphasis,
    );
    if (darkness <= s.threshold) continue;
    const diameter =
      maxDiameter * Math.sqrt((darkness - s.threshold) / (1 - s.threshold));
    // Omit sub-minimum highlights instead of randomly thinning the spiral.
    if (diameter + 1e-9 < s.minDiameterMm) continue;
    circles.push({
      x: round(x),
      y: round(y),
      r: round(Math.max(s.minDiameterMm, diameter) / 2),
    });
  }
  return circles;
}

/** Diffuse quantization error to nearby, unvisited sunflower sites. Each dot
 * uses one saved pen colour; paper remains a separate unnumbered candidate. */
export function renderFibonacciColour(c: ModeContext): Cell[] {
  const { settings: s, bounds: b, pitch, maxDiameter } = c;
  const sites = fibonacciSites(c);
  const palette = s.palette!;
  const coverage = (maxDiameter / 2) ** 2 / (pitch * 0.62) ** 2;
  const candidates = colourCandidates(palette, coverage, s.colourCompensation);
  const columns = Math.ceil(b.width / pitch) + 3;
  const buckets = new Map<number, number[]>();
  sites.forEach(({ x, y }, index) => {
    const key =
      Math.floor((y - b.y) / pitch) * columns + Math.floor((x - b.x) / pitch);
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });
  const errors = new Float64Array(sites.length * 3);
  const cells: Cell[] = [];
  sites.forEach(({ x, y }, index) => {
    const rgb = sampleOpticalColour(
      c,
      x,
      y,
      (pitch * 0.45) / b.width,
      (pitch * 0.45) / b.height,
    );
    if (rgb.every((value) => value >= 1 - s.threshold)) return;
    const target = rgb.map((value, channel) =>
      clamp(linearChannel(value) + errors[index * 3 + channel]),
    );
    let selected = 0,
      best = Infinity;
    candidates.forEach((candidate, pen) => {
      const distance = candidate.reduce(
        (sum, value, channel) =>
          sum + COLOUR_WEIGHTS[channel] * (target[channel] - value) ** 2,
        0,
      );
      if (distance < best) {
        best = distance;
        selected = pen;
      }
    });
    const gx = Math.floor((x - b.x) / pitch),
      gy = Math.floor((y - b.y) / pitch);
    const neighbours: { index: number; distance: number }[] = [];
    for (let yy = Math.max(0, gy - 2); yy <= gy + 2; yy++)
      for (let xx = Math.max(0, gx - 2); xx <= gx + 2; xx++)
        for (const next of buckets.get(yy * columns + xx) ?? []) {
          if (next <= index) continue;
          const distance = (sites[next].x - x) ** 2 + (sites[next].y - y) ** 2;
          if (distance <= (pitch * 2.2) ** 2)
            neighbours.push({ index: next, distance });
        }
    const nearest = neighbours
      .sort((a, b) => a.distance - b.distance || a.index - b.index)
      .slice(0, 4);
    const weight = nearest.reduce((sum, next) => sum + 1 / next.distance, 0);
    for (const next of nearest)
      for (let channel = 0; channel < 3; channel++)
        errors[next.index * 3 + channel] +=
          (target[channel] - candidates[selected][channel]) /
          next.distance /
          weight;
    if (selected)
      cells.push({
        x: round(x - maxDiameter / 2),
        y: round(y - maxDiameter / 2),
        width: round(maxDiameter),
        height: round(maxDiameter),
        radius: round(maxDiameter / 2),
        color: palette[selected - 1],
        label: String(selected),
      });
  });
  return cells;
}
