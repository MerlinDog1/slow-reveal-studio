import { runRetention } from "@/lib/server/retention";
import {
  api,
  privateJson,
  requireAdmin,
  requireSameOrigin,
} from "@/lib/server/security";
export async function POST(request: Request) {
  return api(async () => {
    requireSameOrigin(request);
    await requireAdmin(request, "operator");
    return privateJson(await runRetention());
  });
}
