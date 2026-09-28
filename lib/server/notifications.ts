import { randomUUID } from "node:crypto";
import { sendEmail } from "./email";
import { orderStatusLink } from "./order-access";
import { ApiError, digest } from "./security";
import { getRecord, replaceOrder } from "./store";
import type { Order, OrderNotification } from "./schema";

export type NotificationTransport = typeof sendEmail;
export type NotificationResult = {
  id: string;
  type: OrderNotification["type"];
  status: OrderNotification["status"];
  message: string;
};
export function newNotification(
  type: OrderNotification["type"],
  note?: string,
  tracking?: string,
): OrderNotification {
  return {
    id: randomUUID(),
    type,
    templateVersion: 2,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    note,
    tracking,
  };
}
/** A stable UUID creates one provider idempotency key per order/revision, never per delivery attempt. */
export function revisedProofNotification(
  orderId: string,
  revisionId: string,
): OrderNotification {
  const hash = digest(`slow-reveal/revised-proof/v1:${orderId}:${revisionId}`);
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-${((parseInt(hash[16], 16) & 3) | 8).toString(16)}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  return {
    ...newNotification("revised-proof"),
    id,
    revisionId,
    templateVersion: 3,
  };
}
function proofNoticeNeeded(order: Order, notification: OrderNotification) {
  if (
    order.paymentStatus !== "paid" ||
    order.dataDeletedAt ||
    !["awaiting-review", "hold", "approved"].includes(order.reviewStatus)
  )
    return false;
  const revision = order.revisions.find(
    (item) => item.id === notification.revisionId,
  );
  return (
    !!revision?.customerProofRequired &&
    revision.id === order.currentRevisionId &&
    !order.customerProofApprovals?.some(
      (approval) =>
        approval.revisionId === revision.id &&
        approval.snapshotHash === revision.package.snapshotHash,
    )
  );
}
/** Called before the order CAS: revision and outbox entry commit together. */
export function queueRevisedProof(order: Order): {
  order: Order;
  notification?: OrderNotification;
} {
  const notification =
    order.notifications?.find(
      (item) =>
        item.type === "revised-proof" &&
        item.revisionId === order.currentRevisionId,
    ) ?? revisedProofNotification(order.id, order.currentRevisionId);
  if (!proofNoticeNeeded(order, notification)) return { order };
  const now = new Date().toISOString();
  const notifications = (order.notifications ?? []).map((item) =>
    item.type === "revised-proof" &&
    item.status === "pending" &&
    !proofNoticeNeeded(order, item)
      ? { ...item, status: "superseded" as const, supersededAt: now }
      : item,
  );
  if (!notifications.some((item) => item.id === notification.id))
    notifications.push(notification);
  return { order: { ...order, notifications }, notification };
}
export function notificationSummary(
  notification: OrderNotification,
): NotificationResult {
  return {
    id: notification.id,
    type: notification.type,
    status: notification.status,
    message:
      notification.status === "superseded"
        ? "This proof notification is no longer needed. Its revision was replaced, approved, or closed."
        : notification.status === "sent"
          ? "Customer email sent."
          : notification.status === "sending"
            ? "Customer email delivery is in progress."
            : "The order update is saved, but its customer email has not been sent. Retry the notification.",
  };
}
export function notificationMessage(
  order: Order,
  notification: OrderNotification,
) {
  const number = `SRS-${order.id.slice(0, 8).toUpperCase()}`;
  const link = orderStatusLink(order.originalSnapshot);
  if (notification.type === "revised-proof") {
    if (
      !notification.revisionId ||
      !order.revisions.some(
        (revision) =>
          revision.id === notification.revisionId &&
          revision.customerProofRequired,
      )
    )
      throw new ApiError(
        409,
        "The revised proof notification is not attached to an eligible artwork revision.",
      );
    return {
      subject: "Your revised Slow Reveal proof is ready to review",
      text: `Order ${number}\nThe studio has prepared revised artwork. Please open your private order page and review both the finished artwork and printed guide template, then approve the current proof there. Studio print approval remains a separate review.\n\nThis update concerns artwork revision ${notification.revisionId}. The link always shows the current proof and order status, including any later changes.\n\nReview your private proof: ${link}\nKeep this link private: it grants access to your order.`,
      idempotencyKey: `notification-${notification.id}`,
    };
  }
  if (notification.type === "confirmation")
    return {
      subject: "Your Slow Reveal order is awaiting review",
      text: `Payment received for order ${number}. A person will review your artwork before it is printed.\n\nView your private order status: ${link}\nKeep this link private: it grants access to your order.`,
      idempotencyKey: `notification-${notification.id}`,
    };
  if (notification.type === "dispatch")
    return {
      subject: "Your Slow Reveal kit has been dispatched",
      text: `Order ${number}\nCarrier / tracking: ${notification.tracking || "Contact the studio for tracking."}\n${notification.note || ""}\n\nYour private order status: ${link}`,
      idempotencyKey: `notification-${notification.id}`,
    };
  return {
    subject: "A photo review for your Slow Reveal order",
    text:
      notification.templateVersion === 1
        ? `Order ${number}\nWe need an alternate photo before printing. Please reply to the studio to arrange a private replacement upload.\n${notification.note || ""}\n\nYour private order status: ${link}`
        : `Order ${number}\nWe need an alternate photo before printing. Open your private order page below to upload it securely. Your original artwork is preserved. Review and approve both views of the replacement proof there; the studio will then review it before printing.\n${notification.note || ""}\n\nUpload your alternate photo and review its proof: ${link}\nKeep this link private: it grants access to your order.`,
    idempotencyKey: `notification-${notification.id}`,
  };
}
export async function deliverNotification(
  orderId: string,
  notificationId: string,
  transport: NotificationTransport = sendEmail,
): Promise<NotificationResult> {
  let order = await getRecord<Order>("orders", orderId);
  if (!order) throw new ApiError(404, "Order not found.");
  if (order.dataDeletedAt)
    throw new ApiError(
      410,
      "Artwork erasure has closed customer notifications for this order.",
    );
  const notification = order.notifications?.find(
    (item) => item.id === notificationId,
  );
  if (!notification) throw new ApiError(404, "Notification not found.");
  if (notification.status === "sent" || notification.status === "superseded")
    return notificationSummary(notification);
  if (
    notification.status === "sending" &&
    Date.parse(notification.lastAttemptAt || "") > Date.now() - 120_000
  )
    return notificationSummary(notification);
  if (
    notification.type === "revised-proof" &&
    !proofNoticeNeeded(order, notification)
  ) {
    const superseded: OrderNotification = {
      ...notification,
      status: "superseded",
      supersededAt: new Date().toISOString(),
    };
    await replaceOrder(order, {
      ...order,
      notifications: order.notifications!.map((item) =>
        item.id === notificationId ? superseded : item,
      ),
    });
    return notificationSummary(superseded);
  }
  if (!order.customerEmail)
    return {
      ...notificationSummary(notification),
      status: "pending",
      message:
        "The order update is saved, but this order has no customer email address.",
    };
  let message;
  try {
    message = notificationMessage(order, notification);
  } catch {
    return {
      ...notificationSummary(notification),
      status: "pending",
      message:
        "The order update is saved. Restore its private access key before retrying the customer email.",
    };
  }
  const claim: OrderNotification = {
    ...notification,
    status: "sending",
    attempts: notification.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
  };
  const claimed = {
    ...order,
    notifications: order.notifications!.map((item) =>
      item.id === notificationId ? claim : item,
    ),
  };
  await replaceOrder(order, claimed);
  let sent = false;
  try {
    sent = await transport(
      order.customerEmail,
      message.subject,
      message.text,
      message.idempotencyKey,
    );
  } catch {
    /* The durable pending record remains retryable. */
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    order = await getRecord<Order>("orders", orderId);
    if (!order) throw new ApiError(404, "Order not found.");
    const current = order.notifications?.find(
      (item) => item.id === notificationId,
    );
    if (!current) throw new ApiError(404, "Notification not found.");
    if (current.status === "sent") return notificationSummary(current);
    if (current.status === "superseded" && !sent)
      return notificationSummary(current);
    const final: OrderNotification = {
      ...current,
      status: sent ? "sent" : "pending",
      ...(sent ? { sentAt: new Date().toISOString() } : {}),
    };
    try {
      await replaceOrder(order, {
        ...order,
        notifications: order.notifications!.map((item) =>
          item.id === notificationId ? final : item,
        ),
      });
      return notificationSummary(final);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || attempt === 2)
        throw error;
    }
  }
  throw new ApiError(503, "The notification result needs an operator retry.");
}
