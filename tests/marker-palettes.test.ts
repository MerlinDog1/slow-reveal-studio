import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MARKER_PROFILE_ID,
  MARKER_PALETTE_PROFILES,
  getMarkerPalette,
  getMarkerPaletteProfile,
  identifyMarkerPalette,
} from "../lib/marker-palettes";
import { MOSAIC_MARKER_PALETTE } from "../lib/mosaic-palette";

test("Nahuku selections use unique verified chart codes, excluding the white marker", () => {
  const profile = getMarkerPaletteProfile(DEFAULT_MARKER_PROFILE_ID);
  // Transcribed from the linked manufacturer chart, which has 44 distinct codes.
  const chartCodes = new Set(
    "R19 R21 R416 R610 R621 YR112 YR310 Y03 Y05 Y211 Y33 Y45 Y53 Y71 YG410 YG57 G09 G115 G214 G321 G43 BG28 BG316 BG85 B210 B513 B719 BV210 V09 V017 V119 RV05 RV08 RV38 RV513 BR419 BR519 BR87 BGY012 BGY021 BGY15 BGY19 101 120".split(
      " ",
    ),
  );
  assert.equal(chartCodes.size, profile.distinctColoursInPack);
  assert.equal(profile.colours.length, 32);
  assert.equal(new Set(profile.colours.map((c) => c.code)).size, 32);
  assert.equal(new Set(profile.colours.map((c) => c.hex)).size, 32);
  for (const colour of profile.colours) {
    assert.ok(chartCodes.has(colour.code), colour.code);
    assert.notEqual(colour.code, "101");
    assert.match(colour.hex, /^#[0-9a-f]{6}$/);
    assert.ok(colour.sample.left >= 0 && colour.sample.top >= 0);
    assert.ok(colour.sample.left + colour.sample.width <= profile.source.width);
    assert.ok(
      colour.sample.top + colour.sample.height <= profile.source.height,
    );
  }
  assert.equal(profile.penCount, 48);
  assert.equal(profile.status, "unvalidated");
  assert.equal(profile.source.labelSource, "studio-description");
  assert.match(profile.source.sha256, /^[0-9a-f]{64}$/);
});

test("16 colours are a stable ordered subset of 32 with independent mutable render arrays", () => {
  const small = getMarkerPalette(DEFAULT_MARKER_PROFILE_ID, 16);
  const large = getMarkerPalette(DEFAULT_MARKER_PROFILE_ID, 32);
  assert.deepEqual(small, large.slice(0, 16));
  assert.equal(small[0], "#22262b");
  assert.equal(small[15], "#f98e8b");
  small[0] = "#abcdef";
  large.reverse();
  assert.equal(getMarkerPalette(DEFAULT_MARKER_PROFILE_ID, 16)[0], "#22262b");
  assert.equal(getMarkerPalette(DEFAULT_MARKER_PROFILE_ID, 32)[31], "#f6e9b4");
  assert.ok(Object.isFrozen(MARKER_PALETTE_PROFILES));
  assert.ok(Object.isFrozen(MARKER_PALETTE_PROFILES[0].colours));
  assert.ok(Object.isFrozen(MARKER_PALETTE_PROFILES[0].colours[0]));
  assert.ok(Object.isFrozen(MARKER_PALETTE_PROFILES[0].colours[0].sample));
});

test("identity matching never relabels saved historical, custom or reordered palettes", () => {
  const historical = [...MOSAIC_MARKER_PALETTE];
  assert.equal(identifyMarkerPalette(historical), undefined);
  assert.equal(identifyMarkerPalette(historical.slice(0, 16)), undefined);
  assert.equal(identifyMarkerPalette(undefined), undefined);
  assert.equal(identifyMarkerPalette(new Array<string>(16)), undefined);
  for (const count of [16, 32] as const) {
    const palette = getMarkerPalette(DEFAULT_MARKER_PROFILE_ID, count);
    assert.equal(
      identifyMarkerPalette(palette)?.profile.id,
      DEFAULT_MARKER_PROFILE_ID,
    );
    assert.equal(identifyMarkerPalette(palette)?.count, count);
    assert.equal(identifyMarkerPalette([...palette].reverse()), undefined);
    palette[count - 1] = "#010203";
    assert.equal(identifyMarkerPalette(palette), undefined);
  }
  assert.deepEqual([...MOSAIC_MARKER_PALETTE], historical);
  assert.equal(identifyMarkerPalette(["#22262b"]), undefined);
});

test("unknown profiles and unsupported sizes fail instead of silently using a palette", () => {
  assert.throws(() => getMarkerPalette("unknown", 32), /recognised/);
  assert.throws(() => getMarkerPaletteProfile("ohuhu-hanauma"), /recognised/);
  for (const count of [0, 8, 17, 48, NaN]) {
    assert.throws(
      () => getMarkerPalette(DEFAULT_MARKER_PROFILE_ID, count as 16),
      /16 or 32/,
    );
  }
});
