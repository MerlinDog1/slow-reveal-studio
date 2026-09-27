# Slow Reveal Studio — Product & Build Specification

> Working title. Build a premium UK-focused ecommerce platform for personalised, photo-derived art activity kits. **Dots is the flagship mode.** Alternative modes must be equally satisfying to complete physically, not merely visually interesting on screen.

## 1. Product Goal

Create a web application where a customer can:

1. Upload a meaningful photograph.
2. Crop, rotate, zoom and position it.
3. Convert it into a guided art activity.
4. See a **live finished-art preview**.
5. See a **live preview of the exact template they will follow**.
6. Choose a mode, difficulty, colour treatment, size and finish.
7. Add optional personalised text such as a name, date, place or short quote.
8. Buy a complete physical kit.
9. Receive a UV-printed canvas template plus the tools needed to finish it by hand.
10. End with artwork good enough to display, not just an activity that gets thrown away.

The core proposition is:

**Upload a photo → receive a guided canvas → complete it yourself → reveal and display the finished piece.**

This is part personalised gift, part mindful activity and part finished wall art.

---

## 2. Production Assumption

Our intended print method is **UV print direct to canvas**.

The system must therefore generate production artwork suitable for direct UV printing, with control over:

- canvas dimensions in millimetres
- bleed and safe areas
- template line weight
- guide colour / opacity
- white ink / dark-canvas workflows where relevant
- registration / trim marks if required by production
- raster DPI and/or vector output
- personalised text placement

The physical surface and marker combination must be tested together. The visual algorithm must ultimately respect what is practical to complete on the real canvas.

---

## 3. Product Principles

### The activity matters as much as the final image

Every renderer must answer two questions:

1. Does the final artwork look good?
2. Is the act of completing it enjoyable, understandable and achievable?

Do not ship modes that are impressive as image filters but tedious or confusing as physical activities.

### Two outputs are mandatory

Every mode must generate:

- **Finished Preview** — what the customer should expect after completing it.
- **Template Preview** — what will actually be UV printed and followed by the customer.

This is a defining feature of the product.

### The transformation engine is the product

Storefront polish matters, but the rendering and template-generation system is the moat. Prioritise this over generic ecommerce bells and whistles.

---

## 4. Launch Modes

## 4.1 Signature Dots — Flagship / MVP Priority

### Customer action
Fill printed circles using marker pens.

### Finished look
A recognisable portrait or scene built from intentionally sized and spaced dots.

### Template look
Clean, lightly printed circles with enough contrast to follow comfortably but little enough visual weight to disappear into the finished piece.

### Renderer goals
Avoid a crude newspaper-halftone filter. The output should feel designed and preserve important subject information.

Consider:

- luminance
- local contrast
- adaptive dot size
- density
- facial / subject detail
- edge emphasis
- negative space
- local tonal grouping
- avoidance of dot collisions
- printable minimum diameter
- comfortable maximum diameter

### Controls / presets
Prefer tasteful presets over exposing dozens of technical sliders to ordinary customers.

Customer-facing options:

- Easy
- Standard
- Detailed
- Bold
- Fine Portrait
- Inverted / Light-on-dark where physically viable

Internal/lab controls:

- spacing
- minimum dot diameter
- maximum dot diameter
- contrast
- brightness
- gamma
- threshold
- detail preservation
- edge emphasis
- density
- inversion
- subject mask strength

### Difficulty
Difficulty should alter both detail and physical workload.

- Easy: fewer, larger dots
- Standard: balanced
- Detailed: more / smaller dots

Display an estimated completion time where possible.

---

## 4.2 Mosaic Fill — Strong Alternative Mode

### Customer action
Fill geometric cells rather than dots.

### Possible cell styles

- rounded squares
- squares
- hexagons
- simple irregular mosaic polygons later

### Why it belongs
It is visually distinct, easy to understand and naturally extends into limited-colour work.

### Outputs

- finished mosaic preview
- clean outlined-cell template
- production file
- optional colour/symbol legend for multi-colour versions

### Colour potential
This is the best early candidate for a limited-palette colour product.

Test:

- monochrome
- two-tone
- 4-colour
- 6-colour
- 8-colour

Do not attempt huge paint-by-numbers palettes in v1.

---

## 4.3 Contour Trace — Elegant Alternative Mode

### Customer action
Trace faint, simplified linework using a supplied pen.

### Best subjects

- people
- pets
- buildings
- wedding photographs
- vehicles
- memorial images

