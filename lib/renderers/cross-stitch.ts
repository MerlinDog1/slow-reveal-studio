import type { ModeContext } from "./modes";
import { COLOUR_WEIGHTS, linearChannel, sampleOpticalColour } from "./optical";
import { clamp, round, type Cell } from "./types";

/** Every site exists in the guide, including paper key 0. Only its assignment depends on the photo. */
export function renderCrossStitch(c: ModeContext): Cell[] {
  const { settings: s, bounds: b, pitch, maxDiameter: size } = c;
  const columns = Math.max(1, Math.floor((b.width - size) / pitch) + 1);
  const rows = Math.max(1, Math.floor((b.height - size) / pitch) + 1);
  const x0 = b.x + (b.width - (columns - 1) * pitch) / 2;
  const y0 = b.y + (b.height - (rows - 1) * pitch) / 2;
  const palette = s.palette!;
  const candidates = [
    [1, 1, 1],
    ...palette.map((hex) =>
      [1, 3, 5].map((at) =>
        linearChannel(parseInt(hex.slice(at, at + 2), 16) / 255),
      ),
    ),
  ];
  // A rotated plus is the union of two equal diagonal strokes, expressed as one closed polygon.
  const halfStroke = size * 0.14;
  const extent = size / Math.SQRT2 - halfStroke;
  const shape = [
    [-halfStroke, -extent],
    [halfStroke, -extent],
    [halfStroke, -halfStroke],
    [extent, -halfStroke],
    [extent, halfStroke],
    [halfStroke, halfStroke],
    [halfStroke, extent],
    [-halfStroke, extent],
    [-halfStroke, halfStroke],
    [-extent, halfStroke],
    [-extent, -halfStroke],
    [-halfStroke, -halfStroke],
  ];
  let current = new Float64Array((columns + 2) * 3);
  let next = new Float64Array(current.length);
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    const direction = row % 2 ? -1 : 1;
    for (let step = 0; step < columns; step++) {
      const column = direction === 1 ? step : columns - 1 - step;
      const x = x0 + column * pitch,
        y = y0 + row * pitch;
      const rgb = sampleOpticalColour(
        c,
        x,
        y,
        (pitch * 0.45) / b.width,
        (pitch * 0.45) / b.height,
      );
      const at = (column + 1) * 3;
      let selected = 0;
      // White and transparent source stay blank, without changing the guide's lattice.
      if (!rgb.every((channel) => channel >= 1 - s.threshold)) {
        const target = rgb.map((channel, i) =>
          clamp(linearChannel(channel) + current[at + i]),
        );
        let best = Infinity;
        candidates.forEach((candidate, index) => {
          const distance = candidate.reduce(
            (sum, channel, i) =>
              sum + COLOUR_WEIGHTS[i] * (target[i] - channel) ** 2,
            0,
          );
          if (distance < best) {
            best = distance;
            selected = index;
          }
        });
        const forward = column + direction;
        const hasForward = forward >= 0 && forward < columns;
        const hasBelow = row + 1 < rows;
        const total = (hasForward ? 1 : 0) + (hasBelow ? 1 : 0);
        for (let channel = 0; channel < 3 && total; channel++) {
          const error =
            (target[channel] - candidates[selected][channel]) / total;
          if (hasForward) current[(forward + 1) * 3 + channel] += error;
          if (hasBelow) next[at + channel] += error;
        }
      }
      cells.push({
        x: round(x - size / 2),
        y: round(y - size / 2),
        width: round(size),
        height: round(size),
        points: shape.map(([u, v]) => ({
          x: round(x + (u - v) / Math.SQRT2),
          y: round(y + (u + v) / Math.SQRT2),
        })),
        color: selected ? palette[selected - 1] : "#ffffff",
        label: String(selected),
      });
    }
    [current, next] = [next, current];
    next.fill(0);
  }
  return cells;
}
