import { collectAnalytics } from "@/lib/server/analytics";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  api,
  privateJson,
  readJson,
  requireSameOrigin,
} from "@/lib/server/security";
export async function POST(request: Request) {
  return api(async () => {
    requireSameOrigin(request);
    await rateLimit(request, "analytics");
    return privateJson(await collectAnalytics(await readJson(request, 16384)));
  });
}