### Renderer goals
Generate intentional line art rather than generic edge detection.

Explore:

- contour simplification
- subject segmentation
- face-aware detail retention
- line smoothing
- variable line importance
- optional one-line / continuous-line-inspired preset

### Template
Faint guide paths designed to be traced comfortably.

### Finished result
A minimal line-art portrait suitable for framing.

---

## 4.4 Line Amplification — Phase 2 / R&D Mode

### Customer action
Follow horizontal, vertical or directional guide lines and strengthen / thicken / trace specified sections.

### Mandatory kit component
**Supply a ruler / straight edge with every Line Amplification kit.**

A branded transparent ruler or purpose-designed straight-edge may become part of the product identity.

### Renderer concepts to test

- horizontal line thickness modulation
- vertical line modulation
- spacing modulation
- wave amplitude modulation
- interrupted line segments
- continuous line fields
- contour-following line fields later

### Important
Do not launch until physical completion has been tested. It must not require unrealistic hand precision.

---

## 5. Future Experimental Modes

Only investigate after core modes work well:

- stipple
- crosshatch / engraving
- scribble / continuous path
- hatch fill
- wave line
- geometric portrait

Each experimental mode must define the **physical customer action**, not only a screen effect.

---

## 6. Upload & Editor Experience

Support:

- JPG / JPEG
- PNG
- WEBP
- HEIC where practical

Editor must include:

- drag/drop and mobile upload
- EXIF orientation correction
- crop
- zoom
- rotate
- reposition
- aspect ratio based on selected product
- live subject-safe-area indication

Do not force sign-up before creation.

### Photo suitability analysis

Provide friendly automatic feedback based on:

- source resolution
- blur
- exposure
- contrast
- face count
- subject size
- crop
- background complexity

Examples:

- “Great photo for Dots.”
- “This will work better at 40 × 50 cm or larger.”
- “Your subject is quite small. Try a tighter crop.”
- “This image is dark. Increase brightness or try another photo.”

Allow human override/admin review rather than hard-blocking borderline images.

---

## 7. Live Preview UX

The editor must always make these states accessible:

1. Original photo
2. Finished artwork
3. Printable template

Recommended UI:

- large central preview
- tabs or segmented control for **Finished / Template**
- original-vs-finished draggable slider
- one-tap original reference
- desktop side-by-side where screen space allows
- mobile-friendly full-width preview

Settings must update the preview quickly enough to feel interactive.

### Rendering performance

Use low/medium-resolution previews during editing.

Generate production resolution only when:

- saving a design
- adding to basket
- checkout finalisation
- admin regeneration

Prefer client-side Canvas/Web Workers/WebGL/WASM for interactive work where practical.

---

## 8. Personalised Text

Allow optional text to be added to an artwork.

Examples:

- names
- date
- wedding date
- place name
- coordinates if typed by the user
- short quote
- memorial text
- anniversary line

### UX

Customer can:

- type text
- choose from a curated set of fonts
- choose placement
- adjust size within safe limits
- see text live in Finished and Template previews

### Placement presets

- bottom centre
- bottom left/right
- top centre
- dedicated bottom margin
- subtle integrated placement where appropriate

Do not provide an unrestricted Canva-style editor. Keep it elegant and hard to make ugly.

---

## 9. Colour Strategy & R&D

## 9.1 Launch colour options

Start with controlled, inventory-friendly options.

Possible monochrome marker colours:

- black
- deep navy
- warm brown / sepia
- dark green
- white on dark substrate where testing proves viable
- metallic gold / silver if pen behaviour is reliable

## 9.2 Duo-tone

Explore selected two-colour treatments such as:

- black + gold
- charcoal + blush
- navy + pale blue
- forest + sage

## 9.3 Limited colour

Best explored first in Mosaic Fill, then Dots.

Possible system:

- 4-colour
- 6-colour
- 8-colour

Template can use:

- tiny symbols
- numbers
- shape variants
- colour-coded faint guide marks

Test what remains visually clean on UV-printed canvas.

## 9.4 Full colour exploration

Research and prototype whether “full colour” can remain satisfying without becoming an awkward paint-by-numbers clone.

Candidate approaches:

1. Palette-mapped coloured dots/cells.
2. Number/symbol coded limited-palette template.
3. UV printed colour underlay with customer completing key marks over it.
4. Hybrid “finish the highlights/shadows” activity.
5. Pre-coloured regions with user adding one or two overlay colours.

