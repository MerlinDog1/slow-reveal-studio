export type SubjectMaskCrop = {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
};

export type SubjectMaskBinding = {
  sourceSha256: string;
  crop: SubjectMaskCrop;
  widthMm: number;
  heightMm: number;
};

/** Private, user-painted alpha selection in the current cropped photograph. */
export type SubjectMask = SubjectMaskBinding & {
  version: 1;
  space: "cropped-v1";
  width: number;
  height: number;
  /** Canonical base64 alpha8: zero suppresses background; 255 preserves subject. */
  data: string;
  /** Box-blur radius as a proportion of the shorter mask edge. */
  feather: number;
};

export const SUBJECT_MASK_EDGE = 512;
export const MAX_SUBJECT_MASK_PIXELS = SUBJECT_MASK_EDGE ** 2;
const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error("Subject mask contains missing or unsupported fields.");
}
function finiteRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

export function maskRasterDimensions(widthMm: number, heightMm: number) {
  if (!finiteRange(widthMm, 30, 1500) || !finiteRange(heightMm, 30, 1500))
    throw new Error(
      "Subject mask canvas dimensions must be between 30 and 1500 mm.",
    );
  const longest = Math.max(widthMm, heightMm);
  return {
    width: Math.max(1, Math.round((SUBJECT_MASK_EDGE * widthMm) / longest)),
    height: Math.max(1, Math.round((SUBJECT_MASK_EDGE * heightMm) / longest)),
  };
}

function normalizeBinding(input: unknown): SubjectMaskBinding {
  if (!record(input) || !record(input.crop))
    throw new Error("Subject mask photo and crop binding is required.");
  exactKeys(input, ["sourceSha256", "crop", "widthMm", "heightMm"]);
  exactKeys(input.crop, ["zoom", "x", "y", "rotation"]);
  const { zoom, x, y, rotation } = input.crop;
  if (
    typeof input.sourceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(input.sourceSha256) ||
    !finiteRange(zoom, 1, 4) ||
    !finiteRange(x, -1, 1) ||
    !finiteRange(y, -1, 1) ||
    typeof rotation !== "number" ||
    ![0, 90, 180, 270].includes(rotation) ||
    !finiteRange(input.widthMm, 30, 1500) ||
    !finiteRange(input.heightMm, 30, 1500)
  )
    throw new Error("Subject mask photo, crop or canvas binding is invalid.");
  return {
    sourceSha256: input.sourceSha256.toLowerCase(),
    crop: { zoom, x: x || 0, y: y || 0, rotation: rotation || 0 },
    widthMm: input.widthMm,
    heightMm: input.heightMm,
  };
}

function assertCanonicalData(
  data: unknown,
  pixels: number,
): asserts data is string {
  if (typeof data !== "string" || data.length !== Math.ceil(pixels / 3) * 4)
    throw new Error(
      "Subject mask data must match its bounded raster dimensions.",
    );
  const padding = (3 - (pixels % 3)) % 3;
  const bodyLength = data.length - padding;
  // A flat character-class scan avoids a deeply repeated regexp on a 350 KB string.
  if (
    !/^[A-Za-z0-9+/]+$/.test(data.slice(0, bodyLength)) ||
    data.slice(bodyLength) !== "=".repeat(padding)
  )
    throw new Error("Subject mask data must be canonical base64 alpha8.");
  const last = BASE64.indexOf(data[bodyLength - 1]);
  if (
    (padding === 2 && (last & 15) !== 0) ||
    (padding === 1 && (last & 3) !== 0)
  )
    throw new Error("Subject mask base64 has noncanonical padding bits.");
}

/** Validates and returns a fresh, JSON-safe canonical object; no pixels or paths are logged. */
export function normalizeSubjectMask(input: unknown): SubjectMask {
  if (!record(input))
    throw new Error("Subject mask must be a saved alpha selection.");
  exactKeys(input, [
    "version",
    "space",
    "sourceSha256",
    "crop",
    "widthMm",
    "heightMm",
    "width",
    "height",
    "data",
    "feather",
  ]);
  if (input.version !== 1 || input.space !== "cropped-v1")
    throw new Error(
      "This subject mask version is unsupported. Redraw the selection.",
    );
  const binding = normalizeBinding({
    sourceSha256: input.sourceSha256,
    crop: input.crop,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
  });
  const { width, height } = maskRasterDimensions(
    binding.widthMm,
    binding.heightMm,
  );
  if (input.width !== width || input.height !== height)
    throw new Error("Subject mask raster dimensions do not match this canvas.");
  if (!finiteRange(input.feather, 0, 0.05))
    throw new Error("Subject mask feather must be between 0 and 0.05.");
  assertCanonicalData(input.data, width * height);
  return {
    version: 1,
    space: "cropped-v1",
    ...binding,
    width,
    height,
    data: input.data,
    feather: input.feather || 0,
  };
}

