/** Display-only limits. These never change millimetre geometry or export resolution. */
const MAX_OUTPUT_PIXELS = 2_097_152;
const MAX_SAMPLE_PIXELS = 8_388_608;
const MAX_SAMPLE_EDGE = 4096;

export type PreviewRasterPlan = {
  width: number;
  height: number;
  samples: number;
  sampleWidth: number;
  sampleHeight: number;
};

export function previewRasterPlan(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  zoom: number,
): PreviewRasterPlan | null {
  if (
    ![cssWidth, cssHeight, devicePixelRatio, zoom].every(Number.isFinite) ||
    cssWidth <= 0 ||
    cssHeight <= 0 ||
    devicePixelRatio <= 0 ||
    zoom < 1 ||
    zoom >= 2
  )
    return null;
  const scale = Math.min(
    devicePixelRatio,
    2048 / Math.max(cssWidth, cssHeight),
    Math.sqrt(MAX_OUTPUT_PIXELS / (cssWidth * cssHeight)),
  );
  const width = Math.max(1, Math.floor(cssWidth * scale));
  const height = Math.max(1, Math.floor(cssHeight * scale));
  const samples = Math.min(
    4,
    Math.floor(MAX_SAMPLE_EDGE / Math.max(width, height)),
    Math.floor(Math.sqrt(MAX_SAMPLE_PIXELS / (width * height))),
  );
  if (samples < 2) return null;
  return {
    width,
    height,
    samples,
    sampleWidth: width * samples,
    sampleHeight: height * samples,
  };
}

/** Retain the viewBox/marks verbatim; only an internal SVG copy gets pixel-sized raster bounds. */
export function previewSvgAtSize(
  svg: string,
  width: number,
  height: number,
): string {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_SAMPLE_EDGE ||
    height > MAX_SAMPLE_EDGE
  )
    throw new Error("Invalid preview raster dimensions.");
  const end = svg.indexOf(">");
  if (!svg.startsWith("<svg ") || end < 0)
    throw new Error("Expected generated artwork SVG.");
  const root = svg.slice(0, end).replace(/\s(?:width|height)="[^"]*"/g, "");
  return `${root} width="${width}" height="${height}"${svg.slice(end)}`;
}

/** Exact box integration of subpixels; premultiplied alpha prevents transparent-edge halos. */
export function downsamplePreview(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  samples: number,
): Uint8ClampedArray<ArrayBuffer> {
  if (
    ![width, height, samples].every(Number.isSafeInteger) ||
    width < 1 ||
    height < 1 ||
    samples < 2 ||
    samples > 4 ||
    width * height * samples * samples > MAX_SAMPLE_PIXELS ||
    width * samples > MAX_SAMPLE_EDGE ||
    height * samples > MAX_SAMPLE_EDGE ||
    rgba.length !== width * height * samples * samples * 4
  )
    throw new Error("Invalid preview sample buffer.");
  const output = new Uint8ClampedArray(width * height * 4);
  const rowWidth = width * samples;
  const count = samples * samples;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let alpha = 0,
        red = 0,
        green = 0,
        blue = 0;
      for (let sy = 0; sy < samples; sy++) {
        let at = ((y * samples + sy) * rowWidth + x * samples) * 4;
        for (let sx = 0; sx < samples; sx++, at += 4) {
          const a = rgba[at + 3];
          alpha += a;
          red += rgba[at] * a;
          green += rgba[at + 1] * a;
          blue += rgba[at + 2] * a;
        }
      }
      const at = (y * width + x) * 4;
      if (alpha) {
        output[at] = red / alpha;
        output[at + 1] = green / alpha;
        output[at + 2] = blue / alpha;
      }
      output[at + 3] = alpha / count;
    }
  }
  return output;
}
