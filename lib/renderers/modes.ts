import { type ToneMap } from "./sampling";
import {
  clamp,
  round,
  type Cell,
  type Circle,
  type Point,
  type RenderSettings,
  type TracePath,
} from "./types";

export interface ArtBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ModeContext {
  tone: ToneMap;
  settings: RenderSettings;
  bounds: ArtBounds;
  pitch: number;
  maxDiameter: number;
}

/** Area averages preserve dark features; a wider neighbourhood restores local contrast. */
function darknessAt(c: ModeContext, x: number, y: number): number {
  const { tone, bounds: b, pitch, settings: s } = c;
  const u = (x - b.x) / b.width,
    v = (y - b.y) / b.height;
  const ru = (pitch * 0.3) / b.width,
    rv = (pitch * 0.3) / b.height;
  const local = tone.sample(u, v, ru, rv);
  const surround = tone.sample(u, v, ru * 3, rv * 3);
  return clamp(local + (local - surround) * s.edgeEmphasis);
}

export function renderDots(c: ModeContext): Circle[] {
  const { settings: s, bounds: b, pitch, maxDiameter } = c;
  const circles: Circle[] = [];
  const dy = (pitch * Math.sqrt(3)) / 2;
  const rows = Math.max(1, Math.floor((b.height - maxDiameter) / dy) + 1);
  const y0 = b.y + (b.height - (rows - 1) * dy) / 2;
  const baseCols = Math.max(1, Math.floor((b.width - maxDiameter) / pitch) + 1);
  const baseX = b.x + (b.width - (baseCols - 1) * pitch) / 2;
  // Fixed centres depend only on physical settings, never preview pixel dimensions.
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 && baseCols > 1 ? pitch / 2 : 0;
    const cols = offset ? baseCols - 1 : baseCols;
    const x0 = baseX + offset;
    for (let col = 0; col < cols; col++) {
      const x = x0 + col * pitch,
        y = y0 + row * dy;
      const value = darknessAt(c, x, y);
      if (value <= s.threshold) continue;
      // Area tracks tone. Highlights below the printable minimum use deterministic
      // sparse marks rather than oversize dots that muddy otherwise white detail.
      const areaDiameterSquared =
        (maxDiameter ** 2 * (value - s.threshold)) / (1 - s.threshold);
      const noise =
        (((Math.imul(row + 1, 73856093) ^ Math.imul(col + 1, 19349663)) >>> 0) %
          65536) /
        65536;
      if (
        areaDiameterSquared < s.minDiameterMm ** 2 &&
        noise > areaDiameterSquared / s.minDiameterMm ** 2
      )
        continue;
      const diameter = Math.sqrt(
        Math.max(s.minDiameterMm ** 2, areaDiameterSquared),
      );
      circles.push({ x: round(x), y: round(y), r: round(diameter / 2) });
    }
  }
  return circles;
}

function hexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function renderMosaic(c: ModeContext): Cell[] {
  const { settings: s, bounds: b, pitch, maxDiameter } = c;
  const cells: Cell[] = [];
  const hexagon = s.cellShape === "hexagon";
  const dy = hexagon ? (pitch * Math.sqrt(3)) / 2 : pitch;
  const rows = Math.max(1, Math.floor((b.height - maxDiameter) / dy) + 1);
  const baseCols = Math.max(1, Math.floor((b.width - maxDiameter) / pitch) + 1);
  const baseX = b.x + (b.width - (baseCols - 1) * pitch) / 2;
  const palette = s.palette?.map(hexRgb);
  for (let row = 0; row < rows; row++) {
    const offset = hexagon && row % 2 && baseCols > 1 ? pitch / 2 : 0;
    const cols = offset ? baseCols - 1 : baseCols;
    for (let col = 0; col < cols; col++) {
      const x = baseX + offset + col * pitch;
      const y = b.y + (b.height - (rows - 1) * dy) / 2 + row * dy;
      const darkness = darknessAt(c, x, y);
      if (darkness <= s.threshold) continue;
      let color: string | undefined, label: string | undefined;
      if (palette && s.palette) {
        const rgb = c.tone.color(
          (x - b.x) / b.width,
          (y - b.y) / b.height,
          pitch / b.width,
          pitch / b.height,
        );
        const weights = [0.299, 0.587, 0.114];
        const distance = (target: number[]) =>
          target.reduce((d, v, i) => d + weights[i] * (rgb[i] - v) ** 2, 0);
        let nearest = -1,
          best = distance([255, 255, 255]);
        palette.forEach((p, i) => {
          const d = distance(p);
          if (d < best) {
            best = d;
            nearest = i;
          }
        });
        if (nearest < 0) continue;
        color = s.palette[nearest];
        label = String(nearest + 1);
      }
      const size = palette
        ? maxDiameter
        : Math.sqrt(
            s.minDiameterMm ** 2 +
              ((maxDiameter ** 2 - s.minDiameterMm ** 2) *
                (darkness - s.threshold)) /
                (1 - s.threshold),
          );
      const cell: Cell = {
        x: round(x - size / 2),
        y: round(y - size / 2),
        width: round(size),
        height: round(size),
      };
      if (s.cellShape !== "square" && !hexagon)
        cell.radius = round(size * 0.12);
      if (hexagon) {
        cell.points = Array.from({ length: 6 }, (_, i) => ({
          x: round(x + (Math.cos(Math.PI * (i / 3 + 1 / 6)) * size) / 2),
          y: round(y + (Math.sin(Math.PI * (i / 3 + 1 / 6)) * size) / 2),
        }));
      }
      if (color) {
        cell.color = color;
        cell.label = label;
      }
      cells.push(cell);
    }
  }
  return cells;
}

function length(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  return total;
}

/** Iterative Douglas–Peucker avoids stack overflow on long contour components. */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const pending: [number, number][] = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    const a = points[start],
      b = points[end],
      dx = b.x - a.x,
      dy = b.y - a.y,
      d2 = dx * dx + dy * dy;
    let max = tolerance * tolerance,
      split = -1;
    for (let i = start + 1; i < end; i++) {
      const p = points[i],
        t = d2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / d2) : 0;
      const distance = (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
      if (distance > max) {
        max = distance;
        split = i;
      }
    }
    if (split >= 0) {
      keep[split] = 1;
      pending.push([start, split], [split, end]);
    }
  }
  return points
    .filter((_, i) => keep[i])
    .map((p) => ({ x: round(p.x), y: round(p.y) }));
}

