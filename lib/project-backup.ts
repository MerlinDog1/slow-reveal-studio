import type { LocalProject } from "./browser-storage";
import { hashBlob } from "./browser-subject-mask";

const MAX_BACKUP_BYTES = 13 * 1024 * 1024;
/** Explicit local download; excludes checkout capabilities, email and payment state. */
export async function encodeProjectBackup(
  project: LocalProject,
): Promise<Blob> {
  if (project.image.size > 8 * 1024 * 1024)
    throw new Error("The original photo exceeds 8 MB.");
  const bytes = new Uint8Array(await project.image.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return new Blob(
    [
      JSON.stringify({
        format: "slow-reveal-project",
        version: 1,
        name: project.name,
        updatedAt: project.updatedAt,
        settings: project.settings,
        crop: project.crop,
        subjectMask: project.subjectMask,
        productId: project.productId,
        finishId: project.finishId,
        referenceId: project.referenceId,
        rendererVersion: project.rendererVersion,
        source: {
          mime: project.image.type,
          sha256: await hashBlob(project.image),
          base64: btoa(binary),
        },
      }),
    ],
    { type: "application/json" },
  );
}
export async function decodeProjectBackup(file: Blob): Promise<unknown> {
  if (file.size > MAX_BACKUP_BYTES)
    throw new Error("Project backups must be under 13 MB.");
  const value = JSON.parse(await file.text());
  if (
    !value ||
    value.format !== "slow-reveal-project" ||
    value.version !== 1 ||
    !value.source ||
    !["image/png", "image/jpeg", "image/webp"].includes(value.source.mime) ||
    typeof value.source.base64 !== "string" ||
    value.source.base64.length > 11200000 ||
    !/^[a-f0-9]{64}$/.test(value.source.sha256)
  )
    throw new Error("This is not a supported project backup.");
  const image = new Blob(
    [Uint8Array.from(atob(value.source.base64), (c) => c.charCodeAt(0))],
    { type: value.source.mime },
  );
  if (
    image.size > 8 * 1024 * 1024 ||
    (await hashBlob(image)) !== value.source.sha256
  )
    throw new Error("The backup photograph is damaged.");
  return {
    id: "current",
    name: value.name,
    updatedAt: value.updatedAt,
    settings: value.settings,
    crop: value.crop,
    subjectMask: value.subjectMask,
    productId: value.productId,
    finishId: value.finishId,
    referenceId: value.referenceId,
    rendererVersion: value.rendererVersion,
    image,
  };
}
