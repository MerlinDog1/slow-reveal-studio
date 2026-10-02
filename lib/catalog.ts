/** Development catalogue. Prices are illustrative until supplier costs and physical trials are approved. */
export const PRODUCTS = [
  {
    id: "30x40",
    label: "30 × 40 cm",
    widthMm: 300,
    heightMm: 400,
    pricePence: 4900,
  },
  {
    id: "40x50",
    label: "40 × 50 cm",
    widthMm: 400,
    heightMm: 500,
    pricePence: 6900,
  },
  {
    id: "40x60",
    label: "40 × 60 cm",
    widthMm: 400,
    heightMm: 600,
    pricePence: 7900,
  },
  {
    id: "50x70",
    label: "50 × 70 cm",
    widthMm: 500,
    heightMm: 700,
    pricePence: 9900,
  },
  {
    id: "60x80",
    label: "60 × 80 cm",
    widthMm: 600,
    heightMm: 800,
    pricePence: 12900,
  },
] as const;
export const FINISHES = [
  { id: "rolled", label: "Rolled canvas", additionalPence: 0 },
  { id: "stretched", label: "Stretched canvas", additionalPence: 1500 },
  { id: "board", label: "Canvas board", additionalPence: 800 },
] as const;
export const INKS = [
  { id: "black", label: "Soft black", color: "#1E1E1C" },
  { id: "navy", label: "Deep navy", color: "#233B56" },
  { id: "sepia", label: "Warm sepia", color: "#68442F" },
  { id: "forest", label: "Forest green", color: "#354E3B" },
] as const;
export const SHIPPING = [
  { id: "standard", label: "UK standard", pricePence: 595 },
  { id: "express", label: "UK express", pricePence: 995 },
] as const;
export type Product = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  pricePence: number;
};
export type Finish = { id: string; label: string; additionalPence: number };
export type Catalogue = {
  products: Product[];
  finishes: Finish[];
  inks: typeof INKS;
  shipping: typeof SHIPPING;
  prototype: boolean;
};
export function formatPrice(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(pence / 100);
}
