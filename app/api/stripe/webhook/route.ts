import Stripe from "stripe";
import { fulfillVerifiedSession, stripeClient } from "@/lib/server/commerce";
import { ApiError, api, privateJson, readBody } from "@/lib/server/security";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      throw new ApiError(503, "Webhook not configured.");
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new ApiError(400, "Missing webhook signature.");
    let event: Stripe.Event;
    const body = await readBody(request, 1024 * 1024);
    try {
      event = stripeClient().webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new ApiError(400, "Invalid webhook signature.");
    }
    if (
      process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") !== event.livemode
    )
      throw new ApiError(400, "Webhook environment mismatch.");
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid")
        await fulfillVerifiedSession(session);
    }
    return privateJson({ received: true });
  });
}