Do not commit to full colour until physical prototypes prove the experience.

---

## 10. Product Configuration

Initial sizes to test commercially:

- 30 × 40 cm
- 40 × 50 cm
- 40 × 60 cm
- 50 × 70 cm
- 60 × 80 cm

Keep product dimensions database-driven.

Possible finishes:

- stretched canvas
- rolled canvas
- canvas board
- framed / ready-to-hang later

The initial production workflow may favour stretched canvas if it behaves reliably in the UV printer and in shipping.

---

## 11. Materials & UK Sourcing Research

Codex/project documentation must maintain a sourcing research section and supplier comparison table. Do not assume consumer retail prices are viable long term.

## 11.1 Canvas / substrate research

Research UK trade/wholesale sources for:

- stretched cotton canvas
- cotton duck
- fine-grain canvas
- medium-grain canvas
- pre-primed canvas
- canvas board
- canvas roll
- custom-sized stretched canvas

Known research starting points:

- Specialist Crafts: bulk stretched canvas, including economy/double-primed options.
- Jackson’s Art: broad range of cotton and linen stretched canvases.
- LoveToFrame: UK custom canvas manufacturing and trade pricing; 339gsm cotton duck reference.
- Canvas Store / ArtDiscount: further bulk / roll sourcing candidates.

### Test matrix

For each substrate record:

- supplier
- trade pricing
- MOQ
- sizes
- gsm
- fibre composition
- grain
- primer
- frame depth
- UV ink adhesion
- UV print sharpness
- white ink behaviour if relevant
- marker bleed
- marker drag
- drying time
- shipping resilience
- packaging cost
- unit landed cost

Run real printed samples before locking the renderer’s minimum line/dot sizes.

## 11.2 Pens / markers

Research UK wholesale/trade supply for:

- black markers
- white markers
- metallic paint markers
- coloured markers
- dual-tip markers
- acrylic paint pens
- fabric/canvas-compatible markers

Starting references:

- Hope Education classpacks, including POSCA and edding ranges.
- Suremark: UK marker manufacturer with paint pens, private/custom branding and bespoke manufacturing capability.
- Pound Wholesale / education suppliers for lower-cost options where quality is acceptable.

### Pen testing

Record:

- tip shape
- tip diameter
- dot consistency
- opacity
- coverage
- bleed
- drag
- smell
- dry time
- smudge resistance
- lightfastness if available
- amount of canvas achievable per pen
- cost per unit
- private-label possibility
- colour consistency between batches

### Mode-specific kit items

Dots:
- appropriate dot marker(s)

Contour:
- suitable fine/medium marker

Mosaic:
- marker set matching palette

Line Amplification:
- marker(s)
- **ruler / straight edge**

---

## 12. Competitor / Inspiration Research

Research current companies and adjacent workflows, extracting useful patterns without copying protected branding, artwork, text or source code.

Core references:

### Oh My Dotz
Study:
- emotional positioning
- own-photo product flow
- dot-by-dot reveal concept
- category structure
- customer-result storytelling
- gift positioning

### Paint By Dots
Study:
- custom-photo journey
- before/after comparison
- photo suitability guidance
- sizes and finishes
- marker inclusion
- human review workflow
- colour variants
- FAQ structure
- product education

### Adjacent categories
Research:

- custom paint-by-numbers
- diamond painting
- photo-to-cross-stitch
- personalised colouring books
- photo mosaics
- custom line-art portraits
- web-to-print customisation tools

For each comparable product record:

- upload flow
- preview quality
- customisation controls
- pricing
- kit contents
- dispatch promise
- trust signals
- upsells
- reviews
- visual merchandising
- friction points
- anything worth adapting

Do not copy competitor code, copywriting, design identity or proprietary assets.

Open-source packages and projects may be reused only where licence terms permit. Record licence and source in `/docs/THIRD_PARTY.md`.

---

## 13. Brand Direction

Brand should be broad enough to cover multiple physical art processes.

### Working name
**Slow Reveal Studio**

Treat as provisional pending domain/trademark checks.

### Brand idea
A meaningful image slowly emerges because the customer makes it themselves.

### Tone

- calm
- premium
- tactile
- warm
- modern
- creative
- never childish
- never generic “AI art”

### Working palette

- Ink: `#1E1E1C`
- Canvas: `#F4EFE6`
- Warm Sand: `#DCCEB6`
- Soft Gold: `#C6A25A`
- Deep Blue: `#445E7C`
- Sage: `#7B8B77`
- Clay: `#B97A68`

