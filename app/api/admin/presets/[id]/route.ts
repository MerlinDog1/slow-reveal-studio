import { updatePreset } from "@/lib/server/presets";
import {
  api,
  privateJson,
  readJson,
  requireAdmin,
  requireSameOrigin,
} from "@/lib/server/security";
import { takeQuota } from "@/lib/server/rate-limit";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    requireSameOrigin(request);
    const identity = await requireAdmin(request);
    await takeQuota(identity.userId, "preset-update", 60, 3600);
    return privateJson({
      preset: await updatePreset(
        (await context.params).id,
        await readJson(request, 16384),
        identity,
      ),
    });
  });
}
