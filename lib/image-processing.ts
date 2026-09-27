export type Crop = { zoom: number; x: number; y: number; rotation: number };
export const DEFAULT_CROP: Crop = { zoom: 1, x: 0, y: 0, rotation: 0 };
export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
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
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(ratio >= 1 ? maxPx : maxPx * ratio);
  canvas.height = Math.round(ratio >= 1 ? maxPx / ratio : maxPx);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const radians = (crop.rotation * Math.PI) / 180;
  const rotatedWidth =
    Math.abs(image.naturalWidth * Math.cos(radians)) +
    Math.abs(image.naturalHeight * Math.sin(radians));
  const rotatedHeight =
    Math.abs(image.naturalHeight * Math.cos(radians)) +
    Math.abs(image.naturalWidth * Math.sin(radians));
  const scale =
    Math.max(canvas.width / rotatedWidth, canvas.height / rotatedHeight) *
    crop.zoom;
  const overflowX = Math.max(0, rotatedWidth * scale - canvas.width) / 2;
  const overflowY = Math.max(0, rotatedHeight * scale - canvas.height) / 2;
  ctx.translate(
    canvas.width / 2 + crop.x * overflowX,
    canvas.height / 2 + crop.y * overflowY,
  );
  ctx.rotate(radians);
  ctx.scale(scale, scale);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, pixels };
}
export function analyseImage(
  data: ImageData,
  sourceWidth: number,
  sourceHeight: number,
) {
  let sum = 0,
    sumSq = 0,
    edge = 0;
  const luminances = new Float32Array(data.width * data.height);
  for (let i = 0; i < luminances.length; i++) {
    const p = i * 4;
    const l =
      (data.data[p] * 0.2126 +
        data.data[p + 1] * 0.7152 +
        data.data[p + 2] * 0.0722) /
      255;
    luminances[i] = l;
    sum += l;
    sumSq += l * l;
  }
  for (let y = 1; y < data.height - 1; y += 3)
    for (let x = 1; x < data.width - 1; x += 3) {
      const i = y * data.width + x;
      edge += Math.abs(
        luminances[i - 1] +
          luminances[i + 1] +
          luminances[i - data.width] +
          luminances[i + data.width] -
          4 * luminances[i],
      );
    }
  const mean = sum / luminances.length;
  const deviation = Math.sqrt(sumSq / luminances.length - mean * mean);
  const notes: string[] = [];
  if (Math.min(sourceWidth, sourceHeight) < 700)
    notes.push(
      "A larger source photo will preserve more detail. Aim for at least 1,000 pixels on the short edge.",
    );
  if (mean < 0.23)
    notes.push(
      "This photo is quite dark. Try increasing brightness or choosing a lighter photo.",
    );
  if (mean > 0.84)
    notes.push(
      "This photo is very bright. Increase contrast to recover the subject.",
    );
  if (deviation < 0.14)
    notes.push(
      "Low contrast can hide detail. Try the Bold preset or increase contrast.",
    );
  if (edge / (luminances.length / 9) < 0.015)
    notes.push(
      "Fine detail may be soft. Check the finished view before exporting.",
    );
  if (!notes.length)
    notes.push(
      "A promising photo for this canvas. Check that your subject stays inside the guide.",
    );
  return notes;
}
