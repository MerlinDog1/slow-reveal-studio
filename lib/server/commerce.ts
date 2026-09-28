import Stripe from "stripe";
import { ApiError } from "./security";
import { getRecord, putRecord } from "./store";
import type { Checkout, Order } from "./schema";
import { recordPaymentAnalytics } from "./analytics";
import {
  deliverNotification,
  newNotification,
  type NotificationTransport,
} from "./notifications";
import type { Product } from "../catalog";
import type { RenderSettings } from "../renderers";

export function assertProductDimensions(
  settings: Pick<RenderSettings, "widthMm" | "heightMm">,
  product: Product,
) {
  if (!(
    (settings.widthMm === product.widthMm &&
      settings.heightMm === product.heightMm) ||
    (settings.widthMm === product.heightMm &&
      settings.heightMm === product.widthMm)
  ))
    throw new ApiError(
      409,
      "This product size has changed since the design was saved. Reopen the studio, save a new design and approve its updated proof.",
    );
}

export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new ApiError(503, "Stripe is not configured.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
export { beginCheckout } from "./checkout-attempts";
/** Called only after signature verification. A browser redirect has no route to this function. */
export function validatePaidSession(
  session: Stripe.Checkout.Session,
  checkout: Checkout,
) {
  const discount = session.total_details?.amount_discount ?? 0;
  if (
    session.payment_status !== "paid" ||
    session.mode !== "payment" ||
    session.currency !== "gbp" ||
    session.id !== checkout.sessionId ||
    session.client_reference_id !== checkout.id ||
    session.metadata?.orderId !== checkout.id ||
    session.metadata?.snapshotHash !== checkout.package.snapshotHash ||
    !Number.isSafeInteger(discount) ||
    discount < 0 ||
    session.amount_total !== checkout.amountPence - discount ||
    (session.amount_total ?? 0) < 0
  )
    throw new ApiError(400, "Payment does not match the immutable checkout.");
}
export async function fulfillVerifiedSession(
  session: Stripe.Checkout.Session,
  transport?: NotificationTransport,
) {
  const id = session.metadata?.orderId;
  if (!id || !/^[0-9a-f-]{36}$/.test(id))
    throw new ApiError(400, "Unknown checkout.");
  const checkout = await getRecord<Checkout>("checkouts", id);
  if (!checkout)
    throw new ApiError(503, "Checkout is not ready; retry this webhook.");
  // A verified webhook can recover a crash between Stripe session creation and storing its ID.
  validatePaidSession(
    session,
    checkout.sessionId ? checkout : { ...checkout, sessionId: session.id },
  );
  if (!checkout.sessionId) {
    checkout.sessionId = session.id;
    await putRecord("checkouts", id, checkout);
  }
  const originalRevision = String(checkout.package.manifest.revisionId);
  const order: Order = {
    id,
    createdAt: new Date().toISOString(),
    tokenHash: checkout.tokenHash,
    stripeSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id,
    paymentStatus: "paid",
    amountPence: session.amount_total!,
    currency: "gbp",
    originalSnapshot: checkout,
    reviewStatus: "awaiting-review",
    revisions: [],
    currentRevisionId: originalRevision,
    customerEmail: session.customer_details?.email ?? undefined,
    delivery:
      session.collected_information?.shipping_details ??
      session.customer_details,
    audit: [
      {
        at: new Date().toISOString(),
        action: "payment-verified",
        note: "Verified Stripe webhook; human production review required.",
        revisionId: originalRevision,
      },
    ],
    notifications: [newNotification("confirmation")],
  };
  const inserted = await putRecord("orders", id, order, true);
  await recordPaymentAnalytics(checkout);
  const stored = inserted ? order : await getRecord<Order>("orders", id);
  if (stored?.dataDeletedAt) return { orderId: id, inserted, emailSent: false };
  const confirmation = stored?.notifications?.find(
    (notification) => notification.type === "confirmation",
  );
  const notification = confirmation
    ? await deliverNotification(id, confirmation.id, transport)
    : undefined;
  const emailSent = notification?.status === "sent";
  if (stored?.customerEmail && !emailSent)
    throw new ApiError(
      503,
      "Order saved; confirmation delivery needs a webhook retry.",
    );
  return { orderId: id, inserted, emailSent };
}
