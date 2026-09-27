import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { INKS } from "../catalog";
import { normalizeSettings, RENDERER_VERSION } from "../renderers";
import { decodeSource, putAsset, removeAsset } from "./assets";
import { getCatalogue, quote } from "./catalog";
import { designSchema, type Design, type Checkout, type Order } from "./schema";
import { ApiError, digest, newToken, tokenMatches } from "./security";
import { getRecord, listRecords, putRecord, deleteRecord } from "./store";
import { sendEmail } from "./email";
import { deleteUpload, uploadedSource } from "./uploads";

export async function saveDesign(input: unknown) {
  const parsed = designSchema.parse(input);
  const catalogue = await getCatalogue();
  const { product } = quote(
    catalogue,
    parsed.productId,
    parsed.finishId,
    "standard",
  );
  const ink = INKS.find((item) => item.id === parsed.inkId);
  if (!ink) throw new ApiError(400, "Choose an available ink colour.");
  const landscape =
    parsed.settings.widthMm === product.heightMm &&
    parsed.settings.heightMm === product.widthMm;
  let settings;
  try {
    settings = normalizeSettings({
      ...parsed.settings,
      mode: parsed.mode,
      widthMm: landscape ? product.heightMm : product.widthMm,
      heightMm: landscape ? product.widthMm : product.heightMm,
      inkColor: ink.color,
    });
  } catch {
    throw new ApiError(400, "The renderer settings need adjusting.");
  }
  const source =
    "dataUrl" in parsed.source
      ? decodeSource(parsed.source.dataUrl)
      : await uploadedSource(parsed.source.uploadId, parsed.source.token);
  let metadata;
  try {
    metadata = await sharp(source.bytes, {
      limitInputPixels: 40_000_000,
    }).metadata();
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
  const warnings = [];
  if (Math.min(metadata.width, metadata.height) < 600)
    warnings.push("The source is small. Review fine details before printing.");
  const id = randomUUID();
  const token = newToken();
  const asset = await putAsset(
    `designs/${id}/original`,
    source.bytes,
    source.mime,
  );
  const design: Design = {
    id,
    tokenHash: digest(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    mode: parsed.mode,
    productId: parsed.productId,
    finishId: parsed.finishId,
    inkId: parsed.inkId,
    crop: parsed.crop,
    settings,
    source: asset,
    rightsConfirmed: true,
    marketingConsent: parsed.marketingConsent,
    email: parsed.email,
    warnings,
    rendererVersion: RENDERER_VERSION,
  };
  await putRecord("designs", id, design, true);
  if ("uploadId" in parsed.source)
    await deleteUpload(parsed.source.uploadId).catch(() => {
      /* Retention retries orphaned staging cleanup. */
    });
  const url = `/design/${id}#token=${token}`;
  const emailSent = parsed.email
    ? await sendEmail(
        parsed.email,
        "Your saved Slow Reveal design",
        `Your private design is ready to revisit: ${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}${url}\nThis link grants access to your photograph. Keep it private. Unpaid designs expire after 30 days.`,
        `saved-design-${id}`,
      )
    : false;
  return { id, token, url, warnings, expiresAt: design.expiresAt, emailSent };
}
export async function authorizedDesign(
  id: string,
  token: string | null,
): Promise<Design> {
  const design = await getRecord<Design>("designs", id);
  if (!design || !tokenMatches(token, design.tokenHash))
    throw new ApiError(404, "Design not found or access link expired.");
  if (Date.parse(design.expiresAt) < Date.now())
    throw new ApiError(410, "This saved design has expired.");
  return design;
}
export async function deleteDesign(id: string, token: string | null) {
  const design = await authorizedDesign(id, token);
  const checkouts = await listRecords<Checkout>("checkouts");
  const orders = await listRecords<Order>("orders");
  if (
    checkouts.some((item) => item.design.id === id) ||
    orders.some((item) => item.originalSnapshot.design.id === id)
  )
    throw new ApiError(
      409,
      "This photo is attached to an order or checkout. Contact the studio for an order-data deletion review.",
    );
  await removeAsset(design.source);
  await deleteRecord("designs", id);
}
export function publicDesign(design: Design) {
  const { tokenHash: _, email: __, source, ...publicFields } = design;
  return {
    ...publicFields,
    source: { mime: source.mime, bytes: source.bytes, sha256: source.sha256 },
    sourceUrl: `/api/designs/${design.id}/source`,
  };
}