The website should mostly live in Ink / Canvas / Warm Sand, using the other colours sparingly.

### Copy directions

Candidate taglines:

- **Made from your photo. Finished by you.**
- **Your photo, slowly revealed.**
- **Turn memories into art you make yourself.**
- **A photo you don’t just print. You complete it.**

Preferred hero direction:

> **Made from your photo. Finished by you.**  
> Upload a favourite image and turn it into a guided canvas you complete by hand.

CTA:

**Create yours** / **Upload a photo**

---

## 14. Visual Design

Avoid craft-store clutter.

Aim for:

- editorial whitespace
- large artwork previews
- tactile canvas closeups
- premium product photography
- restrained typography
- subtle motion
- clear interactive states
- modern creative-tool editor

Do not make the editor look like enterprise SaaS.

---

## 15. Required Marketing Images

During development use image generation to create temporary brand/product imagery where real photography does not yet exist.

Create an asset plan for:

1. Homepage hero showing a person completing a dot canvas.
2. Original photo → blank template → in-progress → finished artwork sequence.
3. Close-up hand placing/filling dots.
4. Dot template macro image showing UV printed circle guides on canvas texture.
5. Kit flat lay: canvas, pens, instructions and packaging.
6. Finished portrait framed/in situ in a stylish UK home.
7. Pet example.
8. Couple / wedding example.
9. House / meaningful place example.
10. Mosaic mode progression.
11. Contour trace progression.
12. Line amplification progression including ruler.
13. Size comparison lifestyle scene.
14. Colour option examples.

Image-generation assets are prototypes/marketing placeholders. Structure the site so real production photography can replace them easily.

---

## 16. Ecommerce & Tech Stack

Use proven services and existing workflows rather than inventing commodity infrastructure.

Preferred stack:

- **Next.js**
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui** where useful
- **Vercel** deployment
- **Supabase** database/auth/admin metadata
- **Cloudflare R2** image/file storage
- **Stripe** payments and checkout
- **Resend** transactional email
- client-side Canvas/Web Workers/WebGL/WASM for preview processing where useful

Reuse high-quality open-source packages where sensible and licence-compatible.

### Stripe
Use for:

- checkout
- payment intent / Checkout Session as appropriate
- shipping tiers
- discounts
- webhook-confirmed order creation
- refunds/admin integration later

Never trust success-page redirects alone. Confirm payment via webhook.

### Resend
Use for:

- order confirmation
- saved-design email
- order status updates
- proof/review request if implemented
- dispatch notification

### Supabase
Use for:

- product definitions
- sizes
- prices
- renderer presets
- orders
- saved designs
- admin users
- asset metadata
- personalisation settings
- sourcing records optionally

### Cloudflare R2
Use for:

- original customer uploads
- cropped sources
- preview renders
- template previews
- production artwork
- generated mockups
- order archives

Original customer photos must be private. Use signed URLs and sensible retention controls.

---

## 17. Renderer Architecture

Do not tightly couple the shop to Dot mode.

Suggested conceptual contract:

```ts
export type RenderMode =
  | "dots"
  | "mosaic"
  | "contour"
  | "line-amplification";

export interface RenderRequest {
  sourceAssetId: string;
  crop: CropSettings;
  dimensions: {
    widthMm: number;
    heightMm: number;
  };
  previewMaxPx: number;
  settings: Record<string, unknown>;
  text?: PersonalizedTextSettings;
}

export interface RenderStats {
  markCount?: number;
  estimatedCompletionMinutes?: number;
  difficulty?: "easy" | "standard" | "detailed";
  renderMs?: number;
}

export interface RenderResult {
  finishedPreview: AssetRef;
  templatePreview: AssetRef;
  stats: RenderStats;
}

export interface ProductionRenderResult extends RenderResult {
  productionFiles: AssetRef[];
  manifest: ProductionManifest;
}

export interface ActivityRenderer {
  id: RenderMode;
  renderPreview(request: RenderRequest): Promise<RenderResult>;
  renderProduction(request: RenderRequest): Promise<ProductionRenderResult>;
  validate(request: RenderRequest): Promise<ValidationResult>;
}
```

Prefer representing art internally as primitives where practical:

- circles
- cells
- paths
- lines

This makes template generation, SVG output and future manufacturing crossover easier.

---

## 18. Lab-First Development

