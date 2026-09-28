import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  cropSchema,
  sourceInputSchema,
  type Order,
  type Package,
  type Revision,
} from "./schema";
import { ApiError, digest } from "./security";
import { getRecord, replaceOrder } from "./store";
import { decodeSource, putAsset, removeAsset } from "./assets";
import { createUpload, deleteUpload, uploadedSource } from "./uploads";
import { validatePhoto } from "./source-validation";
import { createProductionPackage } from "./production";
import {
  authorizedOrder,
  currentRevision,
  currentPackage,
  orderArtworkStatus,
  discardUncommittedPackage,
} from "./orders";
import { takeQuota } from "./rate-limit";

const replacementSchema = z
  .object({
    requestId: z.string().uuid(),
    expectedRevisionId: z.string().max(100),
    submissionId: z.string().uuid(),
    rightsConfirmed: z.literal(true),
    crop: cropSchema,
    source: sourceInputSchema,
  })
  .strict();
const uploadSchema = z
  .object({
    requestId: z.string().uuid(),
    expectedRevisionId: z.string().max(100),
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    bytes: z
      .number()
      .int()
      .positive()
      .max(8 * 1024 * 1024),
  })
  .strict();

function assertRequest(order: Order, requestId: string, revisionId: string) {
  if (
    order.dataDeletedAt ||
    order.reviewStatus !== "alternate-photo-requested" ||
    order.currentRevisionId !== revisionId ||
    order.photoRequest?.id !== requestId ||
    order.photoRequest.revisionId !== revisionId ||
    order.photoRequest.submittedRevisionId
  )
    throw new ApiError(
      409,
      "This replacement request is no longer current. Refresh your order status.",
    );
}
export async function createReplacementUpload(
  id: string,
  token: string | null,
  input: unknown,
) {
  const order = await authorizedOrder(id, token);
  const body = uploadSchema.parse(input);
  assertRequest(order, body.requestId, body.expectedRevisionId);
  await takeQuota(id, "replacement-upload", 6, 3600);
  return createUpload(
    { mime: body.mime, bytes: body.bytes },
    { orderId: id, requestId: body.requestId },
  );
}

