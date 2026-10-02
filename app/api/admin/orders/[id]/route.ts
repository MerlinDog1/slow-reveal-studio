import { updateOrder } from "@/lib/server/admin";
import { requireAdminRole } from "@/lib/server/admin-auth";
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
    const identity = await requireAdmin(request);
    const body = await readJson(request, 16384);
    if (
      body &&
      typeof body === "object" &&
      "action" in body &&
      body.action === "dispatch"
    )
      requireAdminRole(identity, "operator");
    const { order, notification } = await updateOrder(
      (await context.params).id,
      body,
      undefined,
      undefined,
      identity,
    );
    return privateJson({
      id: order.id,
      reviewStatus: order.reviewStatus,
      currentRevisionId: order.currentRevisionId,
      notification,
    });
  });
}
