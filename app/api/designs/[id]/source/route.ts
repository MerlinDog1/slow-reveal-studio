import { getAsset, signedAssetUrl } from "@/lib/server/assets";
import { authorizedDesign } from "@/lib/server/designs";
import { api, bearer } from "@/lib/server/security";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const design = await authorizedDesign(
      (await context.params).id,
      bearer(request),
    );
    const url = await signedAssetUrl(design.source);
    if (url)
      return new Response(null, {
        status: 307,
        headers: {
          Location: url,
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    return new Response(new Uint8Array(await getAsset(design.source)), {
      headers: {
        "Content-Type": design.source.mime,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
