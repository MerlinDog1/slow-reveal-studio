import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const newToken = () => randomBytes(32).toString("base64url");
export const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function tokenMatches(token: string | null, expected: string): boolean {
  if (!token || token.length > 256 || !/^[a-f0-9]{64}$/.test(expected))
    return false;
  return timingSafeEqual(
    Buffer.from(digest(token), "hex"),
    Buffer.from(expected, "hex"),
  );
}
export function bearer(request: Request): string | null {
  return (
    request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1] ?? null
  );
}
export async function requireAdmin(
  request: Request,
  role: import("./admin-auth").AdminRole = "reviewer",
) {
  const { authenticateAdmin } = await import("./admin-auth");
  return authenticateAdmin(request, role);
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected =
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  if (!origin || origin !== new URL(expected).origin)
    throw new ApiError(403, "This request must come from the studio website.");
}
export async function readBody(
  request: Request,
  maxBytes = 12 * 1024 * 1024,
): Promise<string> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new ApiError(413, "Upload is too large.");
  if (!request.body) throw new ApiError(400, "A request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "Upload is too large.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function readJson(
  request: Request,
  maxBytes?: number,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "Send JSON to this endpoint.");
  try {
    return JSON.parse(await readBody(request, maxBytes));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid JSON.");
  }
}
export function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function api(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ApiError)
      return privateJson(
        { error: error.message, details: error.details },
        error.status,
      );
    if (error && typeof error === "object" && "issues" in error)
      return privateJson(
        {
          error:
            "Some design values are invalid. Check the selected product and settings.",
        },
        400,
      );
    // Do not log exception payloads: provider exceptions can contain customer data or credentials.
    return privateJson(
      {
        error: "The studio could not complete this request. Please try again.",
      },
      500,
    );
  }
}
