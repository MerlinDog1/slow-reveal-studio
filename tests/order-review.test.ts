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

test("making-guide availability follows the current immutable package and requires manifest file evidence", () => {
  const guide = {
    version: "srs-kit-guide/1.0.0",
    status: "draft-for-physical-trial",
    pages: 2,
    files: Object.fromEntries(
      ["makingGuidePdf", "guideModel", "packingListJson"].map((key) => [
        key,
        { path: `kit/${key}`, bytes: 123, sha256: "a".repeat(64) },
      ]),
    ),
  };
  const order = {
    currentRevisionId: "current",
    originalSnapshot: {
      design: { settings: DEFAULT_SETTINGS, warnings: [] },
      package: { manifest: { kitGuide: guide } },
    },
    revisions: [
      { id: "current", settings: DEFAULT_SETTINGS, package: { manifest: {} } },
    ],
  } as unknown as Order;
  assert.equal(orderReviewDetails(order).kitGuide, undefined);
  order.revisions[0].package.manifest.kitGuide = guide;
  assert.deepEqual(orderReviewDetails(order).kitGuide, {
    version: "srs-kit-guide/1.0.0",
    pages: 2,
  });
  for (const change of [
    { status: "approved" },
    { pages: 0 },
    { files: {} },
    { version: "invented" },
  ]) {
    order.revisions[0].package.manifest.kitGuide = { ...guide, ...change };
    assert.equal(orderReviewDetails(order).kitGuide, undefined);
  }
  order.revisions[0].package.manifest.kitGuide = {
    ...guide,
    files: {
      ...guide.files,
      makingGuidePdf: { path: "kit/guide.pdf", bytes: 0, sha256: "missing" },
    },
  };
  assert.equal(orderReviewDetails(order).kitGuide, undefined);
});
