import { removeAsset, type PrivateAsset } from "./assets";
import type { Design, Checkout, Order } from "./schema";
import { deleteRecord, getRecord, listRecords, replaceOrder } from "./store";
import { ApiError } from "./security";
import { stripeClient } from "./commerce";
import { type UploadTicket, deleteUpload } from "./uploads";
import type { AnalyticsRecord } from "./analytics";

export async function expireUnpaidDesigns() {
  const [designs, checkouts, orders] = await Promise.all([
    listRecords<Design>("designs"),
    listRecords<Checkout>("checkouts"),
    listRecords<Order>("orders"),
  ]);
  const attached = new Set([
    ...checkouts.map((c) => c.design.source.key),
    ...orders
      .filter((o) => !o.dataDeletedAt)
      .flatMap((o) => [
        o.originalSnapshot.design.source.key,
        ...o.revisions.map((r) => r.package.source.key),
      ]),
  ]);
  let deleted = 0;
  let retainedForOrderReview = 0;
  for (const design of designs) {
    if (Date.parse(design.expiresAt) >= Date.now()) continue;
    if (attached.has(design.source.key)) {
      retainedForOrderReview++;
      continue;
    }
    await removeAsset(design.source);
    await deleteRecord("designs", design.id);
    deleted++;
  }
  return { deleted, retainedForOrderReview };
}
export async function eraseOrderArtwork(id: string, note: string) {
  if (note.trim().length < 10)
    throw new ApiError(
      400,
      "Record the customer request or retention reason for this erasure.",
    );
  const order = await getRecord<Order>("orders", id);
  if (!order) throw new ApiError(404, "Order not found.");
  if (order.reviewStatus !== "dispatched")
    throw new ApiError(409, "Resolve fulfilment before deleting paid artwork.");
  const assets: PrivateAsset[] = [
    order.originalSnapshot.package.archive,
    order.originalSnapshot.package.templateSvg,
    order.originalSnapshot.package.finishedSvg,
    order.originalSnapshot.package.source,
    order.originalSnapshot.design.source,
    ...order.revisions.flatMap((r) => [
      r.package.archive,
      r.package.templateSvg,
      r.package.finishedSvg,
      r.package.source,
    ]),
  ];
  const unique = new Map(assets.map((a) => [a.key, a]));
  const [otherOrders, otherCheckouts] = await Promise.all([
    listRecords<Order>("orders"),
    listRecords<Checkout>("checkouts"),
  ]);
  const protectedSources = new Set([
    ...otherOrders
      .filter((o) => o.id !== id && !o.dataDeletedAt)
      .flatMap((o) => [
        o.originalSnapshot.design.source.key,
        o.originalSnapshot.package.source.key,
        ...o.revisions.map((r) => r.package.source.key),
      ]),
    ...otherCheckouts
      .filter((c) => c.id !== id)
      .flatMap((c) => [c.design.source.key, c.package.source.key]),
  ]);
  // Mark before deleting: concurrent readers fail closed while erasure is in progress.
  const erasedAt = new Date().toISOString();
  if (!order.dataDeletedAt)
    await replaceOrder(order, {
      ...order,
      dataDeletedAt: erasedAt,
      customerEmail: undefined,
      delivery: undefined,
      audit: [
        ...order.audit,
        {
          at: erasedAt,
          action: "artwork-erasure",
          note,
          revisionId: order.currentRevisionId,
        },
      ],
    });
  let sharedSourcesRetained = 0;
  for (const asset of unique.values()) {
    if (protectedSources.has(asset.key)) {
      sharedSourcesRetained++;
      continue;
    }
    await removeAsset(asset);
  }
  return {
    deleted: true,
    sharedSourcesRetained,
    accountingMetadataRetained: true,
  };
}

export async function runRetention() {
  const [uploads, events, checkouts, orders] = await Promise.all([
    listRecords<UploadTicket>("uploads"),
    listRecords<AnalyticsRecord>("events"),
    listRecords<Checkout>("checkouts"),
    listRecords<Order>("orders"),
  ]);
  let stagedUploadsDeleted = 0;
  let analyticsBatchesDeleted = 0;
  let abandonedCheckoutsDeleted = 0;
  let checkoutsForManualReview = 0;
  let interruptedReplacementsDeleted = 0;
  for (const order of orders) {
    if (
      !order.replacementIntake ||
      Date.parse(order.replacementIntake.startedAt) > Date.now() - 86400_000
    )
      continue;
    // Claim removal first: an old worker can no longer commit this intake.
    try {
      await replaceOrder(order, { ...order, replacementIntake: undefined });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) continue;
      throw error;
    }
    await removeAsset(order.replacementIntake.source);
    interruptedReplacementsDeleted++;
  }
  for (const upload of uploads)
    if (Date.parse(upload.expiresAt) < Date.now()) {
      await deleteUpload(upload.id);
      stagedUploadsDeleted++;
    }
  for (const event of events)
    if (
      event.type === "analytics" &&
      Date.parse(event.createdAt) < Date.now() - 90 * 86400_000
    ) {
      await deleteRecord("events", event.id);
      analyticsBatchesDeleted++;
    }
  const paid = new Set(orders.map((order) => order.id));
  for (const checkout of checkouts) {
    if (
      paid.has(checkout.id) ||
      Date.parse(checkout.createdAt) > Date.now() - 7 * 86400_000
    )
      continue;
    if (!checkout.sessionId || !process.env.STRIPE_SECRET_KEY) {
      checkoutsForManualReview++;
      continue;
    }
    const session = await stripeClient().checkout.sessions.retrieve(
      checkout.sessionId,
    );
    if (session.status !== "expired" || session.payment_status !== "unpaid") {
      checkoutsForManualReview++;
      continue;
    }
    const protectedKeys = new Set([
      ...checkouts
        .filter((c) => c.id !== checkout.id)
        .flatMap((c) => [c.design.source.key, c.package.source.key]),
      ...orders
        .filter((o) => !o.dataDeletedAt)
        .flatMap((o) => [
          o.originalSnapshot.design.source.key,
          o.originalSnapshot.package.source.key,
          ...o.revisions.map((r) => r.package.source.key),
        ]),
    ]);
    for (const asset of [
      checkout.package.archive,
      checkout.package.templateSvg,
      checkout.package.finishedSvg,
      checkout.package.source,
    ])
      if (!protectedKeys.has(asset.key)) await removeAsset(asset);
    await deleteRecord("checkouts", checkout.id);
    abandonedCheckoutsDeleted++;
  }
  return {
    ...(await expireUnpaidDesigns()),
    stagedUploadsDeleted,
    analyticsBatchesDeleted,
    abandonedCheckoutsDeleted,
    checkoutsForManualReview,
    interruptedReplacementsDeleted,
  };
}
