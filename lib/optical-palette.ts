/** Broad fixed pen palette; the eight-colour set is a stable subset of sixteen. */
export const OPTICAL_MARKER_PALETTE = [
  "#1e1e1c",
  "#b33c3c",
  "#e5ca72",
  "#88a86e",
  "#445e7c",
  "#3a9291",
  "#b97a68",
  "#dbccb4",
  "#4b282a",
  "#354e3b",
  "#627fd0",
  "#765a91",
  "#d6a1b0",
  "#d8873f",
  "#696a6c",
  "#8ab7cf",
] as const;

export const defaultOpticalPalette = () => OPTICAL_MARKER_PALETTE.slice(0, 8);
