import { createHmac, randomBytes } from "node:crypto";
import { database } from "./store";
import { ApiError } from "./security";
const localSecret = randomBytes(32).toString("hex");
const counters = new Map<string, { count: number; expires: number }>();
export function anonymousHash(value: string) {
  return createHmac("sha256", process.env.RATE_LIMIT_SECRET || localSecret)
    .update(`${new Date().toISOString().slice(0, 10)}:${value}`)
    .digest("hex");
}
export async function takeQuota(
  identity: string,
  scope: string,
  limit: number,
  windowSeconds: number,
) {
  const now = Date.now();
  const window = Math.floor(now / (windowSeconds * 1000));
  const key = anonymousHash(`${scope}:${window}:${identity}`);
  const expires = (window + 1) * windowSeconds * 1000;
  const db = database();
  if (db) {
    const { data, error } = await db.rpc("studio_take_quota", {
      quota_key: key,
      quota_limit: limit,
      expires_at: new Date(expires).toISOString(),
    });
    if (error)
      throw new ApiError(503, "The upload quota service is unavailable.");
    if (!data)
      throw new ApiError(
        429,
        "The studio has received too many requests. Please try again later.",
      );
    return;
  }
  for (const [k, value] of counters)
    if (value.expires <= now) counters.delete(k);
  const count = counters.get(key)?.count ?? 0;
  if (count >= limit || counters.size >= 10000)
    throw new ApiError(
      429,
      "The studio has received too many requests. Please try again later.",
    );
  counters.set(key, { count: count + 1, expires });
}
export async function rateLimit(
  request: Request,
  scope: "save" | "upload" | "preview" | "analytics" | "checkout",
) {
  // Hosting ingress must replace these headers; no raw IP is stored or logged.
  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ??
    request.headers.get("x-real-ip") ??
    "local";
  const limit =
    scope === "preview"
      ? 60
      : scope === "analytics"
        ? 500
        : scope === "checkout"
          ? 5
          : 10;
  await takeQuota(ip, scope, limit, 900);
  if (scope === "save" || scope === "upload")
    await takeQuota("deployment", `${scope}-daily`, 200, 86400);
  if (scope === "checkout")
    await takeQuota("deployment", "checkout-daily", 50, 86400);
}
