import { authorizedDesign } from "@/lib/server/designs";
import { renderDesign, proofHash } from "@/lib/server/production";
import { toSvg } from "@/lib/renderers";
import { api, bearer } from "@/lib/server/security";
import { rateLimit } from "@/lib/server/rate-limit";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const design = await authorizedDesign(
      (await context.params).id,
      bearer(request),
    );
    await rateLimit(request, "preview");
    const { geometry } = await renderDesign(design);
    const view =
      new URL(request.url).searchParams.get("view") === "template"
        ? "template"
        : "finished";
    return new Response(toSvg(geometry, view), {
      headers: {
        "Content-Type": "image/svg+xml",
        "X-Studio-Proof-Hash": proofHash(design, geometry),
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
