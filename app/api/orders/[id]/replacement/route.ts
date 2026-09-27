import { submitReplacement } from "@/lib/server/replacements";
import { authorizedOrder } from "@/lib/server/orders";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  api,
  bearer,
  privateJson,
  readJson,
  requireSameOrigin,
} from "@/lib/server/security";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    requireSameOrigin(request);
    const id = (await context.params).id;
    const token = bearer(request);
    await authorizedOrder(id, token);
    await rateLimit(request, "save");
    const result = await submitReplacement(id, token, await readJson(request));
    return privateJson(result, result.state === "processing" ? 202 : 201);
  });
}
