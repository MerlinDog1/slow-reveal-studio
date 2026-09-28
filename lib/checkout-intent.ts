const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One immutable saved proof/delivery choice has one attempt, including across tabs. */
export async function checkoutAttemptId(
  designId: string,
  proofHash: string,
  shippingId: string,
): Promise<string> {
  if (
    !uuid.test(designId) ||
    !/^[a-f0-9]{64}$/.test(proofHash) ||
    !["standard", "express"].includes(shippingId)
  )
    throw new Error(
      "Review the saved design and delivery choice before checkout.",
    );
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify([
          "slow-reveal-checkout-v1",
          designId.toLowerCase(),
          proofHash,
          shippingId,
        ]),
      ),
    ),
  ).slice(0, 16);
  // RFC 9562 version 8: application-defined SHA-256-derived identity, not a capability.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
