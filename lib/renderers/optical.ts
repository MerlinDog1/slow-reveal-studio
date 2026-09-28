import type { ModeContext } from "./modes";
import { clamp, round, type Cell } from "./types";

export const TV_COLUMN_RATIO = 0.65;
const WEIGHTS = [0.2126, 0.7152, 0.0722];
const linear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
export { linear as linearChannel, WEIGHTS as COLOUR_WEIGHTS };

/** Shared exposure/tonal adjustment for numbered spatial-colour modes. */
export function sampleOpticalColour(
  c: ModeContext,
  x: number,
  y: number,
  ru: number,
  rv: number,
): number[] {
  const { settings: s, bounds: b, tone } = c;
  const u = (x - b.x) / b.width,
    v = (y - b.y) / b.height;
  const local = tone.sample(u, v, ru, rv);
  const edge = (local - tone.sample(u, v, ru * 3, rv * 3)) * s.edgeEmphasis;
  return tone
    .color(u, v, ru * 2, rv * 2)
    .map((value) =>
      clamp(
        Math.pow(
          clamp(
            ((value / 255) * tone.exposureScale - 0.5) * s.contrast +
              0.5 +
              s.brightness,
          ),
          1 / s.gamma,
        ) - edge,
      ),
    );
}

/** Serpentine diffusion along staggered neighbours in linear RGB. Every mark uses one pen;
 * paper is a separate unmarked candidate, never another numbered colour.
 * This models spatial colour averaging, not pigment mixing or calibrated ink. */
export function renderOptical(c: ModeContext): Cell[] {
  const { settings: s, bounds: b, pitch, maxDiameter, tone } = c;
  const weave = s.mode === "tv-weave";
  const dx = weave
    ? Math.max(s.minDiameterMm + 0.251, pitch * TV_COLUMN_RATIO)
    : pitch;
  const markWidth = weave
    ? Math.min(dx - 0.251, Math.max(s.minDiameterMm, maxDiameter * 0.55))
    : maxDiameter;
  const markHeight = maxDiameter;
  const baseCols = Math.max(1, Math.floor((b.width - markWidth) / dx) + 1);
  // Circles form a hexagonal lattice. Capsules keep their vertical clearance;
  // a single column stays straight and uses full pitch to avoid touching circles.
  const stagger = baseCols > 1;
  const dy = !weave && stagger ? (pitch * Math.sqrt(3)) / 2 : pitch;
  const rows = Math.max(1, Math.floor((b.height - markHeight) / dy) + 1);
  const x0 = b.x + (b.width - (baseCols - 1) * dx) / 2;
  const y0 = b.y + (b.height - (rows - 1) * dy) / 2;
  const palette = s.palette!;
  const candidates = [
    [1, 1, 1],
    ...palette.map((hex) =>
      [1, 3, 5].map((at) => linear(parseInt(hex.slice(at, at + 2), 16) / 255)),
    ),
  ];
  let current = new Float64Array((baseCols + 2) * 3);
  let next = new Float64Array(current.length);
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    const direction = row % 2 ? -1 : 1;
    const shifted = stagger && row % 2 === 1;
    const cols = baseCols - (shifted ? 1 : 0);
    const nextCols =
      row + 1 < rows ? baseCols - (stagger && !shifted ? 1 : 0) : 0;
    for (let step = 0; step < cols; step++) {
      const col = direction === 1 ? step : cols - 1 - step;
      const x = x0 + (col + (shifted ? 0.5 : 0)) * dx,
        y = y0 + row * dy;
      const ru = (dx * 0.45) / b.width,
        rv = (dy * 0.45) / b.height;
      const rgb = sampleOpticalColour(c, x, y, ru, rv);
      // Preserve blank highlights instead of carrying neighbouring quantization noise into them.
      if (rgb.every((value) => value >= 1 - s.threshold)) continue;
      const at = (col + 1) * 3;
      const target = rgb.map((value, channel) =>
        clamp(linear(value) + current[at + channel]),
      );
      let selected = 0,
        best = Infinity;
      candidates.forEach((candidate, index) => {
        const distance = candidate.reduce(
          (sum, value, channel) =>
            sum + WEIGHTS[channel] * (target[channel] - value) ** 2,
          0,
        );
        if (distance < best) {
          best = distance;
          selected = index;
        }
      });
      // Half goes forward, a quarter to each closest next-row neighbour.
      // At the edges, redistribute only to real, unvisited sites. The shorter
      // shifted rows must not collect error in a nonexistent last column.
      const forward = col + direction;
      const hasForward = forward >= 0 && forward < cols;
      const belowLeft = stagger ? col + (shifted ? 0 : -1) : col;
      const belowRight = belowLeft + 1;
      const hasLeft = belowLeft >= 0 && belowLeft < nextCols;
      const hasRight = stagger && belowRight < nextCols;
      const belowWeight = stagger ? 1 : 2;
      const weight =
        (hasForward ? 2 : 0) + (hasLeft ? belowWeight : 0) + (hasRight ? 1 : 0);
      for (let channel = 0; channel < 3 && weight; channel++) {
        const error = target[channel] - candidates[selected][channel];
        if (hasForward)
          current[(forward + 1) * 3 + channel] += (error * 2) / weight;
        if (hasLeft)
          next[(belowLeft + 1) * 3 + channel] += (error * belowWeight) / weight;
        if (hasRight) next[(belowRight + 1) * 3 + channel] += error / weight;
      }
      if (selected)
        cells.push({
          x: round(x - markWidth / 2),
          y: round(y - markHeight / 2),
          width: round(markWidth),
          height: round(markHeight),
          radius: round(markWidth / 2),
          color: palette[selected - 1],
          label: String(selected),
        });
    }
    [current, next] = [next, current];
    next.fill(0);
  }
  return cells;
}
