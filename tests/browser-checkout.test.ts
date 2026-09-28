import assert from "node:assert/strict";
import test from "node:test";
import {
  privateBasketDesign,
  pendingBasketCheckout,
} from "../lib/browser-checkout";
import { checkoutAttemptId } from "../lib/checkout-intent";

const designId = "550e8400-e29b-41d4-a716-446655440000";
const proofHash = "0123456789abcdef".repeat(4);
const token = "A".repeat(42) + "_";

test("private link projection accepts only bounded identities and strips restored URLs and other executable or consent state", () => {
  const input = {
    id: designId,
    token,
    url: "javascript:alert(1)",
    proofApproved: true,
    source: "private",
    settings: { mode: "mosaic" },
  };
  const projected = privateBasketDesign(input);
  assert.deepEqual(projected, { id: designId, token });
  input.id = "changed";
  assert.equal(projected?.id, designId);
  for (const invalid of [
    null,
    [],
    1,
    "saved",
    {},
    { id: designId },
    { token },
    { id: `/${designId}`, token },
    { id: "550e8400-e29b-01d4-a716-446655440000", token },
    { id: designId, token: "A".repeat(42) },
    { id: designId, token: "A".repeat(44) },
    { id: designId, token: "A".repeat(42) + "/" },
    { id: designId, token: "A".repeat(42) + "\n" },
  ])
    assert.equal(privateBasketDesign(invalid), null);
});

test("pending checkout projection retains only the immutable intent and rejects corrupt proof or delivery fields", async () => {
  const attemptId = await checkoutAttemptId(designId, proofHash, "express");
  const input = {
    attemptId,
    proofHash,
    shippingId: "express",
    token,
    url: "https://untrusted.invalid",
    paid: true,
    approved: true,
  };
  const projected = pendingBasketCheckout(input);
  assert.deepEqual(projected, { attemptId, proofHash, shippingId: "express" });
  input.shippingId = "standard";
  assert.equal(projected?.shippingId, "express");
  for (const invalid of [
    null,
    [],
    "pending",
    {},
    { attemptId: "not-an-id", proofHash, shippingId: "express" },
    { attemptId, proofHash: proofHash.toUpperCase(), shippingId: "express" },
    { attemptId, proofHash: proofHash.slice(1), shippingId: "express" },
    { attemptId, proofHash: "g".repeat(64), shippingId: "express" },
    { attemptId, proofHash, shippingId: "Express" },
    { attemptId, proofHash, shippingId: "overnight" },
  ])
    assert.equal(pendingBasketCheckout(invalid), null);
});

test("checkout identity is stable across reload/UUID case and separates design, proof and delivery boundaries", async () => {
  const first = await checkoutAttemptId(designId, proofHash, "express");
  assert.equal(first, "0f3ea230-eabb-8976-abb8-0a4fcc402934");
  assert.match(
    first,
    /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.equal(
    first,
    await checkoutAttemptId(designId.toUpperCase(), proofHash, "express"),
  );
  assert.equal(
    first,
    await checkoutAttemptId(
      ...(JSON.parse(JSON.stringify([designId, proofHash, "express"])) as [
        string,
        string,
        string,
      ]),
    ),
  );
  const identities = await Promise.all([
    checkoutAttemptId(designId, proofHash, "express"),
    checkoutAttemptId(designId, proofHash, "standard"),
    checkoutAttemptId(
      "550e8400-e29b-41d4-a716-446655440001",
      proofHash,
      "express",
    ),
    checkoutAttemptId(designId, "f" + proofHash.slice(1), "express"),
  ]);
  assert.equal(new Set(identities).size, 4);
});

test("malformed identities cannot generate a checkout key", async () => {
  for (const [id, hash, shipping] of [
    ["", proofHash, "standard"],
    [designId + "/x", proofHash, "standard"],
    ["550e8400-e29b-41d4-1716-446655440000", proofHash, "standard"],
    [designId, proofHash.toUpperCase(), "standard"],
    [designId, "a".repeat(63), "standard"],
    [designId, proofHash, ""],
    [designId, proofHash, "standard\n"],
  ])
    await assert.rejects(
      checkoutAttemptId(id, hash, shipping),
      /Review the saved design/,
    );
});
