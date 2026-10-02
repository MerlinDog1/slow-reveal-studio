import { createPreset, listAdminPresets } from "@/lib/server/presets";
import {
  api,
  privateJson,
  readJson,
  requireAdmin,
  requireSameOrigin,
} from "@/lib/server/security";
import { takeQuota } from "@/lib/server/rate-limit";
export async function GET(request: Request) {
  return api(async () => {
    await requireAdmin(request);
    return privateJson({ presets: await listAdminPresets() });
  });
}
export async function POST(request: Request) {
  return api(async () => {
    requireSameOrigin(request);
    const identity = await requireAdmin(request);
    await takeQuota(identity.userId, "preset-create", 30, 3600);
    return privateJson(
      { preset: await createPreset(await readJson(request, 16384), identity) },
      201,
    );
  });
}
