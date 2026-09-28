import {
  assertSubjectMaskBinding,
  normalizeSubjectMask,
  type SubjectMask,
  type SubjectMaskBinding,
} from "../subject-mask";
import type { RenderSettings } from "../renderers";
import { getAsset, type PrivateAsset } from "./assets";
import type { Crop, Design } from "./schema";
import { ApiError, digest } from "./security";

/** Mask coordinates are private source-derived artwork, never reusable preset data. */
export function validateSubjectMask(
  mask: SubjectMask | undefined,
  binding: SubjectMaskBinding,
  settings: RenderSettings,
) {
  if ((settings.subjectMaskStrength ?? 0) > 0 && !mask)
    throw new ApiError(
      409,
      "Select a subject mask or set its strength to zero.",
    );
  if ((settings.subjectMaskStrength ?? 0) > 0 && settings.mode !== "dots")
    throw new ApiError(
      400,
      "Subject masks are currently available in Dots only.",
    );
  if (mask) {
    try {
      assertSubjectMaskBinding(mask, binding);
    } catch {
      throw new ApiError(
        409,
        "This subject mask belongs to a different photo, crop or canvas size. Clear it and select the subject again.",
      );
    }
  }
}

export async function readSubjectMask(
  asset: PrivateAsset,
): Promise<SubjectMask> {
  // A 512 x 512 alpha8 mask plus binding JSON fits comfortably inside this cap.
  if (asset.bytes > 360_000 || asset.mime !== "application/json")
    throw new ApiError(409, "Stored subject mask is invalid.");
  const bytes = await getAsset(asset);
  try {
    if (bytes.length > 360_000) throw new Error("Mask exceeds storage limit.");
    const mask = normalizeSubjectMask(JSON.parse(bytes.toString("utf8")));
    // Every stored mask is canonical. Copying it must retain the proof-bound digest.
    if (digest(JSON.stringify(mask)) !== asset.sha256)
      throw new Error("Mask is not canonically serialized.");
    return mask;
  } catch {
    throw new ApiError(409, "Stored subject mask is invalid.");
  }
}

export async function designSubjectMask(
  design: Design,
  settings = design.settings,
  crop: Crop = design.crop,
) {
  const mask = design.subjectMask
    ? await readSubjectMask(design.subjectMask)
    : undefined;
  validateSubjectMask(
    mask,
    {
      sourceSha256: design.source.sha256,
      crop,
      widthMm: settings.widthMm,
      heightMm: settings.heightMm,
    },
    settings,
  );
  return mask;
}
