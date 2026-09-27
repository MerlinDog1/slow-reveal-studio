import { updateOrder } from "@/lib/server/admin";
import {
  api,
  privateJson,
  readJson,
  requireAdmin,
  requireSameOrigin,
} from "@/lib/server/security";
export const maxDuration = 120;
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    requireSameOrigin(request);
    requireAdmin(request);
    const { order, notification } = await updateOrder(
      (await context.params).id,
      await readJson(request, 16384),
    );
    return privateJson({
      id: order.id,
      reviewStatus: order.reviewStatus,
      currentRevisionId: order.currentRevisionId,
      notification,
    });
  });
}
