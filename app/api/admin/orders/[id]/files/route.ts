import { currentPackage } from "@/lib/server/admin";
import { getAsset, signedAssetUrl } from "@/lib/server/assets";
import { type Order } from "@/lib/server/schema";
import { getRecord } from "@/lib/server/store";
import {
  ApiError,
  api,
  privateJson,
  requireAdmin,
} from "@/lib/server/security";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    requireAdmin(request);
    const id = (await context.params).id;
    const order = await getRecord<Order>("orders", id);
    if (!order) throw new ApiError(404, "Order not found.");
    if (order.dataDeletedAt)
      throw new ApiError(410, "The customer artwork has been deleted.");
    const file = new URL(request.url).searchParams.get("file") ?? "archive";
    const assets = currentPackage(order);
    const asset =
      file === "template"
        ? assets.templateSvg
        : file === "finished"
          ? assets.finishedSvg
          : file === "source"
            ? assets.source
            : assets.archive;
    const url = await signedAssetUrl(
      asset,
      file === "archive" ? `SRS-${id}.zip` : undefined,
    );
    if (url)
      return new URL(request.url).searchParams.get("format") === "url"
        ? privateJson({ url, expiresIn: 60 })
        : new Response(null, {
            status: 307,
            headers: {
              Location: url,
              "Cache-Control": "private, no-store",
              "Referrer-Policy": "no-referrer",
            },
          });
    if (new URL(request.url).searchParams.get("format") === "url")
      return privateJson({ url: null, local: true });
    return new Response(new Uint8Array(await getAsset(asset)), {
      headers: {
        "Content-Type": asset.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": `${file === "archive" ? "attachment" : "inline"}; filename="SRS-${id}-${file}.${file === "archive" ? "zip" : file === "source" ? "image" : "svg"}"`,
      },
    });
  });
}
