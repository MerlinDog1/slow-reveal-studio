import sharp from "sharp";
import { ApiError } from "./security";

export async function validatePhoto(bytes: Buffer): Promise<string[]> {
  let metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new ApiError(
      415,
      "The image could not be decoded. Choose another photo.",
    );
  }
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
  return Math.min(metadata.width, metadata.height) < 600
    ? ["The source is small. Review fine details before printing."]
    : [];
}
