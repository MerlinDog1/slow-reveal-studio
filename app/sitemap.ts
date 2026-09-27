import type { MetadataRoute } from "next";
import { trustedPublicOrigin } from "@/lib/public-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.PUBLIC_SITE_INDEXABLE !== "true") return [];
  const origin = trustedPublicOrigin()?.origin;
  if (!origin) return [];
  return [
    { url: `${origin}/`, images: [`${origin}/social/studio-og.png`] },
    { url: `${origin}/journal` },
    { url: `${origin}/create` },
  ];
}
