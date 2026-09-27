import { z } from "zod";
import {
  cropSchema,
  settingsSchema,
  type Order,
  type Revision,
} from "./schema";
import { getRecord, replaceOrder } from "./store";
import { ApiError } from "./security";
import { createProductionPackage } from "./production";
import { normalizeSettings } from "../renderers";
import {
  deliverNotification,
  newNotification,
  type NotificationResult,
  type NotificationTransport,
} from "./notifications";

const actionSchema = z
  .object({
    action: z.enum([
      "approve",
      "hold",
      "request-photo",
      "regenerate",
      "dispatch",
      "retry-notification",
    ]),
    note: z.string().max(1000).default(""),
    settings: settingsSchema.optional(),
    crop: cropSchema.optional(),
    revision: z.string().max(100).optional(),
    tracking: z.string().max(200).optional(),
    notificationId: z.string().uuid().optional(),
  })
  .strict();
export function applyReviewAction(
  order: Order,
  action: "approve" | "hold" | "request-photo" | "dispatch",
  note: string,
  tracking?: string,
): Order {
  if (
    action === "dispatch" &&
    (order.reviewStatus !== "approved" ||
      order.approvedRevisionId !== order.currentRevisionId)
  )
    throw new ApiError(
      409,
      "Approve the current artwork revision before dispatch.",
    );
  if (order.reviewStatus === "dispatched")
    throw new ApiError(409, "This order has already been dispatched.");
  if (action === "dispatch" && !tracking)
    throw new ApiError(
      400,
      "Add the carrier and tracking reference before dispatch.",
    );
  const reviewStatus =
    action === "approve"
      ? "approved"
      : action === "hold"
        ? "hold"
        : action === "request-photo"
          ? "alternate-photo-requested"
          : "dispatched";
  return {
    ...order,
    reviewStatus,
    approvedRevisionId:
      action === "approve"
        ? order.currentRevisionId
        : action === "dispatch"
          ? order.approvedRevisionId
          : undefined,
    tracking: tracking || order.tracking,
    audit: [
      ...order.audit,
      {
        at: new Date().toISOString(),
        action,
        note,
        revisionId: order.currentRevisionId,
      },
    ],
  };
}
export async function updateOrder(
  id: string,
  input: unknown,
  transport?: NotificationTransport,
): Promise<{ order: Order; notification?: NotificationResult }> {
  const body = actionSchema.parse(input);
  const order = await getRecord<Order>("orders", id);
  if (!order) throw new ApiError(404, "Order not found.");
  if (order.dataDeletedAt)
    throw new ApiError(
      410,
      "The customer artwork was deleted after fulfilment.",
    );
  if (body.revision && body.revision !== order.currentRevisionId)
    throw new ApiError(
      409,
      "This artwork has changed. Reload the latest revision.",
    );
  if (body.action === "retry-notification") {
    if (!body.notificationId)
      throw new ApiError(
        400,
        "Choose the pending customer notification to retry.",
      );
    const notification = await deliverNotification(
      id,
      body.notificationId,
      transport,
    );
    return { order: (await getRecord<Order>("orders", id))!, notification };
  }
  let next: Order;
  if (body.action === "regenerate") {
    if (order.reviewStatus === "dispatched")
      throw new ApiError(409, "Dispatched artwork cannot be regenerated.");
    const design = order.originalSnapshot.design;
    const latest = order.revisions.find(
      (revision) => revision.id === order.currentRevisionId,
    );
    const base = latest?.settings ?? design.settings;
    const settings = normalizeSettings({
      ...(body.settings ?? base),
      widthMm: base.widthMm,
      heightMm: base.heightMm,
      mode: base.mode,
      inkColor: base.inkColor,
    });
    const crop = body.crop ?? latest?.crop ?? design.crop;
    const production = await createProductionPackage(
      design,
      id,
      settings,
      crop,
    );
    const revision: Revision = {
      id: String(production.manifest.revisionId),
      createdAt: new Date().toISOString(),
      package: production,
      settings,
      crop,
      note: body.note,
    };
    next = {
      ...order,
      revisions: [...order.revisions, revision],
      currentRevisionId: revision.id,
      approvedRevisionId: undefined,
      reviewStatus: "awaiting-review",
      audit: [
        ...order.audit,
        {
          at: new Date().toISOString(),
          action: "regenerate",
          note: body.note,
          revisionId: revision.id,
        },
      ],
    };
  } else {
    if (
      body.action === "approve" &&
      process.env.PHYSICAL_VALIDATION_APPROVED !== "true"
    )
      throw new ApiError(
        409,
        "Physical validation must be approved before print approval.",
      );
    next = applyReviewAction(order, body.action, body.note, body.tracking);
  }
  const customerNotification =
    body.action === "dispatch" || body.action === "request-photo"
      ? newNotification(body.action, body.note, body.tracking)
      : undefined;
  if (customerNotification)
    next.notifications = [...(next.notifications ?? []), customerNotification];
  await replaceOrder(order, next);
  let notification: NotificationResult | undefined;
  if (body.action === "dispatch" || body.action === "request-photo") {
    notification = await deliverNotification(
      id,
      customerNotification!.id,
      transport,
    );
  }
  return {
    order: (await getRecord<Order>("orders", id))!,
    ...(notification ? { notification } : {}),
  };
}
export function currentPackage(order: Order) {
  return (
    order.revisions.find((revision) => revision.id === order.currentRevisionId)
      ?.package ?? order.originalSnapshot.package
  );
}
