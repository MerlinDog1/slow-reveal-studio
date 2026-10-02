# Slow Reveal Studio

The product requirements are in README.md. Preserve their full scope. Build the renderer and labs before commerce polish. Never present generated artwork, sample prices or untested production claims as validated physical products.

- Use TypeScript and Next.js App Router.
- Represent artwork in millimetres and share geometry between previews and production exports.
- Keep original images private. Do not log image data, tokens or customer details.
- Payment status must come from verified Stripe webhooks, never a redirect or browser request.
- Paid artwork snapshots are immutable; changes create a new revision for review.
- Tests should cover geometry, physical size, serialization, and trust boundaries.
- Run npm run typecheck, npm test and npm run build before handoff.
- Track implementation and external launch gates in docs/BUILD_STATUS.md.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
