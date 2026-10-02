import { publishedPresets } from "@/lib/server/presets";
import { api, privateJson } from "@/lib/server/security";
export async function GET(request: Request) {
  return api(async () =>
    privateJson(
      await publishedPresets(new URL(request.url).searchParams.get("mode")),
    ),
  );
}
