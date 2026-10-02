import type { MetadataRoute } from "next";
import { trustedPublicOrigin } from "@/lib/public-origin";

export default function robots(): MetadataRoute.Robots {
  const origin = trustedPublicOrigin()?.origin;
  if (process.env.PUBLIC_SITE_INDEXABLE !== "true" || !origin) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/basket", "/design", "/order", "/lab"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
