import type { ModeContext } from "./modes";
import { clamp, MAX_MARKS, round, type Circle, type Point } from "./types";

/** Seeded Poisson-disc sites have no lattice and depend only on physical settings.
 * Tone changes their occupancy and area, never the underlying placement. */
export function renderStipple(c: ModeContext): Circle[] {
  const { bounds: b, settings: s, tone, pitch, maxDiameter } = c;
  const inset = maxDiameter / 2;
  const left = b.x + inset,
    top = b.y + inset;
  const width = b.width - maxDiameter,
    height = b.height - maxDiameter;
  const bucketSize = pitch / Math.SQRT2;
  const nx = Math.floor(width / bucketSize) + 1;
  const ny = Math.floor(height / bucketSize) + 1;
  const grid = new Int32Array(nx * ny);
  const sites: Point[] = [];
  const active: number[] = [];
  let seed = 0x713bc29d;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > width || y > height) return false;
    const gx = Math.floor(x / bucketSize),
      gy = Math.floor(y / bucketSize);
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(ny - 1, gy + 2); yy++)
      for (let xx = Math.max(0, gx - 2); xx <= Math.min(nx - 1, gx + 2); xx++) {
        const index = grid[yy * nx + xx] - 1;
        if (index < 0) continue;
        const other = sites[index];
        if ((other.x - x) ** 2 + (other.y - y) ** 2 < pitch ** 2) return false;
      }
    grid[gy * nx + gx] = sites.length + 1;
    active.push(sites.length);
    sites.push({ x, y });
    return true;
  };
  add(random() * width, random() * height);
  let failedRestarts = 0;
  while (sites.length < MAX_MARKS) {
    if (!active.length) {
      // Restart in uncovered space, including long, narrow artwork bounds.
      if (add(random() * width, random() * height)) failedRestarts = 0;
      else if (++failedRestarts >= 64) break;
      continue;
    }
    const slot = Math.floor(random() * active.length);
    const site = sites[active[slot]];
    let found = false;
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = pitch * Math.sqrt(1 + random() * 3);
      if (
        add(
          site.x + Math.cos(angle) * distance,
          site.y + Math.sin(angle) * distance,
        )
      ) {
        found = true;
        break;
      }
    }
    if (!found) {
      active[slot] = active[active.length - 1];
      active.pop();
    }
  }

  const circles: Circle[] = [];
  const ru = (pitch * 0.22) / b.width,
    rv = (pitch * 0.22) / b.height;
  sites.forEach((site, index) => {
    const x = left + site.x,
      y = top + site.y;
    const u = (x - b.x) / b.width,
      v = (y - b.y) / b.height;
    const local = tone.sample(u, v, ru, rv);
    const darkness = clamp(
      local + (local - tone.sample(u, v, ru * 3, rv * 3)) * s.edgeEmphasis,
    );
    if (darkness <= s.threshold) return;
    const value = (darkness - s.threshold) / (1 - s.threshold);
    const diameter = Math.max(
      s.minDiameterMm,
      maxDiameter * (0.65 + 0.35 * value),
    );
    // Both sparse marks and mark area carry tone. Compensate occupancy for
    // diameter so expected ink area tracks source darkness without large pale dots.
    const probability = clamp((value * maxDiameter ** 2) / diameter ** 2);
    let hash = Math.imul(index + 1, 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    const noise = ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
    if (noise >= probability) return;
    circles.push({ x: round(x), y: round(y), r: round(diameter / 2) });
  });
  return circles;
}
