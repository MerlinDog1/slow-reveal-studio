import { FINISHES, INKS, PRODUCTS, SHIPPING, type Catalogue } from "../catalog";
import { database } from "./store";
import { ApiError } from "./security";

export async function getCatalogue(): Promise<Catalogue> {
  const db = database();
  if (!db)
    return {
      products: [...PRODUCTS],
      finishes: [...FINISHES],
      inks: INKS,
      shipping: SHIPPING,
      prototype: true,
    };
  const { data, error } = await db
    .from("studio_catalogue")
    .select("definition")
    .eq("id", "current")
    .maybeSingle();
  if (error) throw new ApiError(503, "Product catalogue unavailable.");
  if (!data)
    return {
      products: [...PRODUCTS],
      finishes: [...FINISHES],
      inks: INKS,
      shipping: SHIPPING,
      prototype: true,
    };
  const value = data.definition as Catalogue;
  if (
    !Array.isArray(value.products) ||
    !Array.isArray(value.finishes) ||
    value.products.some(
      (p) =>
        !Number.isSafeInteger(p.pricePence) ||
        p.pricePence <= 0 ||
        p.widthMm <= 0 ||
        p.heightMm <= 0 ||
        p.widthMm > 1500 ||
        p.heightMm > 1500,
    )
  )
    throw new ApiError(503, "Product catalogue needs administrator review.");
  return {
    ...value,
    inks: INKS,
    shipping: SHIPPING,
    prototype: value.prototype !== false,
  };
}
export function quote(
  catalogue: Catalogue,
  productId: string,
  finishId: string,
  shippingId: string,
) {
  const product = catalogue.products.find((p) => p.id === productId);
  const finish = catalogue.finishes.find((f) => f.id === finishId);
  const shipping = SHIPPING.find((s) => s.id === shippingId);
  if (!product || !finish || !shipping)
    throw new ApiError(
      400,
      "Choose an available size, finish and shipping option.",
    );
  const itemPence = product.pricePence + finish.additionalPence;
  if (!Number.isSafeInteger(itemPence) || itemPence <= 0)
    throw new ApiError(503, "Product pricing needs review.");
  return {
    product,
    finish,
    shipping,
    itemPence,
    totalPence: itemPence + shipping.pricePence,
  };
}
