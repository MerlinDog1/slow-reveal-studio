import type { Order, Package } from "./schema";
import { getRecord } from "./store";
import { ApiError, tokenMatches } from "./security";
import { hasStorage } from "./config";
import { removeAsset } from "./assets";

/** An uncertain database response must never cause deletion of artwork that may have committed. */
export async function discardUncommittedPackage(
  id: string,
  production: Package,
) {
  let order: Order | null;
  try {
    order = await getRecord<Order>("orders", id);
  } catch {
    return;
  }
  if (
    !order ||
    [
      order.originalSnapshot.package,
      ...order.revisions.map((revision) => revision.package),
    ].some((item) => item.archive.key === production.archive.key)
  )
    return;
  await Promise.allSettled(
    [
      production.source,
      production.archive,
      production.templateSvg,
      production.finishedSvg,
    ].map(removeAsset),
  );
}

export async function authorizedOrder(
  id: string,
  token: string | null,
): Promise<Order> {
  const order = await getRecord<Order>("orders", id);
  if (!order || !tokenMatches(token, order.tokenHash))
    throw new ApiError(404, "Order not found or private link is invalid.");
  if (order.paymentStatus !== "paid")
    throw new ApiError(
      409,
      "Payment must be confirmed before changing artwork.",
    );
  if (order.dataDeletedAt)
    throw new ApiError(410, "The artwork for this order has been erased.");
  return order;
}
export function currentRevision(order: Order) {
  return order.revisions.find(
    (revision) => revision.id === order.currentRevisionId,
  );
}
export function currentPackage(order: Order) {
  return currentRevision(order)?.package ?? order.originalSnapshot.package;
}
export function customerProofApproved(order: Order) {
  const revision = currentRevision(order);
  return (
    !revision?.customerProofRequired ||
    !!order.customerProofApprovals?.some(
      (approval) =>
        approval.revisionId === revision.id &&
        approval.snapshotHash === revision.package.snapshotHash,
    )
  );
}
export function orderArtworkStatus(order: Order) {
  const revision = currentRevision(order);
  const settings = revision?.settings ?? order.originalSnapshot.design.settings;
  const available = !order.dataDeletedAt && order.reviewStatus !== "dispatched";
  return {
    currentRevisionId: order.currentRevisionId,
    dimensionsMm: { width: settings.widthMm, height: settings.heightMm },
    replacement: {
      requestId: order.photoRequest?.id,
      revisionId: order.photoRequest?.revisionId,
      note: order.photoRequest?.note,
      allowed:
        available &&
        order.reviewStatus === "alternate-photo-requested" &&
        !order.photoRequest?.submittedRevisionId &&
        order.photoRequest?.revisionId === order.currentRevisionId,
      processing:
        !!order.replacementIntake &&
        Date.parse(order.replacementIntake.startedAt) >
          Date.now() - 10 * 60_000,
      directUploads: hasStorage(),
    },
    proof: {
      revisionId: order.currentRevisionId,
      hash: available ? currentPackage(order).snapshotHash : undefined,
      requiresApproval:
        available &&
        order.reviewStatus !== "alternate-photo-requested" &&
        !!revision?.customerProofRequired,
      approved: customerProofApproved(order),
    },
  };
}
