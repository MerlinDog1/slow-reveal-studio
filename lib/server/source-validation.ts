import sharp from "sharp";
import { ApiError } from "./security";

export async function validatePhoto(bytes: Buffer): Promise<string[]> {
  if (bytes.length < 12 || bytes.length > 8 * 1024 * 1024)
    throw new ApiError(413, "Choose an image smaller than 8 MB.");
  const options = {
    limitInputPixels: 40_000_000,
    failOn: "warning" as const,
    sequentialRead: true,
  };
  let metadata;
  try {
    metadata = await sharp(bytes, options).metadata();
  } catch {
    throw new ApiError(
      415,
      "The image could not be decoded. Choose another photo.",
    );
  }
  if (!["jpeg", "png", "webp"].includes(metadata.format))
    throw new ApiError(415, "Choose a JPG, PNG or WebP photograph.");
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1)
    throw new ApiError(415, "Choose a single-frame photograph.");
  if (
    Math.min(metadata.width, metadata.height) < 32 ||
    Math.max(metadata.width, metadata.height) /
      Math.min(metadata.width, metadata.height) >
      20
  )
    throw new ApiError(
      415,
      "Choose a photograph with a usable portrait or landscape aspect ratio.",
    );
  try {
    // Reading headers alone can accept truncated pixel data. Consume a bounded
    // validation raster, keeping the original bytes untouched for proof binding.
    // Native decode still obeys the 40 MP input cap; JS receives at most 256² RGBA pixels.
    await sharp(bytes, options)
      .resize({
        width: 256,
        height: 256,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw({ depth: "uchar" })
      .timeout({ seconds: 10 })
      .toBuffer();
  } catch {
    throw new ApiError(
      415,
      "The image could not be decoded completely. Choose another photo.",
    );
  }
  return Math.min(metadata.width, metadata.height) < 600
    ? ["The source is small. Review fine details before printing."]
    : [];
}
