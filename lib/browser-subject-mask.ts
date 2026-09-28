import {
  assertSubjectMaskBinding,
  encodeSubjectMaskData,
  maskRasterDimensions,
  normalizeSubjectMask,
  type SubjectMask,
  type SubjectMaskBinding,
} from "./subject-mask";

/** Hash the original bytes locally; never send photo or mask data to an external service. */
export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export type MaskPoint = { x: number; y: number };

/** A bounded capsule brush covers the complete segment, including fast pointer movement. */
export function paintMaskStroke(
  alpha: Uint8Array,
  width: number,
  height: number,
  from: MaskPoint,
  to: MaskPoint,
  radius: number,
  mode: "keep" | "remove",
): void {
  if (
    !(alpha instanceof Uint8Array) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 512 ||
    height > 512 ||
    alpha.length !== width * height ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    radius > 512 ||
    ![from?.x, from?.y, to?.x, to?.y].every(Number.isFinite) ||
    from.x < 0 ||
    from.x > width - 1 ||
    to.x < 0 ||
    to.x > width - 1 ||
    from.y < 0 ||
    from.y > height - 1 ||
    to.y < 0 ||
    to.y > height - 1 ||
    (mode !== "keep" && mode !== "remove")
  )
    throw new Error("Invalid mask brush dimensions.");
  const x0 = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + radius));
  const y0 = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + radius));
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const value = mode === "keep" ? 255 : 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = lengthSquared
        ? Math.max(
            0,
            Math.min(
              1,
              ((x - from.x) * dx + (y - from.y) * dy) / lengthSquared,
            ),
          )
        : 0;
      if (
        (x - from.x - t * dx) ** 2 + (y - from.y - t * dy) ** 2 <=
        radius ** 2
      )
        alpha[y * width + x] = value;
    }
  }
}

/** Apply creates an independent snapshot; later brush edits cannot mutate its encoded pixels or binding. */
export function snapshotSubjectMaskDraft(
  alpha: Uint8Array,
  binding: SubjectMaskBinding,
  feather: number,
): SubjectMask {
  const dimensions = maskRasterDimensions(binding.widthMm, binding.heightMm);
  const snapshot = normalizeSubjectMask({
    ...binding,
    crop: { ...binding.crop },
    version: 1,
    space: "cropped-v1",
    ...dimensions,
    data: encodeSubjectMaskData(alpha),
    feather,
  });
  assertSubjectMaskBinding(snapshot, binding);
  return snapshot;
}
