/** A compact, pre-rendered sequence; no photo decoding or renderer in the hero bundle. */
export interface HeroRevealData {
  width: number;
  height: number;
  palette: string[];
  /** Centre x, centre y, radius and zero-based palette index, in millimetres. */
  dots: [number, number, number, number][];
}

export const REVEAL_DURATION_MS = 24_000;

export function revealedCount(elapsed: number, total: number): number {
  const t = Math.max(0, Math.min(1, elapsed / REVEAL_DURATION_MS));
  // Begin with deliberate individual marks, then accelerate into a making timelapse.
  return Math.min(total, Math.floor(total * (0.08 * t + 0.92 * t ** 1.7)));
}
