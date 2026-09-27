# Search metadata and social preview

The root social image is `/social/studio-og.png`, a 1200 × 630 PNG made from the actual Signature Dots renderer. It contains 11,600 circle marks derived from the licensed black-dog laboratory reference, with a visible digital-study label, physical-prototype notice and photographer attribution. It is a software output, not a photograph of a manufactured kit, customer result or endorsement. No customer photograph, caption, project ID or access token is present.

## Provenance and rebuilding

- Photograph: Mac Gaither / Unsplash, [Moose the Black Lab](https://unsplash.com/photos/black-labrador-retriever-ITGs9TnB9og), under the [Unsplash License](https://unsplash.com/license). The reference manifest records the verified source hash and licence. See `public/references/README.md` for use limits.
- Artwork: `renderImage` and `toSvg` from the shared renderer; full saved geometry and its SVG sit beside the PNG in `public/social/`.
- Typography: installed Playfair Display and DM Sans, outlined from their font files. OpenType.js and Sharp produce a raster with no dependency on workstation fonts. This is a deterministic programmatic asset, with no image-generation substitute for the artwork.
- Run `node --import tsx scripts/build-social.mjs` from the project root. The script verifies the reference file's recorded hash before rendering. `public/social/manifest.json` records output dimensions, image/geometry hashes, renderer version, attribution and alt text. The build script lives outside the public asset directory.
- Use alt text: “Digital dot portrait of a black Labrador rendered by Slow Reveal Studio; source photo by Mac Gaither / Unsplash. Physical prototype pending.”

## Root metadata wiring

The root layout should set `metadataBase` only from a validated `NEXT_PUBLIC_SITE_URL` origin. Reject username/password, query, fragment and non-root paths; do not derive canonical URLs from browser requests. In deployed social metadata use the following values, resolving the image against that trusted origin:

```ts
openGraph: {
  type: "website",
  siteName: "Slow Reveal Studio",
  locale: "en_GB",
  title: "Slow Reveal Studio — Made from your photo. Finished by you.",
  description: "Explore a photograph as a guided dot-art activity. Digital studio prototype; physical samples are still being tested.",
  images: [{
    url: "/social/studio-og.png",
    width: 1200,
    height: 630,
    type: "image/png",
    alt: "Digital dot portrait of a black Labrador; source photo by Mac Gaither / Unsplash. Physical prototype pending.",
  }],
},
twitter: {
  card: "summary_large_image",
  images: ["/social/studio-og.png"],
},
```

Private project/order/admin pages should retain `robots: {index:false, follow:false}` even after the public site is enabled. Root metadata should also default to noindex while `PUBLIC_SITE_INDEXABLE` is false. Social metadata must remain a fixed public reference image; never automatically substitute a visitor's own source, preview, name or quote.

## Indexing gate

`app/robots.ts` disallows the entire prototype while `PUBLIC_SITE_INDEXABLE` is absent/false, or the configured URL is invalid. `app/sitemap.ts` then returns an empty sitemap. Enable `PUBLIC_SITE_INDEXABLE=true` only for an approved public launch on a clean HTTPS origin. Credentials, share fragments, query strings, localhost addresses, `.local` hosts and base paths are rejected rather than copied into public metadata.

When enabled, only `/`, `/journal` and `/create` enter the sitemap. The homepage entry includes the fixed public social image. Admin, API, basket, saved designs, orders and laboratories remain disallowed in robots. Robots instructions are indexing guidance, not an access-control mechanism; private APIs still require their bearer capabilities. Rebuild/redeploy after changing indexing environment values because Next.js may statically generate these metadata routes.

Implementation follows the official Next.js [metadata conventions](https://nextjs.org/docs/app/api-reference/file-conventions/metadata) and [metadata-base/Open Graph API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), checked 27 September 2026. Public launch should also verify the resolved `og:image` URL using the chosen social networks' inspection tools after deployment.
