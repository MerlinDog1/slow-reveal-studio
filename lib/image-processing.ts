import { analysePhoto, photoCropTransform } from "./photo-analysis";

export type Crop = { zoom: number; x: number; y: number; rotation: number };
export const DEFAULT_CROP: Crop = { zoom: 1, x: 0, y: 0, rotation: 0 };
export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Modern browser decoders apply EXIF orientation before drawImage and expose
    // oriented natural dimensions. Do not rotate EXIF a second time here.
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error("This image could not be opened. Try a JPG, PNG or WebP."),
      );
    image.src = src;
  });
}
export function cropImage(
  image: HTMLImageElement,
  crop: Crop,
  ratio: number,
  maxPx = 1000,
) {
  if (
    !Number.isFinite(ratio) ||
    ratio < 0.05 ||
    ratio > 20 ||
    !Number.isFinite(maxPx) ||
    maxPx < 16 ||
    maxPx > 4096
  )
    throw new Error("Unsupported crop dimensions.");
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(ratio >= 1 ? maxPx : maxPx * ratio));
  canvas.height = Math.max(1, Math.round(ratio >= 1 ? maxPx / ratio : maxPx));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const transform = photoCropTransform(
    image.naturalWidth,
    image.naturalHeight,
    crop,
    canvas.width,
    canvas.height,
  );
  ctx.translate(transform.offsetX, transform.offsetY);
  ctx.rotate(transform.radians);
  ctx.scale(transform.scale, transform.scale);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, pixels };
}
export function analyseImage(
  data: ImageData,
  sourceWidth: number,
  sourceHeight: number,
) {
  return analysePhoto(data, { sourceWidth, sourceHeight }).advice.map(
    (advice) => advice.message,
  );
}
