import { z } from "zod";
import type { AdminIdentity } from "./admin-auth";
import { randomUUID } from "node:crypto";
import {
  cropSchema,
  settingsSchema,
  type Order,
  type Revision,
  type Package,
} from "./schema";
import { getRecord, replaceOrder } from "./store";
import { ApiError } from "./security";
import { createProductionPackage } from "./production";
import { effectiveGuideColor, normalizeSettings } from "../renderers";
import { designSubjectMask } from "./subject-masks";
import {
  currentRevision,
  currentPackage,
  customerProofApproved,
  discardUncommittedPackage,
} from "./orders";
export { currentPackage } from "./orders";
import {
  deliverNotification,
  newNotification,
  queueRevisedProof,
  notificationSummary,
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
    clearSubjectMask: z.boolean().optional(),
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
    (action === "approve" || action === "dispatch") &&
    (currentRevision(order)?.settings ?? order.originalSnapshot.design.settings)
      .invert
  )
    throw new ApiError(
      409,
      "Inverted dark-canvas production is not supported. Turn off inversion, regenerate the artwork, then obtain new customer proof approval.",
    );
  if (
    (action === "approve" || action === "dispatch") &&
    !customerProofApproved(order)
  )
    throw new ApiError(
      409,
      "The customer must approve both views of this replacement proof before print approval.",
    );
  if (
    action === "approve" &&
    order.reviewStatus === "alternate-photo-requested"
  )
    throw new ApiError(
      409,
      "Resolve the requested alternate photo before print approval.",
    );
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
    ...(action === "request-photo"
      ? {
          photoRequest: {
            id: randomUUID(),
            revisionId: order.currentRevisionId,
            requestedAt: new Date().toISOString(),
            note,
          },
        }
      : {}),
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
  produce = createProductionPackage,
  actor?: AdminIdentity,
): Promise<{ order: Order; notification?: NotificationResult }> {
  const body = actionSchema.parse(input);
  if (body.clearSubjectMask !== undefined && body.action !== "regenerate")
    throw new ApiError(
      400,
      "Subject masks can only be cleared in a new artwork revision.",
    );
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
    if (actor)
      await replaceOrder(order, {
        ...order,
        audit: [
          ...order.audit,
          {
            at: new Date().toISOString(),
            action: "retry-notification",
            note: "Administrator retried the existing customer notification.",
            revisionId: order.currentRevisionId,
            actorId: actor.userId,
            actorKind: actor.kind,
          },
        ],
      });
    const notification = await deliverNotification(
      id,
      body.notificationId,
      transport,
    );
    return { order: (await getRecord<Order>("orders", id))!, notification };
  }
  let next: Order;
  let uncommitted: Package | undefined;
  if (body.action === "regenerate") {
    if (order.reviewStatus === "dispatched")
      throw new ApiError(409, "Dispatched artwork cannot be regenerated.");
    const latest = currentRevision(order);
    const current = currentPackage(order);
    const currentMask =
      current.subjectMask ??
      latest?.subjectMask ??
      (!latest ? order.originalSnapshot.design.subjectMask : undefined);
    const design = {
      ...order.originalSnapshot.design,
      source: current.source,
      subjectMask: body.clearSubjectMask ? undefined : currentMask,
      warnings: Array.isArray(current.manifest.sourceWarnings)
        ? current.manifest.sourceWarnings.filter(
            (item): item is string => typeof item === "string",
          )
        : latest
          ? []
          : order.originalSnapshot.design.warnings,
    };
    const base = latest?.settings ?? design.settings;
    const settings = normalizeSettings({
      ...(body.settings ?? base),
      widthMm: base.widthMm,
      heightMm: base.heightMm,
      mode: base.mode,
      inkColor: base.inkColor,
      ...(body.clearSubjectMask ? { subjectMaskStrength: 0 } : {}),
    });
    if (settings.invert)
      throw new ApiError(
        409,
        "Inverted dark-canvas production is not supported. Turn off inversion, regenerate the artwork, then obtain new customer proof approval.",
      );
    const crop = body.crop ?? latest?.crop ?? design.crop;
    await designSubjectMask(design, settings, crop);
    const production = await produce(design, id, settings, crop);
    uncommitted = production;
    const revision: Revision = {
      id: String(production.manifest.revisionId),
      createdAt: new Date().toISOString(),
      package: production,
      settings,
      crop,
      subjectMask: production.subjectMask,
      note: body.note,
      origin: "admin-regeneration",
      customerProofRequired:
        latest?.customerProofRequired ||
        base.invert !== settings.invert ||
        (base.detailPreservation ?? 0) !== (settings.detailPreservation ?? 0) ||
        effectiveGuideColor(base) !== effectiveGuideColor(settings) ||
        (!!currentMask &&
          (body.clearSubjectMask === true ||
            (base.subjectMaskStrength ?? 0) !==
              (settings.subjectMaskStrength ?? 0))),
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
  let customerNotification =
    body.action === "dispatch" || body.action === "request-photo"
      ? newNotification(body.action, body.note, body.tracking)
      : undefined;
  if (body.action === "regenerate") {
    const queued = queueRevisedProof(next);
    next = queued.order;
    customerNotification = queued.notification;
  }
  if (actor)
    next.audit = next.audit.map((entry, index) =>
      index < order.audit.length
        ? entry
        : { ...entry, actorId: actor.userId, actorKind: actor.kind },
    );
  if (
    customerNotification &&
    !next.notifications?.some((item) => item.id === customerNotification!.id)
  )
    next.notifications = [...(next.notifications ?? []), customerNotification];
  try {
    await replaceOrder(order, next);
  } catch (error) {
    if (uncommitted) await discardUncommittedPackage(id, uncommitted);
    throw error;
  }
  let notification: NotificationResult | undefined;
  if (customerNotification) {
    try {
      notification = await deliverNotification(
        id,
        customerNotification.id,
        transport,
      );
    } catch {
      // Artwork already committed. Surface the durable outbox rather than suggesting regeneration be retried.
      const latest = await getRecord<Order>("orders", id).catch(() => null);
      const saved =
        latest?.notifications?.find(
          (item) => item.id === customerNotification!.id,
        ) ?? customerNotification;
      notification = notificationSummary(saved);
      if (saved.status !== "sent" && saved.status !== "superseded")
        notification.message =
          "The order update is saved, but customer email delivery could not be confirmed. Retry this notification; do not regenerate the artwork again.";
    }
  }
  return {
    order: (await getRecord<Order>("orders", id).catch(() => null)) ?? next,
    ...(notification ? { notification } : {}),
  };
}
