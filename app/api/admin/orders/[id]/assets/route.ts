import { z } from "zod";
import { eraseOrderArtwork } from "@/lib/server/retention";
import {
  api,
  privateJson,
  readJson,
  requireAdmin,
  requireSameOrigin,
} from "@/lib/server/security";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    requireSameOrigin(request);
    requireAdmin(request);
    const { note } = z
      .object({ note: z.string().min(10).max(1000) })
      .strict()
      .parse(await readJson(request, 2048));
    return privateJson(
      await eraseOrderArtwork((await context.params).id, note),
    );
  });
}