/** A claimed intake and a compare-and-swap commit prevent stale requests from replacing newer artwork. */
export async function submitReplacement(
  id: string,
  token: string | null,
  input: unknown,
  produce = createProductionPackage,
) {
  let order = await authorizedOrder(id, token);
  const body = replacementSchema.parse(input);
  const inputHash = digest(JSON.stringify(body));
  const completed = order.revisions.find(
    (revision) => revision.submissionId === body.submissionId,
  );
  if (completed) {
    if (
      completed.replacementInputHash !== inputHash ||
      completed.replacementRequestId !== body.requestId
    )
      throw new ApiError(
        409,
        "This submission identifier was used for different artwork.",
      );
    return {
      state: "saved" as const,
      revisionId: completed.id,
      ...orderArtworkStatus(order),
    };
  }
  assertRequest(order, body.requestId, body.expectedRevisionId);
  const active = order.replacementIntake;
  if (active && Date.parse(active.startedAt) > Date.now() - 10 * 60_000) {
    if (
      active.submissionId !== body.submissionId ||
      active.inputHash !== inputHash
    )
      throw new ApiError(
        409,
        "A replacement photo is already being processed for this order.",
      );
    return { state: "processing" as const, ...orderArtworkStatus(order) };
  }
  await takeQuota(id, "replacement-render", 3, 3600);
  const leaseId = randomUUID();
  // Register the staging key before writing it so cron can remove interrupted intake assets.
  const staging = {
    key: `staging/order-replacements/${id}/${leaseId}/original`,
    mime: "application/octet-stream",
    bytes: 0,
    sha256: "",
  };
  const claim = {
    submissionId: body.submissionId,
    requestId: body.requestId,
    baseRevisionId: body.expectedRevisionId,
    inputHash,
    leaseId,
    startedAt: new Date().toISOString(),
    source: staging,
  };
  await replaceOrder(order, { ...order, replacementIntake: claim });
  if (active) await removeAsset(active.source).catch(() => {});
  let production: Package | undefined;
  let committed = false;
  try {
    const source =
      "dataUrl" in body.source
        ? decodeSource(body.source.dataUrl)
        : await uploadedSource(body.source.uploadId, body.source.token, {
            orderId: id,
            requestId: body.requestId,
          });
    const warnings = await validatePhoto(source.bytes);
    const asset = await putAsset(staging.key, source.bytes, source.mime);
    const latest = currentRevision(order);
    const design = {
      ...order.originalSnapshot.design,
      settings: {
        ...(latest?.settings ?? order.originalSnapshot.design.settings),
        subjectMaskStrength: 0,
      },
      crop: body.crop,
      source: asset,
      subjectMask: undefined,
      warnings,
      rightsConfirmed: true as const,
    };
    production = await produce(design, id);
    const now = new Date().toISOString();
    const revision: Revision = {
      id: String(production.manifest.revisionId),
      createdAt: now,
      package: production,
      settings: design.settings,
      crop: body.crop,
      note: "Customer supplied a requested alternate photo; customer proof and studio print review required.",
      origin: "customer-replacement",
      submissionId: body.submissionId,
      replacementRequestId: body.requestId,
      replacementInputHash: inputHash,
      customerProofRequired: true,
    };
    for (let attempt = 0; attempt < 4; attempt++) {
      order = await authorizedOrder(id, token);
      assertRequest(order, body.requestId, body.expectedRevisionId);
      if (order.replacementIntake?.leaseId !== leaseId)
        throw new ApiError(
          409,
          "This replacement intake was superseded. Refresh your order.",
        );
      try {
        await replaceOrder(order, {
          ...order,
          revisions: [...order.revisions, revision],
          currentRevisionId: revision.id,
          approvedRevisionId: undefined,
          reviewStatus: "awaiting-review",
          replacementIntake: undefined,
          photoRequest: {
            ...order.photoRequest!,
            submittedRevisionId: revision.id,
            fulfilledAt: now,
          },
          audit: [
            ...order.audit,
            {
              at: now,
              action: "customer-replacement",
              note: revision.note,
              revisionId: revision.id,
            },
          ],
        });
        committed = true;
        break;
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          error.status !== 409 ||
          attempt === 3
        )
          throw error;
      }
    }
    if ("uploadId" in body.source)
      await deleteUpload(body.source.uploadId).catch(() => {});
    order = await authorizedOrder(id, token);
    return {
      state: "saved" as const,
      revisionId: revision.id,
      ...orderArtworkStatus(order),
    };
  } finally {
    await removeAsset(staging).catch(() => {});
    if (!committed && production)
      await discardUncommittedPackage(id, production);
    if (!committed) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const latest = await getRecord<Order>("orders", id);
        if (!latest || latest.replacementIntake?.leaseId !== leaseId) break;
        try {
          await replaceOrder(latest, {
            ...latest,
            replacementIntake: undefined,
          });
          break;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) break;
        }
      }
    }
  }
}

const approvalSchema = z
  .object({
    revisionId: z.string().max(100),
    proofHash: z.string().regex(/^[a-f0-9]{64}$/),
    proofApproved: z.literal(true),
  })
  .strict();
export async function approveCustomerProof(
  id: string,
  token: string | null,
  input: unknown,
) {
  const body = approvalSchema.parse(input);
  for (let attempt = 0; attempt < 4; attempt++) {
    const order = await authorizedOrder(id, token);
    const revision = currentRevision(order);
    if (
      order.reviewStatus === "dispatched" ||
      order.reviewStatus === "alternate-photo-requested" ||
      revision?.id !== body.revisionId ||
      !revision.customerProofRequired ||
      currentPackage(order).snapshotHash !== body.proofHash
    )
      throw new ApiError(
        409,
        "This proof is no longer current. Review both views of the latest revision.",
      );
    if (
      order.customerProofApprovals?.some(
        (item) =>
          item.revisionId === body.revisionId &&
          item.snapshotHash === body.proofHash,
      )
    )
      return orderArtworkStatus(order);
    const now = new Date().toISOString();
    const next = {
      ...order,
      customerProofApprovals: [
        ...(order.customerProofApprovals ?? []),
        {
          revisionId: body.revisionId,
          snapshotHash: body.proofHash,
          approvedAt: now,
        },
      ],
      audit: [
        ...order.audit,
        {
          at: now,
          action: "customer-proof-approved",
          note: "Customer approved the finished and template proof; studio print review is still required.",
          revisionId: body.revisionId,
        },
      ],
    };
    try {
      await replaceOrder(order, next);
      return orderArtworkStatus(next);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || attempt === 3)
        throw error;
    }
  }
  throw new ApiError(409, "The proof changed. Refresh your order.");
}
