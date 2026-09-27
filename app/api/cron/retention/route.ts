import { runRetention } from "@/lib/server/retention";
import {
  ApiError,
  api,
  bearer,
  digest,
  privateJson,
  tokenMatches,
} from "@/lib/server/security";
export const maxDuration = 120;
export async function GET(request: Request) {
  return api(async () => {
    const secret = process.env.CRON_SECRET;
    if (
      !secret ||
      secret.length < 32 ||
      !tokenMatches(bearer(request), digest(secret))
    )
      throw new ApiError(401, "A scheduler token is required.");
    return privateJson(await runRetention());
  });
}
