/** Versioned, opt-in marker profiles. Never replace a saved artwork's palette. */
export type MarkerPaletteColour = Readonly<{
  code: string;
  /** Studio description, not a manufacturer colour name. Use code to find the pen. */
  label: string;
  /** Approximate RGB sampled from the linked manufacturer chart, not physical paint. */
  hex: string;
  sample: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
}>;

export type MarkerPaletteProfile = Readonly<{
  id: string;
  label: string;
  brand: string;
  range: string;
  status: "unvalidated";
  productUrl: string;
  checkedOn: string;
  observedPrice: Readonly<{
    currency: "GBP";
    amountPence: number;
    taxIncluded: boolean;
    shippingIncluded: false;
    ukAvailable: boolean;
    variantId: string;
  }>;
  penCount: number;
  distinctColoursInPack: number;
  nib: string;
  replenishment: string;
  disclaimer: string;
  source: Readonly<{
    url: string;
    sha256: string;
    width: number;
    height: number;
    method: string;
    labelSource: "studio-description";
    codeSource: "manufacturer-chart";
  }>;
  colours: readonly MarkerPaletteColour[];
}>;

export const DEFAULT_MARKER_PROFILE_ID = "ohuhu-nahuku-48-v1";

// First sixteen form the smaller selection. White 101 is intentionally omitted:
// unmarked canvas is distinct from a white paint marker in numbered artwork.
const entries: readonly (readonly [string, string, string, number, number])[] =
  [
    ["120", "Black", "#22262b", 1024, 1277],
    ["BR519", "Brown", "#583b33", 872, 1114],
    ["BR87", "Tan", "#dea576", 1024, 1114],
    ["Y211", "Ochre", "#cd880a", 407, 614],
    ["G321", "Deep green", "#084e42", 718, 779],
    ["B719", "Blue", "#016abc", 561, 947],
    ["BGY012", "Slate grey", "#7d93a0", 1179, 1114],
    ["Y03", "Peach", "#fcc99d", 1332, 446],
    ["R416", "Red", "#e21117", 561, 446],
    ["YR310", "Orange", "#fe8302", 1179, 446],
    ["Y45", "Golden yellow", "#ffc605", 718, 614],
    ["YG57", "Light green", "#95cc78", 1332, 614],
    ["BG28", "Turquoise", "#23c9c9", 1024, 779],
    ["BG85", "Light blue", "#85d2e2", 1332, 779],
    ["V017", "Violet", "#6a5cb9", 1024, 947],
    ["R610", "Coral", "#f98e8b", 718, 446],
    ["R621", "Deep red", "#831e1f", 872, 446],
    ["R19", "Pink", "#fb99a5", 252, 446],
    ["RV513", "Rose", "#e05081", 561, 1114],
    ["Y05", "Apricot", "#ffc06b", 252, 614],
    ["BR419", "Red brown", "#4d1c15", 718, 1114],
    ["Y53", "Bright yellow", "#ffdd03", 872, 614],
    ["G43", "Mint", "#a3e2d0", 872, 779],
    ["G115", "Green", "#03a761", 407, 779],
    ["BG316", "Teal", "#028a97", 1179, 779],
    ["BGY021", "Deep blue grey", "#26495f", 1332, 1114],
    ["BV210", "Periwinkle", "#8da6e0", 718, 947],
    ["V119", "Deep violet", "#383187", 1179, 947],
    ["RV08", "Orchid", "#e091ca", 252, 1114],
    ["BGY19", "Blue grey", "#9bbbc7", 725, 1277],
    ["BGY15", "Pale blue grey", "#bed2d9", 570, 1277],
    ["Y71", "Cream yellow", "#f6e9b4", 1024, 614],
  ];

const nahuku: MarkerPaletteProfile = Object.freeze({
  id: DEFAULT_MARKER_PROFILE_ID,
  label: "Ohuhu Nahuku · 48-pen pack",
  brand: "Ohuhu",
  range: "Nahuku",
  status: "unvalidated",
  productUrl:
    "https://uk.ohuhu.com/products/ohuhu-direct-ink-acrylic-markers-48-pack-nahuku?variant=51158468559135",
  checkedOn: "2026-09-29",
  observedPrice: Object.freeze({
    currency: "GBP",
    amountPence: 3300,
    taxIncluded: true,
    shippingIncluded: false,
    ukAvailable: true,
    variantId: "51158468559135",
  }),
  penCount: 48,
  distinctColoursInPack: 44,
  nib: "1–5 mm soft brush (manufacturer specification)",
  replenishment:
    "Matching Nahuku individual pens or refill colours were not verified; do not substitute another Ohuhu range by code alone.",
  disclaimer:
    "Approximate colours sampled from the manufacturer's chart. Not measured paint colours; canvas coverage, 2 mm detail and durability remain untested. The 16 and 32 options are Studio selections from the same 48-pen pack.",
  source: Object.freeze({
    url: "https://cdn.shopify.com/s/files/1/0555/4212/0735/files/Y30-80601-84Nahuku4.jpg?v=1756708704",
    sha256: "ffbbf7782d647ff756ddbb96573cdeb86998b73438a166687ec26604a89c3d4a",
    width: 1600,
    height: 1600,
    method:
      "Decode original JPEG to 8-bit RGB with Sharp 0.35.5; independent channel median of each specified 21 × 21 pixel region on the solid light-ground swatch. No physical calibration or colour correction.",
    labelSource: "studio-description",
    codeSource: "manufacturer-chart",
  }),
  colours: Object.freeze(
    entries.map(([code, label, hex, left, top]) =>
      Object.freeze({
        code,
        label,
        hex,
        sample: Object.freeze({ left, top, width: 21, height: 21 }),
      }),
    ),
  ),
});

export const MARKER_PALETTE_PROFILES: readonly MarkerPaletteProfile[] =
  Object.freeze([nahuku]);

export function getMarkerPaletteProfile(id: string): MarkerPaletteProfile {
  const profile = MARKER_PALETTE_PROFILES.find((item) => item.id === id);
  if (!profile) throw new Error("Choose a recognised marker profile.");
  return profile;
}

/** Returns an independent array; the saved HEX array remains the render contract. */
export function getMarkerPalette(id: string, count: 16 | 32): string[] {
  if (count !== 16 && count !== 32)
    throw new Error("Choose 16 or 32 marker colours.");
  return getMarkerPaletteProfile(id)
    .colours.slice(0, count)
    .map((c) => c.hex);
}

/** Exact ordered matching only. Never relabel a historical or edited palette. */
export function identifyMarkerPalette(
  palette: readonly string[] | undefined,
): { profile: MarkerPaletteProfile; count: 16 | 32 } | undefined {
  if (!palette || (palette.length !== 16 && palette.length !== 32)) return;
  const profile = MARKER_PALETTE_PROFILES.find((item) =>
    item.colours
      .slice(0, palette.length)
      .every((colour, index) => palette[index] === colour.hex),
  );
  return profile ? { profile, count: palette.length } : undefined;
}