/** Smoothed tonal boundaries joined into traceable paths, not isolated edge pixels. */
export function renderContours(c: ModeContext): TracePath[] {
  const { tone, settings: s, bounds: b, pitch } = c;
  const step = Math.max(0.8, pitch * 0.4, b.width / 280, b.height / 280);
  const nx = Math.max(2, Math.ceil(b.width / step)),
    ny = Math.max(2, Math.ceil(b.height / step));
  const dx = b.width / nx,
    dy = b.height / ny;
  const samples = new Float32Array((nx + 1) * (ny + 1));
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++)
      samples[y * (nx + 1) + x] = tone.sample(
        x / nx,
        y / ny,
        0.7 / nx,
        0.7 / ny,
      );
  const paths: TracePath[] = [];
  const levels = [
    clamp(0.3 + s.threshold * 0.35, 0.1, 0.85),
    clamp(0.64 + s.threshold * 0.2, 0.2, 0.94),
  ];
  for (const level of levels) {
    const nodes = new Map<string, Point>();
    const segments: [string, string][] = [];
    const adjacency = new Map<string, number[]>();
    const add = (a: string, ap: Point, z: string, zp: Point) => {
      const i = segments.length;
      nodes.set(a, ap);
      nodes.set(z, zp);
      segments.push([a, z]);
      adjacency.set(a, [...(adjacency.get(a) ?? []), i]);
      adjacency.set(z, [...(adjacency.get(z) ?? []), i]);
    };
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const v = [
          samples[y * (nx + 1) + x],
          samples[y * (nx + 1) + x + 1],
          samples[(y + 1) * (nx + 1) + x + 1],
          samples[(y + 1) * (nx + 1) + x],
        ];
        const mask = v.reduce((m, n, i) => m | (n >= level ? 1 << i : 0), 0);
        if (mask === 0 || mask === 15) continue;
        const corners: Point[] = [
          { x, y },
          { x: x + 1, y },
          { x: x + 1, y: y + 1 },
          { x, y: y + 1 },
        ];
        const keys = [
          `h:${x}:${y}`,
          `v:${x + 1}:${y}`,
          `h:${x}:${y + 1}`,
          `v:${x}:${y}`,
        ];
        const point = (edge: number) => {
          const next = (edge + 1) % 4,
            a = corners[edge],
            z = corners[next];
          const t = clamp((level - v[edge]) / (v[next] - v[edge] || 1));
          return {
            x: b.x + (a.x + (z.x - a.x) * t) * dx,
            y: b.y + (a.y + (z.y - a.y) * t) * dy,
          };
        };
        const pairs: Record<number, number[][]> = {
          1: [[3, 0]],
          2: [[0, 1]],
          3: [[3, 1]],
          4: [[1, 2]],
          6: [[0, 2]],
          7: [[3, 2]],
          8: [[2, 3]],
          9: [[2, 0]],
          11: [[2, 1]],
          12: [[1, 3]],
          13: [[1, 0]],
          14: [[0, 3]],
        };
        const centreHigh = v.reduce((a, z) => a + z, 0) / 4 >= level;
        const crossing =
          pairs[mask] ??
          ((mask === 5) === centreHigh
            ? [
                [0, 1],
                [2, 3],
              ]
            : [
                [3, 0],
                [1, 2],
              ]);
        for (const [a, z] of crossing)
          add(keys[a], point(a), keys[z], point(z));
      }
    const visited = new Uint8Array(segments.length);
    // Open paths first, then closed loops, so a path is never unnecessarily split.
    const starts = [...adjacency.keys()].sort(
      (a, z) => adjacency.get(a)!.length - adjacency.get(z)!.length,
    );
    for (const start of starts) {
      const first = adjacency.get(start)!.find((i) => !visited[i]);
      if (first === undefined) continue;
      const points: Point[] = [nodes.get(start)!];
      let current = start;
      for (;;) {
        const edge = adjacency.get(current)!.find((i) => !visited[i]);
        if (edge === undefined) break;
        visited[edge] = 1;
        const segment = segments[edge];
        current = segment[0] === current ? segment[1] : segment[0];
        points.push(nodes.get(current)!);
        if (current === start) break;
      }
      if (length(points) >= Math.max(3, pitch * 1.8))
        paths.push({
          points: simplify(points, Math.max(0.12, pitch * 0.075)),
          width: round(clamp(s.minDiameterMm * 0.35, 0.3, 0.8)),
        });
    }
  }
  return paths;
}

/** Horizontal strips have outlined boundaries for a ruler-guided fill activity. */
export function renderLines(c: ModeContext): Cell[] {
  const { settings: s, bounds: b, pitch, maxDiameter } = c;
  const cells: Cell[] = [];
  const rows = Math.max(1, Math.floor((b.height - maxDiameter) / pitch) + 1);
  const step = Math.max(1, pitch * 0.5);
  const cols = Math.max(1, Math.ceil(b.width / step));
  const width = b.width / cols;
  for (let row = 0; row < rows; row++) {
    const y = b.y + (b.height - (rows - 1) * pitch) / 2 + row * pitch;
    let current: Cell | undefined;
    for (let col = 0; col < cols; col++) {
      const x = b.x + col * width;
      const darkness = darknessAt(c, x + width / 2, y);
      if (darkness <= s.threshold) {
        current = undefined;
        continue;
      }
      const level = Math.max(
        1,
        Math.round(((darkness - s.threshold) / (1 - s.threshold)) * 6),
      );
      const height = round(
        s.minDiameterMm + ((maxDiameter - s.minDiameterMm) * level) / 6,
      );
      if (
        current &&
        current.height === height &&
        Math.abs(current.x + current.width - x) < 0.001
      )
        current.width = round(current.width + width);
      else {
        current = {
          x: round(x),
          y: round(y - height / 2),
          width: round(width),
          height,
        };
        cells.push(current);
      }
    }
  }
  return cells;
}

export { length as pathLength };
