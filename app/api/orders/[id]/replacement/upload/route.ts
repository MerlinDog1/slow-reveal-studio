import { createReplacementUpload } from "@/lib/server/replacements";
import { authorizedOrder } from "@/lib/server/orders";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  api,
  bearer,
  privateJson,
  readJson,
  requireSameOrigin,
} from "@/lib/server/security";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    requireSameOrigin(request);
    const id = (await context.params).id;
    const token = bearer(request);
    await authorizedOrder(id, token);
    await rateLimit(request, "upload");
    return privateJson(
      await createReplacementUpload(id, token, await readJson(request, 4096)),
      201,
    );
  });
}
