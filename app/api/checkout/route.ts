import { beginCheckout } from "@/lib/server/commerce";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  api,
  privateJson,
  readJson,
  requireSameOrigin,
} from "@/lib/server/security";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  return api(async () => {
    requireSameOrigin(request);
    await rateLimit(request, "checkout");
    return privateJson(await beginCheckout(await readJson(request, 4096)));
  });
}