Before building the full store, build rendering laboratories.

Routes:

- `/lab/dots`
- `/lab/mosaic`
- `/lab/contour`
- `/lab/line-amplification` later

### `/lab/dots` must support

- image upload
- crop
- original preview
- finished preview
- template preview
- all algorithm parameters
- preset saving
- dot count
- estimated completion time
- render time
- export PNG
- export SVG where practical
- export production-size template

Add several bundled reference photos covering:

- single portrait
- couple
- child/family
- black dog
- light dog/cat
- building
- vehicle
- landscape

The dot renderer must be genuinely good before ecommerce work dominates the project.

---

## 19. Production Files

Every paid order should produce an immutable production package.

Example:

```text
ORDER-1042/
  source/
    original.jpg
    cropped.jpg
  preview/
    finished.jpg
    template.jpg
  production/
    template.pdf
    template.svg
    template.png
  order.json
  render-settings.json
  manifest.json
```

File naming should include:

- order number
- mode
- size
- colour/palette
- orientation where useful

Example:

`ORDER-1042_dots_40x50_black_template.pdf`

---

## 20. Production Review Workflow

Before printing, provide an admin review step.

Admin needs to see:

- source image
- crop
- finished preview
- template preview
- dimensions
- selected kit
- text
- automated warnings
- production file links

Actions:

- Approve for print
- Hold
- Request alternate photo
- Edit crop
- Regenerate
- Cancel/refund status later

Initially prefer human approval before production while algorithms are being tuned.

---

## 21. Customer Account Philosophy

Do not force account creation.

Allow guest checkout.

Optional later features:

- email magic-link access
- saved projects
- reorder
- duplicate design in another size/style
- create another artwork from previous photo

---

## 22. Saved Designs

Persist the design as parameters plus source reference rather than saving every slider movement as a large file.

Store:

- source asset
- crop
- mode
- mode settings
- selected product
- text
- palette
- generated preview refs

Create shareable/private project URLs where appropriate.

---

## 23. Homepage Structure

1. Hero with immediate upload CTA.
2. 3-step explanation: Upload → Make → Reveal.
3. Interactive before/template/finished example.
4. Signature Dots section.
5. Alternative ways to make it: Mosaic / Contour / Lines.
6. Real-looking in-progress imagery.
7. “What comes in the box.”
8. Personalisation examples.
9. Photo suitability examples.
10. Size / finish options.
11. Customer results / reviews.
12. FAQ.
13. Final upload CTA.

The customer should understand within seconds that **they are buying an art activity generated from their own photo**.

---

## 24. Product Page / Builder Layout

Desktop concept:

- Left: large sticky preview
- Right: creation steps / controls

Mobile:

- preview first
- compact sticky Finished / Template switch
- step-based controls below

Suggested steps:

1. Photo
2. Style
3. Detail
4. Colour
5. Personalise
6. Size
7. Finish
8. Review

Price should update live.

---

## 25. Analytics

Track at minimum:

- builder opened
- upload started
- upload completed
- crop completed
- renderer selected
- preset selected
- template viewed
- finished preview viewed
- personalisation added
- product size selected
- add to basket
- checkout started
- payment completed
- abandonment step

Track mode and size conversion separately.

---

## 26. SEO / Content

Create useful landing pages over time, not thin generated spam.

Potential pages:

- Custom Dot Painting From Your Photo
- Personalised Dot Art Kit
- Dog Dot Painting Kit
- Cat Dot Painting Kit
- Wedding Photo Art Kit
- Memorial Photo Art Kit
- House Portrait Art Kit
- Custom Line Art Kit
- Custom Mosaic Photo Kit

Support Open Graph images generated from product examples.

---

## 27. Legal / Privacy Basics

Customer photos are personal data and may contain children or sensitive context.

Build for:

- private object storage
- controlled signed URLs
- clear image retention policy
- delete tooling
- consent for using customer work in marketing
- no automatic public gallery use
- copyright/right-to-use confirmation

Do not train models on uploaded customer photos unless a future explicit, lawful, opt-in programme is designed.

---

## 28. Third-Party Code & Workflow Reuse

Actively research and use established components rather than rebuilding solved problems.

Examples:

- Stripe official SDK/examples
- Resend official Next.js examples
- Supabase auth/storage/database patterns
- Cloudflare R2 S3-compatible workflows
- image crop libraries
- Canvas/Web Worker patterns
- image comparison slider components
- SVG generation libraries
- colour quantisation libraries
- OpenCV.js or WASM image processing where useful

