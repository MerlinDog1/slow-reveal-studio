import {
  authorizedDesign,
  deleteDesign,
  publicDesign,
} from "@/lib/server/designs";
import {
  api,
  bearer,
  privateJson,
  requireSameOrigin,
} from "@/lib/server/security";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () =>
    privateJson(
      publicDesign(
        await authorizedDesign((await context.params).id, bearer(request)),
      ),
    ),
  );
}
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    requireSameOrigin(request);
    await deleteDesign((await context.params).id, bearer(request));
    return privateJson({ deleted: true });
  });
}
