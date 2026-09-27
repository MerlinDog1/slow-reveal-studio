import { clamp, type PixelImage, type RenderSettings } from "./types";

/** Fixed analysis cap affects sampling only, never the physical mark lattice. */
const MAX_ANALYSIS_EDGE = 1000;

export interface ToneMap {
  width: number;
  height: number;
  mean: number;
  range: number;
  meanEdge: number;
  exposureScale: number;
  sample: (u: number, v: number, radiusU?: number, radiusV?: number) => number;
  color: (
    u: number,
    v: number,
    radiusU?: number,
    radiusV?: number,
  ) => [number, number, number];
}

export function analyzeImage(
  input: PixelImage,
  settings: RenderSettings,
): ToneMap {
  const { data, width: iw, height: ih } = input;
  if (
    !(data instanceof Uint8ClampedArray) ||
    !Number.isInteger(iw) ||
    !Number.isInteger(ih) ||
    iw < 1 ||
    ih < 1 ||
    iw > 32768 ||
    ih > 32768 ||
    iw * ih > 100_000_000 ||
    data.length !== iw * ih * 4
  ) {
    throw new Error(
      "Image must contain matching RGBA pixels and valid dimensions (up to 100 megapixels).",
    );
  }
  const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(iw, ih));
  const width = Math.max(1, Math.round(iw * scale));
  const height = Math.max(1, Math.round(ih * scale));
  const values = new Float32Array(width * height);
  const integral = new Float64Array((width + 1) * (height + 1));
  const histogram = new Uint32Array(256);
  let sum = 0;
  let edges = 0;
  const pixel = (x: number, y: number) => {
    const i =
      (Math.min(ih - 1, Math.max(0, y)) * iw +
        Math.min(iw - 1, Math.max(0, x))) *
      4;
    const a = data[i + 3] / 255;
    return (
      ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255) *
        a +
      1 -
      a
    );
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Four stratified samples prevent a large source from being reduced to one alias-prone point.
      let luminance = 0;
      for (const dy of [0.25, 0.75])
        for (const dx of [0.25, 0.75]) {
          luminance +=
            pixel(
              Math.floor(((x + dx) * iw) / width),
              Math.floor(((y + dy) * ih) / height),
            ) / 4;
        }
      histogram[Math.round(luminance * 255)]++;
      sum += luminance;
      values[y * width + x] = luminance;
    }
  }
  const percentile = (p: number) => {
    let count = 0;
    for (let i = 0; i < 256; i++) {
      count += histogram[i];
      if (count >= p * width * height) return i / 255;
    }
    return 1;
  };
  const mean = sum / (width * height),
    range = percentile(0.95) - percentile(0.05);
  const lift =
    settings.autoExposure && range > 0.18 ? clamp((0.32 - mean) / 0.16) : 0;
  const whitePoint = 1 - lift * (1 - clamp(percentile(0.98) * 1.1, 0.35, 1));
  const exposureScale = 1 / whitePoint;
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      let adjusted = clamp(
        (values[y * width + x] * exposureScale - 0.5) * settings.contrast +
          0.5 +
          settings.brightness,
      );
      adjusted = Math.pow(adjusted, 1 / settings.gamma);
      const value = settings.invert ? adjusted : 1 - adjusted;
      values[y * width + x] = value;
      if (x) edges += Math.abs(value - values[y * width + x - 1]);
      if (y) edges += Math.abs(value - values[(y - 1) * width + x]);
      rowSum += value;
      integral[(y + 1) * (width + 1) + x + 1] =
        rowSum + integral[y * (width + 1) + x + 1];
    }
  }
  const sample = (u: number, v: number, ru = 0, rv = ru) => {
    if (ru * width >= 0.75 || rv * height >= 0.75) {
      const x0 = Math.floor(clamp(u - ru) * (width - 1));
      const x1 = Math.min(width, Math.ceil(clamp(u + ru) * (width - 1)) + 1);
      const y0 = Math.floor(clamp(v - rv) * (height - 1));
      const y1 = Math.min(height, Math.ceil(clamp(v + rv) * (height - 1)) + 1);
      const stride = width + 1;
      return (
        (integral[y1 * stride + x1] -
          integral[y0 * stride + x1] -
          integral[y1 * stride + x0] +
          integral[y0 * stride + x0]) /
        ((x1 - x0) * (y1 - y0))
      );
    }
    const x = clamp(u) * (width - 1),
      y = clamp(v) * (height - 1);
    const x0 = Math.floor(x),
      y0 = Math.floor(y),
      x1 = Math.min(width - 1, x0 + 1),
      y1 = Math.min(height - 1, y0 + 1);
    const tx = x - x0,
      ty = y - y0;
    return (
      (values[y0 * width + x0] * (1 - tx) + values[y0 * width + x1] * tx) *
        (1 - ty) +
      (values[y1 * width + x0] * (1 - tx) + values[y1 * width + x1] * tx) * ty
    );
  };
  const color = (
    u: number,
    v: number,
    ru = 0,
    rv = ru,
  ): [number, number, number] => {
    const result: [number, number, number] = [0, 0, 0];
    for (const dx of [-0.5, 0.5])
      for (const dy of [-0.5, 0.5]) {
        const x = Math.round(clamp(u + dx * ru) * (iw - 1));
        const y = Math.round(clamp(v + dy * rv) * (ih - 1));
        const i = (y * iw + x) * 4,
          a = data[i + 3] / 255;
        for (let c = 0; c < 3; c++)
          result[c] += (data[i + c] * a + 255 * (1 - a)) / 4;
      }
    return result;
  };
  return {
    width,
    height,
    sample,
    color,
    mean,
    range,
    meanEdge: edges / (width * height * 2),
    exposureScale,
  };
}
