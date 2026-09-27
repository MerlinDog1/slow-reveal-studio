import { saveDesign } from "@/lib/server/designs";
import {
  api,
  privateJson,
  readJson,
  requireSameOrigin,
} from "@/lib/server/security";
import { rateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    requireSameOrigin(request);
    await rateLimit(request, "save");
    return privateJson(await saveDesign(await readJson(request)), 201);
  });
}
