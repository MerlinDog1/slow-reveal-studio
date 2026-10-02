import { clamp, type PixelImage } from "./renderers/types";

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (values: number[]) =>
  "#" +
  values
    .map((v) =>
      Math.round(clamp(v, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const distance = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + [0.25, 0.55, 0.2][i] * (v - b[i]) ** 2, 0);

/** Deterministic weighted colour clustering, bounded to 12k local samples. */
export function photoPalette(
  image: PixelImage,
  count: number,
  locked: string[] = [],
): string[] {
  if (
    !Number.isInteger(count) ||
    count < 2 ||
    count > 32 ||
    image.data.length !== image.width * image.height * 4 ||
    image.width < 1 ||
    image.height < 1
  )
    throw new Error("Invalid photograph or palette size.");
  const fixed = [...new Set(locked.map((c) => c.toLowerCase()))];
  if (fixed.length > count || fixed.some((c) => !/^#[a-f0-9]{6}$/.test(c)))
    throw new Error("Invalid locked colours.");
  const bins = new Map<string, { value: number[]; count: number }>();
  const stride = Math.max(1, Math.ceil((image.width * image.height) / 12000));
  for (let pixel = 0; pixel < image.width * image.height; pixel += stride) {
    const at = pixel * 4,
      alpha = image.data[at + 3] / 255;
    const value = [0, 1, 2].map(
      (c) => image.data[at + c] * alpha + 255 * (1 - alpha),
    );
    if (value.every((v) => v > 247)) continue;
    const key = value.map((v) => Math.floor(v / 12)).join(",");
    const bin = bins.get(key);
    if (bin) {
      bin.count++;
      value.forEach((v, i) => (bin.value[i] += v));
    } else bins.set(key, { value: [...value], count: 1 });
  }
  const samples = [...bins.values()].map((b) => ({
    value: b.value.map((v) => v / b.count),
    count: b.count,
  }));
  if (!samples.length)
    return [...new Set([...fixed, "#202020", "#909090"])].slice(0, count);
  const centres = fixed.map(rgb);
  if (!centres.length)
    centres.push([
      ...samples.reduce((a, b) => (a.count >= b.count ? a : b)).value,
    ]);
  while (
    centres.length < count &&
    centres.length < samples.length + fixed.length
  ) {
    const best = samples.reduce((a, b) => {
      const score = (sample: typeof a) =>
        Math.min(...centres.map((c) => distance(c, sample.value))) *
        Math.sqrt(sample.count);
      return score(a) >= score(b) ? a : b;
    });
    if (centres.some((c) => distance(c, best.value) < 1)) break;
    centres.push([...best.value]);
  }
  for (let pass = 0; pass < 8; pass++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const sample of samples) {
      let nearest = 0;
      centres.forEach((c, i) => {
        if (
          distance(c, sample.value) < distance(centres[nearest], sample.value)
        )
          nearest = i;
      });
      sample.value.forEach((v, i) => (sums[nearest][i] += v * sample.count));
      sums[nearest][3] += sample.count;
    }
    centres.forEach((c, i) => {
      if (i >= fixed.length && sums[i][3])
        centres[i] = c.map((_, channel) => sums[i][channel] / sums[i][3]);
    });
  }
  const result = [...new Set(centres.map(hex))];
  if (result.length < 2)
    result.push(result[0] === "#202020" ? "#a0a0a0" : "#202020");
  return result;
}

export const PHOTO_STARTS = {
  portrait: {
    contrast: 1.08,
    gamma: 1.1,
    brightness: 0,
    edgeEmphasis: 0.35,
    detailPreservation: 0.7,
    focusDetail: 0.6,
    shadowLift: 0.1,
  },
  "dark pet": {
    contrast: 1.12,
    gamma: 1.25,
    brightness: 0.02,
    edgeEmphasis: 0.45,
    detailPreservation: 0.7,
    shadowLift: 0.3,
  },
  family: {
    contrast: 1.12,
    gamma: 1.08,
    brightness: 0,
    edgeEmphasis: 0.3,
    detailPreservation: 0.8,
    shadowLift: 0.12,
  },
  building: {
    contrast: 1.3,
    gamma: 1,
    brightness: 0,
    edgeEmphasis: 0.6,
    detailPreservation: 0.85,
    shadowLift: 0,
  },
  landscape: {
    contrast: 1.2,
    gamma: 1.05,
    brightness: 0,
    edgeEmphasis: 0.25,
    detailPreservation: 0.4,
    shadowLift: 0.08,
  },
} as const;
