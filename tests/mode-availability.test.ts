import assert from "node:assert/strict";
import test from "node:test";
import {
  getAvailableModes,
  getPreviewModes,
  RENDER_MODES,
} from "../lib/mode-availability";

const activePreviews = [
  "dots",
  "mosaic",
  "line-amplification",
  "colour-blend",
  "tv-weave",
  "fibonacci",
  "cross-stitch",
];

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
      "cross-stitch",
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
      "cross-stitch",
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

test("hosted prototype opt-in exposes all seven active previews while retaining retired exclusions", () => {
  const environment = {
    NODE_ENV: "production",
    PUBLIC_PROTOTYPE_MODES_ENABLED: "true",
    LIVE_CHECKOUT_ENABLED: "false",
    PHYSICAL_VALIDATION_APPROVED: "false",
    PHYSICALLY_VALIDATED_MODES: "contour,stipple",
  };
  const modes = getPreviewModes(environment);
  assert.deepEqual(modes, activePreviews);
  assert.equal(modes.includes("contour"), false);
  assert.equal(modes.includes("stipple"), false);
  modes.pop();
  assert.deepEqual(getPreviewModes(environment), activePreviews);
});

test("hosted previews require exact opt-in and explicit checkout-off flags, including when checkout is missing", () => {
  for (const prototypeFlag of [
    undefined,
    "",
    "true",
    "TRUE",
    "1",
    " true ",
    "false",
  ])
    for (const checkoutFlag of [
      undefined,
      "",
      "true",
      "TRUE",
      "0",
      " false ",
      "FALSE",
      "false",
    ])
      assert.deepEqual(
        getPreviewModes({
          NODE_ENV: "production",
          PUBLIC_PROTOTYPE_MODES_ENABLED: prototypeFlag,
          LIVE_CHECKOUT_ENABLED: checkoutFlag,
          PHYSICAL_VALIDATION_APPROVED: "false",
          PHYSICALLY_VALIDATED_MODES: RENDER_MODES.join(","),
        }),
        prototypeFlag === "true" && checkoutFlag === "false"
          ? activePreviews
          : ["dots"],
        `prototype=${String(prototypeFlag)}, checkout=${String(checkoutFlag)}`,
      );
});

test("preview fallback preserves the explicitly approved customer list and local development policy", () => {
  for (const flags of [
    {},
    { PUBLIC_PROTOTYPE_MODES_ENABLED: "true" },
    { PUBLIC_PROTOTYPE_MODES_ENABLED: "true", LIVE_CHECKOUT_ENABLED: "true" },
    { PUBLIC_PROTOTYPE_MODES_ENABLED: "false", LIVE_CHECKOUT_ENABLED: "false" },
  ]) {
    assert.deepEqual(
      getPreviewModes({
        NODE_ENV: "production",
        PHYSICAL_VALIDATION_APPROVED: "true",
        PHYSICALLY_VALIDATED_MODES:
          " mosaic,contour,unknown,line-amplification,stipple,mosaic ",
        ...flags,
      }),
      ["dots", "mosaic", "line-amplification"],
    );
    assert.deepEqual(
      getPreviewModes({ NODE_ENV: "development", ...flags }),
      activePreviews,
    );
  }
});

test("prototype preview flags never grant customer-design mode permission", () => {
  const flags = {
    NODE_ENV: "production",
    PUBLIC_PROTOTYPE_MODES_ENABLED: "true",
    LIVE_CHECKOUT_ENABLED: "false",
  };
  assert.deepEqual(
    getAvailableModes({
      ...flags,
      PHYSICAL_VALIDATION_APPROVED: "false",
      PHYSICALLY_VALIDATED_MODES: RENDER_MODES.join(","),
    }),
    ["dots"],
  );
  assert.deepEqual(
    getAvailableModes({
      ...flags,
      PHYSICAL_VALIDATION_APPROVED: "true",
      PHYSICALLY_VALIDATED_MODES: "mosaic,contour,stipple",
    }),
    ["dots", "mosaic"],
  );
  assert.deepEqual(
    getAvailableModes({
      ...flags,
      PHYSICAL_VALIDATION_APPROVED: "true",
      PHYSICALLY_VALIDATED_MODES: "contour,stipple",
    }),
    ["dots"],
  );
});
