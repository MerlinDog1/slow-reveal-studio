import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableModes, RENDER_MODES } from "../lib/mode-availability";

test("production never exposes experimental modes merely because they are listed or indexing is off", () => {
  assert.deepEqual(getAvailableModes({ NODE_ENV: "production" }), ["dots"]);
  assert.deepEqual(
    getAvailableModes({
      NODE_ENV: "production",
      PHYSICAL_VALIDATION_APPROVED: "false",
      PHYSICALLY_VALIDATED_MODES: RENDER_MODES.join(","),
    }),
    ["dots"],
  );
  assert.deepEqual(
    getAvailableModes({
      NODE_ENV: "production",
      PHYSICAL_VALIDATION_APPROVED: "TRUE",
      PHYSICALLY_VALIDATED_MODES: "mosaic",
    }),
    ["dots"],
  );
});
test("production exposes only active, explicitly physically approved alternatives", () => {
  assert.deepEqual(
    getAvailableModes({
      NODE_ENV: "production",
      PHYSICAL_VALIDATION_APPROVED: "true",
      PHYSICALLY_VALIDATED_MODES: "mosaic, contour,mosaic,unknown",
    }),
    ["dots", "mosaic"],
  );
  assert.deepEqual(
    getAvailableModes({
      NODE_ENV: "production",
      PHYSICAL_VALIDATION_APPROVED: "true",
      PHYSICALLY_VALIDATED_MODES: "",
    }),
    ["dots"],
  );
  assert.deepEqual(getAvailableModes({}), ["dots"]);
});
test("local development offers active labs and keeps Contour and Stipple retired even when it was approved", () => {
  assert.deepEqual(
    getAvailableModes({
      NODE_ENV: "development",
      PHYSICAL_VALIDATION_APPROVED: "false",
    }),
    [
      "dots",
      "mosaic",
      "line-amplification",
      "colour-blend",
      "tv-weave",
      "fibonacci",
    ],
  );
  assert.deepEqual(
    getAvailableModes({
      NODE_ENV: "development",
      PHYSICAL_VALIDATION_APPROVED: "true",
      PHYSICALLY_VALIDATED_MODES: "contour,stipple",
    }),
    [
      "dots",
      "mosaic",
      "line-amplification",
      "colour-blend",
      "tv-weave",
      "fibonacci",
    ],
  );
  assert.deepEqual(
    getAvailableModes({
      NODE_ENV: "production",
      PHYSICAL_VALIDATION_APPROVED: "true",
      PHYSICALLY_VALIDATED_MODES: "contour,stipple",
    }),
    ["dots"],
  );
});
