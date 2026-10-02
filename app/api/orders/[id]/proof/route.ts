import { approveCustomerProof } from "@/lib/server/replacements";
import { authorizedOrder, currentPackage } from "@/lib/server/orders";
import { getAsset, signedAssetUrl } from "@/lib/server/assets";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  ApiError,
  api,
  bearer,
  privateJson,
  readJson,
  requireSameOrigin,
} from "@/lib/server/security";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const order = await authorizedOrder(
      (await context.params).id,
      bearer(request),
    );
    const query = new URL(request.url).searchParams;
    if (
      query.get("revision") !== order.currentRevisionId ||
      order.reviewStatus === "dispatched"
    )
      throw new ApiError(409, "Refresh your order to view its current proof.");
    const view = query.get("view");
    if (view !== "finished" && view !== "template")
      throw new ApiError(400, "Choose the finished or template proof.");
    await rateLimit(request, "preview");
    const production = currentPackage(order);
    const asset =
      view === "finished" ? production.finishedSvg : production.templateSvg;
    const url = await signedAssetUrl(asset);
    if (query.get("format") === "url")
      return privateJson({
        url,
        hash: production.snapshotHash,
        revisionId: order.currentRevisionId,
        expiresIn: url ? 60 : null,
      });
    if (url)
      return new Response(null, {
        status: 307,
        headers: {
          Location: url,
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    return new Response(new Uint8Array(await getAsset(asset)), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
        "X-Studio-Proof-Hash": production.snapshotHash,
      },
    });
  });
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    requireSameOrigin(request);
    const id = (await context.params).id;
    const token = bearer(request);
    await authorizedOrder(id, token);
    await rateLimit(request, "preview");
    return privateJson(
      await approveCustomerProof(id, token, await readJson(request, 2048)),
    );
  });
}
