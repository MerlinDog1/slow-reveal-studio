import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/400-italic.css";
import "./globals.css";
import { AnalyticsConsent } from "@/components/analytics-consent";
import { trustedPublicOrigin } from "@/lib/public-origin";

const publicOrigin = trustedPublicOrigin();

export const metadata: Metadata = {
  metadataBase: publicOrigin,
  robots: {
    index:
      process.env.PUBLIC_SITE_INDEXABLE === "true" && Boolean(publicOrigin),
    follow:
      process.env.PUBLIC_SITE_INDEXABLE === "true" && Boolean(publicOrigin),
  },
  title: {
    default: "Slow Reveal Studio — Put yourself in the picture.",
    template: "%s · Slow Reveal Studio",
  },
  description:
    "Put yourself in the picture. Turn a favourite photo into a guided artwork that reveals itself through dots, colour, spirals and little marks made by you.",
  icons: { icon: "/favicon.svg" },
  ...(publicOrigin
    ? {
        openGraph: {
          type: "website",
          siteName: "Slow Reveal Studio",
          locale: "en_GB",
          title: "Slow Reveal Studio — Put yourself in the picture.",
          description:
            "A photograph you love. A picture that takes its time. Explore the digital making studio; physical kits remain in development.",
          images: [
            {
              url: "/social/studio-og.png",
              width: 1200,
              height: 630,
              type: "image/png",
              alt: "Digital dot portrait of a black Labrador; source photo by Mac Gaither / Unsplash. Physical prototype pending.",
            },
          ],
        },
        twitter: {
          card: "summary_large_image" as const,
          images: ["/social/studio-og.png"],
        },
      }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>
        {children}
        <AnalyticsConsent />
      </body>
    </html>
  );
}
