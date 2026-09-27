import { launchGates, hasDatabase, hasStorage } from "@/lib/server/config";
import { type Design, type Order } from "@/lib/server/schema";
import { listRecords } from "@/lib/server/store";
import { api, privateJson, requireAdmin } from "@/lib/server/security";
import { analyticsSummary } from "@/lib/server/analytics";
export async function GET(request: Request) {
  return api(async () => {
    requireAdmin(request);
    const orders = await listRecords<Order>("orders");
    const designs = await listRecords<Design>("designs");
    return privateJson({
      orders: orders.map(({ tokenHash: _, ...order }) => ({
        ...order,
        originalSnapshot: {
          ...order.originalSnapshot,
          tokenHash: undefined,
          design: { ...order.originalSnapshot.design, tokenHash: undefined },
        },
      })),
      designCount: designs.length,
      analytics: await analyticsSummary(),
      configuration: {
        persistence: hasDatabase() ? "supabase" : "local-development",
        storage: hasStorage() ? "private-r2" : "local-development",
      },
      gates: launchGates(),
    });
  });
}
