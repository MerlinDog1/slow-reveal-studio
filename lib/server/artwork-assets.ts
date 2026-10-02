import type { PrivateAsset } from "./assets";
import type { Checkout, Design, Order, Package } from "./schema";

export function designArtworkAssets(design: Design): PrivateAsset[] {
  return [design.source, ...(design.subjectMask ? [design.subjectMask] : [])];
}
export function packageAssets(artwork: Package): PrivateAsset[] {
  return [
    artwork.source,
    artwork.archive,
    artwork.templateSvg,
    artwork.finishedSvg,
    ...(artwork.subjectMask ? [artwork.subjectMask] : []),
  ];
}
export function checkoutArtworkAssets(checkout: Checkout): PrivateAsset[] {
  return [
    ...designArtworkAssets(checkout.design),
    ...packageAssets(checkout.package),
  ];
}
export function orderArtworkAssets(order: Order): PrivateAsset[] {
  return [
    ...checkoutArtworkAssets(order.originalSnapshot),
    ...order.revisions.flatMap((revision) => [
      ...packageAssets(revision.package),
      ...(revision.subjectMask ? [revision.subjectMask] : []),
    ]),
  ];
}
