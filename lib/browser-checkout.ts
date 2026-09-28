export type SavedPrivateDesign = { id: string; token: string };
export type PendingBasketCheckout = {
  attemptId: string;
  proofHash: string;
  shippingId: string;
};

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Device storage is untrusted. Reconstruct private URLs instead of restoring one. */
export function privateBasketDesign(value: unknown): SavedPrivateDesign | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" &&
    uuid.test(candidate.id) &&
    typeof candidate.token === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(candidate.token)
    ? { id: candidate.id, token: candidate.token }
    : null;
}

export function pendingBasketCheckout(
  value: unknown,
): PendingBasketCheckout | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.attemptId === "string" &&
    uuid.test(candidate.attemptId) &&
    typeof candidate.proofHash === "string" &&
    /^[a-f0-9]{64}$/.test(candidate.proofHash) &&
    typeof candidate.shippingId === "string" &&
    ["standard", "express"].includes(candidate.shippingId)
    ? {
        attemptId: candidate.attemptId,
        proofHash: candidate.proofHash,
        shippingId: candidate.shippingId,
      }
    : null;
}
