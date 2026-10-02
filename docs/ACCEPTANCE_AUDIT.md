# Independent software acceptance audit

## Follow-up — 28 September 2026

Subsequent independent reviews covered individual admin authentication, immutable shared presets, role enforcement, private/public projections and the operator UI. They identified and corrected a preset refresh/mutation race, SQL-null handling in the preset revision trigger, and selected-proof/download revision drift. Administrator asset requests now require the selected revision, and refreshing changed artwork clears the old inspection. Audit entries show verified operator attribution. The regression suite checks missing/stale revision rejection for every asset type and current asset bytes; an isolated browser check confirmed old proof/download controls are removed after another reviewer regenerates the order.

The current catalogue implementation also supersedes the automatic reconciliation described in the dated audit below: restored IDs/dimensions are retained until explicit review, and older/unknown renderer versions require a rebuild decision. Full integrated results and the unexecuted real PostgreSQL regression are recorded in [VERIFICATION.md](VERIFICATION.md). No review establishes physical or deployed-service acceptance.

## Original bounded audit — 27 September 2026

Reviewed 27 September 2026 against the full README and current implementation, then re-read after the assigned fixes landed. This bounded review supplements the 34-section coverage map in [BUILD_STATUS.md](BUILD_STATUS.md). No application/backend code was changed by this audit. Source line numbers identify the current inspected state and may move as work continues.

**Result: five P2 findings identified; all five corrected in the current source. No additional open P1/P2 finding was established in this bounded review.** This does not mean all software or physical acceptance checks are complete. Physical trials, credentials/deployment, alternative-mode public gating and the replacement-photo workflow have separate owners and gates.

## Resolved — Unavailable catalogue selections

README sections 10 and 24 require database-driven configuration and coherent prices. Previously, when the fetched catalogue removed the default/restored product or finish, component state retained the unavailable ID and pricing silently fell back to development fixtures. Selecting a catalogue containing only `40x60`, or restoring a removed finish, could therefore show a different option/price from the configuration submitted.

**Current evidence:** `components/studio.tsx:204` reconciles both IDs against the fetched catalogue, updates dimensions to the selected available product and announces a changed canvas size. `components/studio.tsx:236` resolves product/finish without fixture fallbacks. `components/studio.tsx:536` rejects unavailable selections before review; the review button is also disabled when either selection is missing and the price reads “Unavailable”. This covers an empty successfully loaded catalogue as well.

The final source review also checked `components/basket.tsx`: product, finish, shipping, exact-or-swapped physical dimensions and permitted mode must all satisfy `selectionAvailable`. Missing selections or a failed catalogue fetch keep total unavailable and block both private save and checkout. No concrete new bug was established in that catalogue fallback removal.

**Verification still required:** exercise removed-default, removed-restored-finish and empty-catalogue cases in the integrated browser flow. Confirm selected ID, dimensions, displayed price and basket configuration agree. Resolution above is based on source/control-flow inspection, not a claimed completed browser test.

## Resolved — Pence prices rounded to whole pounds

README section 24 requires the displayed price to reflect configuration. The previous studio formatter used `maximumFractionDigits: 0`, displaying a 4,995-pence product as £50 while the basket showed £49.95.

**Current evidence:** `components/studio.tsx:45` imports the shared `formatPrice`; the builder price at `components/studio.tsx:1483` uses it. An executed check of the shared formatter returned **£49.95**, **£51.45** and **£50.00** for 4,995, 5,145 and 5,000 pence respectively.

**Verification still required:** confirm builder/basket display the same loaded catalogue price in the integrated browser flow. The original formatting defect is resolved in code.

## Resolved — Unapplied admin crop edits could approve old artwork

README section 20 requires crop edits and approval to correspond to the artwork being printed. Previously, changing crop inputs left approval enabled against the already loaded proof, while the approve request correctly referred to the previous server revision. Local crop edits were discarded on reload without a clear warning.

**Current evidence:** `lib/order-review.ts` compares local crop with the inspected revision. `components/admin-desk.tsx:50` derives `cropDirty`; the action handler at line 108 rejects approval/dispatch with unapplied changes. The panel at line 419 explains the difference and provides “Undo crop changes”. Approval, dispatch and downloads are disabled while crop edits are pending. Regeneration/reload still requires the new proof to load before approval.

**Executed verification:** both tests in `tests/order-review.test.ts` passed, including each crop field changing, reset/equality, and current-revision metadata selection. Browser regeneration and approval sequencing remain part of integrated UI acceptance.

## Resolved — Admin review omitted warnings and exact personalisation

README section 20 requires automated warnings and text to be visible before printing. Previously, package warnings and current revision personalisation existed in data but were absent from the approval panel.

**Current evidence:** `lib/order-review.ts` derives settings/package from the current revision, falling back to the immutable original when appropriate. The desk shows kit contents at `components/admin-desk.tsx:346`, exact personalisation and font/placement information at line 365, and automated warnings at line 384. Workload and palette details are also visible. Original warnings are not mixed into a replacement revision's current-source advice.

**Executed verification:** the review-details regression test passed with distinct original and revised text, source, warnings, kit and dimensions, and confirmed the original snapshot was unchanged. Visual presentation remains subject to integrated UI acceptance.

## Resolved — Manifest reported requested rather than clamped guide width

README sections 2 and 19 require accurate production parameters. Previously, valid settings `minDiameterMm: 0.5` and `guideWidthMm: 0.5` printed 0.25 mm circle/cell outlines while the manifest stated 0.5 mm.

**Current evidence:** `lib/server/production.ts:188` now applies the same minimum-diameter clamp as `lib/renderers/svg.ts:58`, and records the requested value separately as `requestedGuideWidthMm`. The original circle/cell mismatch is corrected. Path guides can be narrower than this base width because SVG serialization also caps each path by its finished width; interpret the manifest guide width as the base/maximum outline width, not a promise that every path has identical width. That metadata clarification was sent to the backend owner.

**Executed verification:** the renderer suite's guide-boundary regression passed. A direct exported-package assertion comparing manifest width with serialized SVG for clamped and unclamped fixtures remains useful final coverage; this audit did not claim to execute that full package check.

## Verification and review boundary

Executed after fixes: `node node_modules/tsx/dist/cli.mjs --test tests/order-review.test.ts tests/renderers.test.ts` — **20 passed, 0 failed, 1 skipped**. The skipped test is the browser/server outlined-lettering raster comparison and is not counted as validated. Shared price-formatting checks also passed as described above.

This audit did not mutate customer records, send notifications, initiate payments or change production settings. Previously corrected server-proof acceptance/hash checking, outlined lettering, saved-link restoration, stale admin requests, order-owned source lifetime and consent analytics were not repeated as open defects. Final integrated typecheck, full tests, build and browser checks remain the integrator's responsibility and are tracked in BUILD_STATUS.
