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
    await requireAdmin(request);
    const id = (await context.params).id;
    const order = await getRecord<Order>("orders", id);
    if (!order) throw new ApiError(404, "Order not found.");
    if (order.dataDeletedAt)
      throw new ApiError(410, "The customer artwork has been deleted.");
    const query = new URL(request.url).searchParams;
    if (query.get("revision") !== order.currentRevisionId)
      throw new ApiError(
        409,
        "The artwork revision changed. Refresh the production desk and review the latest proofs.",
      );
    const file = query.get("file") ?? "archive";
    if (!["source", "finished", "template", "archive"].includes(file))
      throw new ApiError(
        400,
        "Choose a source, finished proof, template or archive.",
      );
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
      return query.get("format") === "url"
        ? privateJson({
            url,
            expiresIn: 60,
            revisionId: order.currentRevisionId,
          })
        : new Response(null, {
            status: 307,
            headers: {
              Location: url,
              "Cache-Control": "private, no-store",
              "Referrer-Policy": "no-referrer",
            },
          });
    if (query.get("format") === "url")
      return privateJson({
        url: null,
        local: true,
        revisionId: order.currentRevisionId,
      });
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
