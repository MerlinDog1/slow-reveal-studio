# Third-party software and assets

Inspected 27 September 2026. Runtime dependency versions below are the **installed versions** read from package manifests, with their shipped licence files inspected. `package-lock.json` is the reproducible dependency resolution; preserve it and use `npm ci` for handoff/builds. Caret ranges in `package.json` do not replace the lockfile. Update this inventory when dependencies change.

## Direct dependencies

| Package | Installed version | Licence / source | Purpose |
|---|---|---|---|
| next | 16.3.6 | MIT; [Vercel Next.js](https://github.com/vercel/next.js) | App Router and server/application build |
| react, react-dom | 19.3.0 | MIT; [React](https://github.com/facebook/react) | UI runtime |
| lucide-react | 0.577.0 | ISC, with Feather-origin MIT notices; [Lucide](https://github.com/lucide-icons/lucide) | Interface icons |
| zod | 4.6.5 | MIT; [Zod](https://github.com/colinhacks/zod) | Request/settings validation |
| stripe | 20.4.1 | MIT; [Stripe Node](https://github.com/stripe/stripe-node) | Checkout and signed webhook verification |
| @supabase/supabase-js | 2.117.2 | MIT; [Supabase JS](https://github.com/supabase/supabase-js) | Database/service access |
| @aws-sdk/client-s3 | 3.1141.0 | Apache-2.0; [AWS SDK JS v3](https://github.com/aws/aws-sdk-js-v3) | R2 S3-compatible storage |
| @aws-sdk/s3-request-presigner | 3.1141.0 | Apache-2.0; [AWS SDK JS v3](https://github.com/aws/aws-sdk-js-v3) | Controlled short-lived object URLs |
| resend | 6.30.0 | MIT; [Resend Node](https://github.com/resend/resend-node) | Transactional email |
| jszip | 3.10.2 | MIT OR GPL-3.0-or-later; **MIT option selected**; [JSZip](https://github.com/Stuk/jszip) | Artwork package export |
| jspdf | 4.2.1 | MIT; [jsPDF](https://github.com/parallax/jsPDF) | PDF export |
| sharp | 0.35.5 | Apache-2.0; [Sharp](https://github.com/lovell/sharp) | Server-side image decode/render |

## Development dependencies

| Package | Installed version | Licence / source |
|---|---|---|
| typescript | 5.9.3 | Apache-2.0; [TypeScript](https://github.com/microsoft/TypeScript) |
| tsx | 4.23.15 | MIT; [tsx](https://github.com/privatenumber/tsx) |
| @playwright/test | 1.63.0 | Apache-2.0; [Playwright](https://github.com/microsoft/playwright) |
| @types/node | 24.19.0 | MIT; [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| @types/react, @types/react-dom | 19.3.0 | MIT; [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |

Shipped `LICENSE`, `license.md`, `LICENSE.txt`, `LICENSE.markdown` and `NOTICE` files are authoritative for the installed packages. Retain applicable copyright/licence notices when distributing code. Sharp's native binaries and libvips, and Playwright's optional browsers, have their own bundled transitive notices: preserve those distributions' notices; this direct-dependency table is not a claim that every native/transitive component shares the wrapper's licence. Audit release artifacts if dependencies are redistributed outside the normal package deployment.

## Established service patterns

Integration code is project-specific code built against official SDKs. These official documents are the design references, not a blanket licence to copy proprietary implementation:

- [Stripe webhook guide](https://docs.stripe.com/webhooks): verify signatures against the raw request body and the endpoint secret; handle asynchronous and repeated events. Browser redirects cannot prove payment.
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/): use scoped S3-compatible operations; possession of a signed URL grants temporary access, so avoid logs and long expiry.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): explicitly protect exposed tables. Server/service credentials require additional application authorisation and never belong in client code.
- [Resend Next.js guide](https://resend.com/docs/send-with-nextjs): keep sending credentials server-side and verify sender configuration before real customer email.

No competitor code, page templates, images or copywriting are imported. Algorithmic rendering code is authored for this project. Do not claim use of an external face-segmentation model or model licence unless that dependency and its weights have actually been added and reviewed. The preferred Tailwind/shadcn options in the product brief are not listed as installed dependencies at this inventory date.

## Photographs, fonts and generated assets

Eight lab photos are bundled under the **Unsplash License**, not the application source-code licence and not CC0. Sources, photographers, restrictions and hashes: [reference README](../public/references/README.md), [manifest](../public/references/manifest.json). The official [licence](https://unsplash.com/license) permits downloading, modifying and distributing photos, with restrictions on selling unmodified copies and competing collections. These small lab fixtures are not a stock-photo service. Do not imply photographer or model endorsement.

DM Sans and Playfair Display are self-hosted through `@fontsource/dm-sans` and `@fontsource/playfair-display`, both pinned at 5.3.0, under their bundled SIL Open Font License 1.1 notices. No request to Google Fonts is needed at runtime. Production text uses a separately verified outline workflow; preserve the fonts' notices when redistributing glyph assets. Prettier 3.9.9 is an MIT-licensed development formatter.

Generated marketing concepts must carry tool/prompt/date/status metadata and be visibly distinguished from actual production photographs. The asset plan is [ASSETS.md](ASSETS.md); no generated marketing image is claimed as a completed physical kit.
