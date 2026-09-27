import test from "node:test";
import assert from "node:assert/strict";
import { orderReviewDetails, hasUnappliedCrop } from "../lib/order-review";
import { DEFAULT_SETTINGS } from "../lib/renderers";
import type { Order } from "../lib/server/schema";

test("crop edits cannot be mistaken for the accepted preview until reset or regeneration", () => {
  const approved = { zoom: 1, x: 0, y: 0, rotation: 0 };
  assert.equal(hasUnappliedCrop({ ...approved }, approved), false);
  for (const changed of [
    { zoom: 1.2 },
    { x: 0.1 },
    { y: -0.3 },
    { rotation: 90 },
  ])
    assert.equal(hasUnappliedCrop({ ...approved, ...changed }, approved), true);
  assert.equal(
    hasUnappliedCrop({ ...approved, zoom: 1.2 }, { ...approved, zoom: 1.2 }),
    false,
  );
});

test("operator review follows current revision text, warnings, kit and source rather than paid original", () => {
  const order = {
    currentRevisionId: "revision-b",
    originalSnapshot: {
      design: {
        settings: {
          ...DEFAULT_SETTINGS,
          text: { value: "Original lettering" },
        },
        warnings: ["Original photo small"],
      },
      package: {
        source: { key: "original" },
        manifest: { kit: ["original kit"], warnings: ["Old warning"] },
      },
    },
    revisions: [
      {
        id: "revision-b",
        customerProofRequired: true,
        settings: {
          ...DEFAULT_SETTINGS,
          widthMm: 500,
          heightMm: 400,
          text: { value: "Revised lettering" },
        },
        package: {
          snapshotHash: "snapshot-b",
          source: { key: "replacement" },
          manifest: {
            kit: ["canvas", "ruler"],
            warnings: ["Current warning", "Current warning"],
            sourceWarnings: ["Current source advice"],
            stats: { markCount: 123 },
          },
        },
      },
    ],
  } as unknown as Order;
  const before = JSON.stringify(order.originalSnapshot);
  const details = orderReviewDetails(order);
  assert.equal(details.text, "Revised lettering");
  assert.equal(details.settings.widthMm, 500);
  assert.equal(details.artwork.source.key, "replacement");
  assert.deepEqual(details.kit, ["canvas", "ruler"]);
  assert.deepEqual(details.warnings, [
    "Current warning",
    "Current source advice",
  ]);
  assert.equal(details.markCount, 123);
  assert.equal(details.customerProofPending, true);
  order.customerProofApprovals = [
    {
      revisionId: "revision-b",
      snapshotHash: "different-snapshot",
      approvedAt: "2026-09-27T12:00:00.000Z",
    },
  ];
  assert.equal(orderReviewDetails(order).customerProofPending, true);
  order.customerProofApprovals.push({
    revisionId: "revision-b",
    snapshotHash: "snapshot-b",
    approvedAt: "2026-09-27T12:01:00.000Z",
  });
  assert.equal(orderReviewDetails(order).customerProofPending, false);
  assert.equal(JSON.stringify(order.originalSnapshot), before);
  order.currentRevisionId = "original";
  assert.equal(orderReviewDetails(order).text, "Original lettering");
  assert.equal(orderReviewDetails(order).customerProofPending, false);
  assert.deepEqual(orderReviewDetails(order).warnings, [
    "Old warning",
    "Original photo small",
  ]);
});