/** A mask is never silently reused for a different photo, crop or physical size. */
export function assertSubjectMaskBinding(
  mask: SubjectMask,
  binding: SubjectMaskBinding,
): void {
  const saved = normalizeSubjectMask(mask);
  const expected = normalizeBinding(binding);
  if (
    saved.sourceSha256 !== expected.sourceSha256 ||
    saved.widthMm !== expected.widthMm ||
    saved.heightMm !== expected.heightMm ||
    saved.crop.zoom !== expected.crop.zoom ||
    saved.crop.x !== expected.crop.x ||
    saved.crop.y !== expected.crop.y ||
    saved.crop.rotation !== expected.crop.rotation
  )
    throw new Error(
      "The subject mask belongs to a different photo, crop or canvas size. Clear it or redraw the selection.",
    );
}

export function encodeSubjectMaskData(
  data: Uint8Array | Uint8ClampedArray,
): string {
  if (
    !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
    data.length < 1 ||
    data.length > MAX_SUBJECT_MASK_PIXELS
  )
    throw new Error("Subject mask alpha data must contain 1 to 262144 pixels.");
  const parts: string[] = [];
  for (let offset = 0; offset < data.length; offset += 16384)
    parts.push(String.fromCharCode(...data.subarray(offset, offset + 16384)));
  return btoa(parts.join(""));
}

function decodeData(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function decodeSubjectMaskData(
  mask: SubjectMask,
): Uint8Array<ArrayBuffer> {
  return decodeData(normalizeSubjectMask(mask).data);
}

/** Deterministic O(width*height) separable box blur, with edge pixels extended. */
function featherAlpha(
  data: Uint8Array,
  width: number,
  height: number,
  radius: number,
) {
  if (!radius) return data;
  const horizontal = new Float64Array(data.length);
  const blurred = new Float64Array(data.length);
  const window = radius * 2 + 1;
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let dx = -radius; dx <= radius; dx++)
      sum += data[row + clamp(dx, width - 1)];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / window;
      sum +=
        data[row + clamp(x + radius + 1, width - 1)] -
        data[row + clamp(x - radius, width - 1)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++)
      sum += horizontal[clamp(dy, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      blurred[y * width + x] = sum / window;
      sum +=
        horizontal[clamp(y + radius + 1, height - 1) * width + x] -
        horizontal[clamp(y - radius, height - 1) * width + x];
    }
  }
  return blurred;
}

/** Coordinates use the cropped photo, independent of preview/source pixel dimensions. */
export function createSubjectMaskSampler(
  mask: SubjectMask,
): (u: number, v: number) => number {
  const normalized = normalizeSubjectMask(mask);
  const { width, height } = normalized;
  const alpha = featherAlpha(
    decodeData(normalized.data),
    width,
    height,
    Math.round(normalized.feather * Math.min(width, height)),
  );
  return (u, v) => {
    if (!Number.isFinite(u) || !Number.isFinite(v))
      throw new Error("Subject mask sample coordinates must be finite.");
    const x = Math.max(0, Math.min(1, u)) * (width - 1);
    const y = Math.max(0, Math.min(1, v)) * (height - 1);
    const x0 = Math.floor(x),
      y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1),
      y1 = Math.min(height - 1, y0 + 1);
    const tx = x - x0,
      ty = y - y0;
    const value =
      (alpha[y0 * width + x0] * (1 - tx) + alpha[y0 * width + x1] * tx) *
        (1 - ty) +
      (alpha[y1 * width + x0] * (1 - tx) + alpha[y1 * width + x1] * tx) * ty;
    return Math.max(0, Math.min(1, value / 255));
  };
}