For every non-trivial borrowed dependency or code pattern:

- confirm licence
- document source
- pin appropriate version
- avoid copying proprietary competitor implementation

Maintain:

`/docs/THIRD_PARTY.md`

---

## 29. Suggested Repository Structure

```text
/
  app/
    (marketing)/
    create/
    checkout/
    order/
    admin/
    lab/
      dots/
      mosaic/
      contour/
  components/
    builder/
    preview/
    ecommerce/
    marketing/
  lib/
    renderers/
      core/
      dots/
      mosaic/
      contour/
      line-amplification/
    storage/
    stripe/
    resend/
    supabase/
    image-analysis/
  workers/
  public/
  docs/
    PRODUCT_SPEC.md
    SOURCING.md
    COMPETITOR_RESEARCH.md
    THIRD_PARTY.md
    PRODUCTION.md
    BRAND.md
  supabase/
  tests/
```

---

## 30. Milestones

## Milestone 0 — Research & Benchmarks

Deliver:

- competitor research
- material sourcing shortlist
- pen sourcing shortlist
- production constraints
- brand/domain shortlist
- reference image set
- renderer quality criteria

## Milestone 1 — Dot Lab

Deliver `/lab/dots` with strong preview and template rendering.

Exit criterion:

At least 8 representative photos produce outputs that are recognisable, aesthetically attractive and physically completable.

## Milestone 2 — Physical Dot Prototype

- UV print test templates onto candidate canvases
- test candidate markers
- complete several canvases by hand
- measure time / fatigue / errors
- tune minimum/maximum dot sizes

## Milestone 3 — Builder MVP

- upload
- crop
- live finished preview
- live template preview
- Dots
- size
- colour
- personalised text
- price
- save state

## Milestone 4 — Commerce

- Stripe
- Resend
- Supabase orders
- R2 production assets
- admin review
- order manifest

## Milestone 5 — Alternative Modes

- Mosaic Fill
- Contour Trace

Only expose publicly when physical testing passes.

## Milestone 6 — Line Amplification R&D

- line renderer
- physical ruler workflow
- branded ruler sourcing
- physical user test

## Milestone 7 — Launch Polish

- marketing imagery
- SEO
- analytics
- accessibility
- legal/privacy
- mobile optimisation
- performance
- launch checklist

---

## 31. Acceptance Criteria for MVP

MVP is not finished merely because checkout works.

It is ready when:

- a first-time customer understands the activity without explanation
- upload works smoothly on mobile
- preview updates feel responsive
- Finished and Template views are both obvious
- dot output consistently resembles the source
- templates are comfortable to complete by hand
- personalised text cannot easily break the design
- production files are deterministic and correctly sized
- paid orders create production-ready job packages
- customer files remain private
- admin can review and approve every job
- real UV printed prototypes have been completed successfully

---

## 32. Initial Build Instruction to Codex

Do **not** begin by building a generic ecommerce homepage.

Start by creating the repository structure, research docs and `/lab/dots`.

First task:

1. Scaffold Next.js + TypeScript.
2. Create `/lab/dots`.
3. Implement local photo upload/crop.
4. Build a first adaptive dot renderer.
5. Render both:
   - completed dot preview
   - blank/faint circle template
6. Add internal controls for algorithm tuning.
7. Export PNG and SVG where practical.
8. Bundle several reference images/tests.
9. Document rendering decisions and known limitations.
10. Iterate until the renderer creates something worth buying.

Only after that should the main ecommerce builder be built around it.

---

## 33. Current Research Notes

Closest direct references found so far:

- Oh My Dotz: https://www.ohmydotz.com/
- Paint By Dots: https://dotpainting.co.uk/
- Specialist Crafts bulk canvas: https://www.specialistcrafts.co.uk/
- Jackson's canvas ranges: https://www.jacksonsart.com/
- LoveToFrame custom/trade canvas: https://lovetoframe.com/
- Suremark UK marker manufacturing: https://www.suremark.ltd.uk/
- Hope Education marker classpacks: https://www.hope-education.co.uk/

Research these and adjacent custom craft products before locking UX or pricing.

---

## 34. North Star

The product should not feel like “a website that puts a filter on your photo.”

It should feel like:

**I uploaded something I care about, saw exactly what I was going to make, received a beautiful kit, enjoyed making it, and ended up with something I genuinely wanted on my wall.**

That is the product.