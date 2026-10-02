import type { Order } from "./server/schema";
import type { Crop } from "./image-processing";

export function hasUnappliedCrop(edited: Crop, saved: Crop): boolean {
  return (
    edited.zoom !== saved.zoom ||
    edited.x !== saved.x ||
    edited.y !== saved.y ||
    edited.rotation !== saved.rotation
  );
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Read the revision actually being reviewed, never substitute the paid original's artwork details. */
export function orderReviewDetails(order: Order) {
  const revision = order.revisions.find(
    (item) => item.id === order.currentRevisionId,
  );
  const settings = revision?.settings ?? order.originalSnapshot.design.settings;
  const artwork = revision?.package ?? order.originalSnapshot.package;
  const manifest = artwork.manifest;
  const guide =
    manifest.kitGuide && typeof manifest.kitGuide === "object"
      ? (manifest.kitGuide as Record<string, unknown>)
      : undefined;
  const guideFiles =
    guide?.files && typeof guide.files === "object"
      ? (guide.files as Record<string, unknown>)
      : undefined;
  const guidePresent =
    guide?.status === "draft-for-physical-trial" &&
    guide.pages === 2 &&
    typeof guide.version === "string" &&
    /^srs-kit-guide\/[0-9.]+$/.test(guide.version) &&
    ["makingGuidePdf", "guideModel", "packingListJson"].every((key) => {
      const file = guideFiles?.[key];
      if (!file || typeof file !== "object") return false;
      const entry = file as Record<string, unknown>;
      return (
        typeof entry.path === "string" &&
        entry.path.startsWith("kit/") &&
        typeof entry.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(entry.sha256) &&
        typeof entry.bytes === "number" &&
        Number.isSafeInteger(entry.bytes) &&
        entry.bytes > 0
      );
    });
  const stats =
    manifest.stats && typeof manifest.stats === "object"
      ? (manifest.stats as Record<string, unknown>)
      : {};
  return {
    settings,
    subjectMask: revision
      ? revision.subjectMask
      : order.originalSnapshot.design.subjectMask,
    crop: revision?.crop ?? order.originalSnapshot.design.crop,
    artwork,
    customerProofPending: Boolean(
      revision?.customerProofRequired &&
      !order.customerProofApprovals?.some(
        (approval) =>
          approval.revisionId === revision.id &&
          approval.snapshotHash === artwork.snapshotHash,
      ),
    ),
    kit: strings(manifest.kit),
    kitGuide: guidePresent
      ? { version: guide!.version as string, pages: 2 }
      : undefined,
    warnings: [
      ...new Set([
        ...strings(manifest.warnings),
        ...strings(manifest.sourceWarnings),
        ...(!revision ? order.originalSnapshot.design.warnings : []),
      ]),
    ],
    markCount:
      typeof stats.markCount === "number" && Number.isFinite(stats.markCount)
        ? stats.markCount
        : undefined,
    text: settings.text?.value || "",
  };
}
