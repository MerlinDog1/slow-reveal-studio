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
    default: "Slow Reveal Studio — Made from your photo. Finished by you.",
    template: "%s · Slow Reveal Studio",
  },
  description:
    "Turn a meaningful photograph into a guided canvas you complete by hand. Explore dots, mosaic and line art in the Slow Reveal Studio.",
  icons: { icon: "/favicon.svg" },
  ...(publicOrigin
    ? {
        openGraph: {
          type: "website",
          siteName: "Slow Reveal Studio",
          locale: "en_GB",
          title: "Slow Reveal Studio — Made from your photo. Finished by you.",
          description:
            "Explore a photograph as a guided dot-art activity. Digital studio prototype; physical samples are still being tested.",
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
