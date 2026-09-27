import { randomUUID } from "node:crypto";
import { sendEmail } from "./email";
import { orderStatusLink } from "./order-access";
import { ApiError } from "./security";
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
    templateVersion: 1,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    note,
    tracking,
  };
}
export function notificationSummary(
  notification: OrderNotification,
): NotificationResult {
  return {
    id: notification.id,
    type: notification.type,
    status: notification.status,
    message:
      notification.status === "sent"
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
    text: `Order ${number}\nWe need an alternate photo before printing. Please reply to the studio to arrange a private replacement upload.\n${notification.note || ""}\n\nYour private order status: ${link}`,
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
  if (notification.status === "sent") return notificationSummary(notification);
  if (
    notification.status === "sending" &&
    Date.parse(notification.lastAttemptAt || "") > Date.now() - 120_000
  )
    return notificationSummary(notification);
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
