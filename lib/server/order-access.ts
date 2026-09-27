import { createHmac } from "node:crypto";
import { ApiError, tokenMatches } from "./security";
import type { Checkout } from "./schema";

function accessKeys(): Record<string, string> {
  try {
    const keys = JSON.parse(process.env.ORDER_ACCESS_KEYS || "{}");
    if (
      !keys ||
      Array.isArray(keys) ||
      typeof keys !== "object" ||
      Object.entries(keys).some(
        ([id, secret]) =>
          !/^[A-Za-z0-9_-]{1,40}$/.test(id) ||
          typeof secret !== "string" ||
          secret.length < 32,
      )
    )
      throw new Error();
    return keys;
  } catch {
    throw new ApiError(503, "Private order access keys need configuration.");
  }
}
export function activeOrderAccessKey(): string {
  const keyId = process.env.ORDER_ACCESS_KEY_ID || "";
  const keys = accessKeys();
  if (!Object.hasOwn(keys, keyId))
    throw new ApiError(503, "Private order access keys need configuration.");
  return keyId;
}
export function hasOrderAccessKey(): boolean {
  try {
    activeOrderAccessKey();
    return true;
  } catch {
    return false;
  }
}
/** A versioned HMAC capability can be reissued without storing its plaintext in records. */
export function orderAccessToken(
  orderId: string,
  keyId = activeOrderAccessKey(),
): string {
  const keys = accessKeys();
  if (!Object.hasOwn(keys, keyId))
    throw new ApiError(
      503,
      "The retained private order access key is unavailable.",
    );
  return createHmac("sha256", keys[keyId])
    .update(`slow-reveal/order-access/v1:${orderId}`)
    .digest("base64url");
}
export function orderStatusLink(checkout: Checkout): string {
  if (!checkout.accessKeyId)
    throw new ApiError(
      503,
      "This legacy order needs an operator to recover its original private access link.",
    );
  const token = orderAccessToken(checkout.id, checkout.accessKeyId);
  if (!tokenMatches(token, checkout.tokenHash))
    throw new ApiError(
      503,
      "The private order access key does not match this order.",
    );
  let site: URL;
  try {
    site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  } catch {
    throw new ApiError(503, "The studio URL needs configuration.");
  }
  if (
    !["http:", "https:"].includes(site.protocol) ||
    site.username ||
    site.password ||
    site.search ||
    site.hash ||
    site.pathname !== "/"
  )
    throw new ApiError(503, "The studio URL needs configuration.");
  return `${site.origin}/order/${checkout.id}#token=${token}`;
}
