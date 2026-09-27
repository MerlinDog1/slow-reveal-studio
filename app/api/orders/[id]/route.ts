import { type Checkout, type Order } from "@/lib/server/schema";
import { getRecord } from "@/lib/server/store";
import {
  ApiError,
  api,
  bearer,
  privateJson,
  tokenMatches,
} from "@/lib/server/security";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const id = (await context.params).id;
    const order = await getRecord<Order>("orders", id);
    const record = order ?? (await getRecord<Checkout>("checkouts", id));
    if (!record || !tokenMatches(bearer(request), record.tokenHash))
      throw new ApiError(404, "Order not found or private link is invalid.");
    return privateJson(
      order
        ? {
            id,
            paymentStatus: order.paymentStatus,
            reviewStatus: order.reviewStatus,
            amountPence: order.amountPence,
            currency: order.currency,
            createdAt: order.createdAt,
            mode: order.originalSnapshot.design.mode,
            productId: order.originalSnapshot.design.productId,
            tracking: order.tracking,
          }
        : { id, paymentStatus: "pending", reviewStatus: "awaiting-payment" },
    );
  });
}
