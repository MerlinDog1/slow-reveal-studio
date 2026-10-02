import { createUpload } from "@/lib/server/uploads";
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
    await rateLimit(request, "upload");
    return privateJson(await createUpload(await readJson(request, 2048)), 201);
  });
}
