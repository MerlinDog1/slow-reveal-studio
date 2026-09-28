import { randomUUID } from "node:crypto";
import { getAvailableModes } from "../mode-availability";
import { INKS } from "../catalog";
import { normalizeSettings, RENDERER_VERSION } from "../renderers";
import {
  decodeSource,
  putAsset,
  removeAsset,
  type PrivateAsset,
} from "./assets";
import { getCatalogue, quote } from "./catalog";
import { designSchema, type Design, type Checkout, type Order } from "./schema";
import { ApiError, digest, newToken, tokenMatches } from "./security";
import { getRecord, listRecords, putRecord, deleteRecord } from "./store";
import { sendEmail } from "./email";
import { deleteUpload, uploadedSource } from "./uploads";
import { validatePhoto } from "./source-validation";
import { designSubjectMask, validateSubjectMask } from "./subject-masks";
import {
  checkoutArtworkAssets,
  designArtworkAssets,
  orderArtworkAssets,
} from "./artwork-assets";

export async function saveDesign(input: unknown) {
  const parsed = designSchema.parse(input);
  if (!getAvailableModes().includes(parsed.mode))
    throw new ApiError(
      409,
      "This renderer is awaiting physical validation and is not available for customer designs.",
    );
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
  const warnings = await validatePhoto(source.bytes);
  validateSubjectMask(
    parsed.subjectMask,
    {
      sourceSha256: digest(source.bytes),
      crop: parsed.crop,
      widthMm: settings.widthMm,
      heightMm: settings.heightMm,
    },
    settings,
  );
  const id = randomUUID();
  const token = newToken();
  const asset = await putAsset(
    `designs/${id}/original`,
    source.bytes,
    source.mime,
  );
  let maskAsset: PrivateAsset | undefined;
  let design: Design;
  try {
    maskAsset = parsed.subjectMask
      ? await putAsset(
          `designs/${id}/subject-mask.json`,
          Buffer.from(JSON.stringify(parsed.subjectMask)),
          "application/json",
        )
      : undefined;
    design = {
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
      subjectMask: maskAsset,
      rightsConfirmed: true,
      marketingConsent: parsed.marketingConsent,
      email: parsed.email,
      warnings,
      rendererVersion: RENDERER_VERSION,
    };
    await putRecord("designs", id, design, true);
  } catch (error) {
    // An uncertain database write may have committed; never remove its artwork.
    const saved = await getRecord<Design>("designs", id).catch(() => undefined);
    if (saved === null)
      await Promise.allSettled(
        [asset, ...(maskAsset ? [maskAsset] : [])].map(removeAsset),
      );
    throw error;
  }
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
  const otherDesigns = await listRecords<Design>("designs");
  const protectedKeys = new Set(
    [
      ...checkouts.flatMap(checkoutArtworkAssets),
      ...orders
        .filter((order) => !order.dataDeletedAt)
        .flatMap(orderArtworkAssets),
      ...otherDesigns
        .filter((other) => other.id !== id)
        .flatMap(designArtworkAssets),
    ].map((asset) => asset.key),
  );
  await Promise.all(
    designArtworkAssets(design)
      .filter((asset) => !protectedKeys.has(asset.key))
      .map(removeAsset),
  );
  await deleteRecord("designs", id);
}
export async function publicDesign(design: Design) {
  const {
    tokenHash: _,
    email: __,
    source,
    subjectMask: _maskAsset,
    ...publicFields
  } = design;
  return {
    ...publicFields,
    source: { mime: source.mime, bytes: source.bytes, sha256: source.sha256 },
    sourceUrl: `/api/designs/${design.id}/source`,
    subjectMask: await designSubjectMask(design),
  };
}
