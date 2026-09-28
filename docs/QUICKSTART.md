# Run the studio

Requirements: Node.js 24 and npm. The repository contains the full product brief in `README.md`; implementation coverage and unfinished acceptance gates are tracked in `BUILD_STATUS.md`.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

On the first run, copy the example environment file as above; preserve an existing `.env.local` if already configured. Open **http://127.0.0.1:3000**. The photo editor, all four labs, reference photos, local saves and prototype exports work without service credentials. Uploads in the editor stay in the browser. The review page explicitly uploads a private design only when the visitor chooses to save it.

`npm run build` produces a release with Dots available by default. Alternative modes appear in production routes, the builder and private-save API only after physical approval and inclusion in `PHYSICALLY_VALIDATED_MODES`. Rebuild and redeploy after changing mode approval because lab routes are generated at build time. Search indexing settings do not grant access to experimental modes; local development continues to offer all four labs for research.

## Routes

| Route                                                    | Purpose                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/`                                                      | Studio introduction and interactive dot example                                                    |
| `/create`                                                | Customer photo/crop/style/colour/text/size builder                                                 |
| `/lab/dots`                                              | Full dot controls, presets and prototype exports                                                   |
| `/lab/mosaic`, `/lab/contour`, `/lab/line-amplification` | Experimental physical activity modes                                                               |
| `/basket`                                                | Kit review, private save, canonical production proof and gated checkout                            |
| `/design/:id#token=…`                                    | Private saved design; the capability stays out of server URL query logs                            |
| `/order/:id#token=…`                                     | Payment/fulfilment status, requested replacement-photo submission and revised-proof approval       |
| `/admin`                                                 | Individual operator sign-in, production review and versioned renderer presets                       |
| `/photo-guide`, `/canvas-guide`                          | Photo/crop advice and planned canvas sizes/finishes with digital examples                             |
| `/studies`                                               | Labelled digital studies and illustrative concepts; unapproved alternative-mode studies stay local |
| `/journal`, `/privacy`                                   | Development notes and current data handling                                                        |

## Optional local private-design and admin setup

Local development saves private records under ignored `.data/`. These files are not public assets and must not be committed or copied into a production build. The Next build excludes local data from server file tracing. Production defaults to requiring Supabase and R2.

The example `.env.local` supplies the loopback canonical URL needed for private saves. Keep this equal to the URL used in the browser, including host and port, otherwise same-origin mutation checks will reject requests. Configure services in this ignored file when ready. Generate independent random values for the administrator, quota and cron secrets. Never expose service keys using a `NEXT_PUBLIC_` name.

For a local administrator token, generate a value using:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

For loopback development only, set `ADMIN_API_TOKEN` and `ALLOW_LOCAL_ADMIN_TOKEN=true` in `.env.local`, restart the server, and enter that value in `/admin`. A local production build also requires `ALLOW_LOCAL_DEVELOPMENT_STORAGE=true`. Both the configured canonical URL and request origin must be loopback. There is no unauthenticated admin bypass; the development token stays in page memory.

For a deployed production desk, follow the individual Supabase operator provisioning instructions in `OPERATIONS.md`. Sign-in uses a preprovisioned account and active private membership; reviewer and operator roles have different permissions. The local token does not satisfy the production launch gate. Supabase sessions stay in page memory and signing out clears the desk.

## Verify

```powershell
npm run typecheck
npm test
npm run build
```

The test suite covers deterministic geometry, print dimensions, safe text, private capabilities, authoritative product settings/prices, webhook signatures/idempotency, immutable paid artwork, review races, consent, quotas and deletion boundaries. It uses local disposable fixtures, not live charges or emails.

For the reproducible renderer reference benchmark:

```powershell
npx tsx tests/benchmark-renderers.ts
```

## Production setup

Follow `OPERATIONS.md` and the Supabase migrations. R2 must remain private and use the documented direct-upload CORS policy; original uploads and archive downloads use temporary signed URLs to avoid serverless body limits. Vercel's included cron route needs its independent secret and an actual schedule in the deployed project.

Paid orders are intentionally unavailable until physical trials, the catalogue and live services are approved. Development prices are examples, not signed-off commercial prices. A customer must inspect both canonical server proof views before checkout; a proof hash binds the approved artwork to its immutable production package. Never use a success-page visit as payment confirmation.

The full product is not accepted until people have completed real UV-printed canvases and the remaining external gates in `BUILD_STATUS.md` are evidenced.
