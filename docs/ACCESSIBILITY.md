# Accessibility verification

## Controls and readability - 28 September 2026

This is a scoped software check, not a complete accessibility audit or evidence from people using assistive technology. Physical template visibility is a separate material-trial requirement; the artwork's guide colour, opacity, dimensions and geometry were not changed by the UI styling work.

The UI targets at least 4.5:1 for ordinary text and 3:1 for meaningful control boundaries, following W3C guidance on [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Ratios below use sRGB relative luminance and the actual CSS foreground/background pairs. Disabled controls, decorative graphics and photo-derived artwork are not counted as ordinary UI text.

| Element | Before | After | Evidence |
|---|---:|---:|---|
| Inactive design-step text | 2.66:1 | 6.10:1 | Final computed styles measured in the browser |
| Mode / small preset text | 3.27:1 | 6.10:1 | Final computed styles measured in the browser |
| Render-warning text | 3.42:1 | 5.56:1 | Final computed styles measured in the browser |
| Safe-area checkbox label | Below 4.5:1 | 5.66:1 | Final computed styles measured in the browser |
| Homepage reassurance | 3.67:1 | 5.66:1 | CSS pair calculation; homepage inspected |
| Upload hints | 2.56:1 | 5.73:1 | CSS pair calculation; upload control exercised |
| Input placeholders | 2.29:1 | 6.37:1 | CSS pair calculation |
| Input boundaries | 1.37:1 | 3.97:1 | CSS pair calculation |

Muted labels, warning text and control outlines are darker while retaining the existing palette. Step numbers no longer reduce their text opacity. Comparison labels use an opaque backing so their contrast does not depend on the photograph. Native range controls have visible tracks/thumbs and keyboard outlines. Comparison and toast controls have visible focus treatments. Faint renderer marks remain unchanged.

Studio style, built-in/shared presets, marker colours and reference-photo buttons expose their selected state through `aria-pressed`; design steps expose the current step. Homepage preview buttons do the same. Range value text includes displayed units. The contrast slider uses 0.01 steps, so its native value matches the Standard preset's 1.12 instead of rounding that control to 1.10. Preset settings and rendered values are not changed on load. Upload inputs are hidden from the tab order; their labelled, visible buttons still open the native chooser. Semantics follow the W3C [button](https://www.w3.org/WAI/ARIA/apg/patterns/button/) and [slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) guidance.

The local in-app browser verified Space selection of Easy, Enter selection of Deep navy, corresponding accessible selected states, and arrow-key contrast changes in 0.01 steps. Custom tuning cleared the built-in preset's selected state. Upload through the visible button loaded the licensed black-dog fixture. Homepage Space activation changed both the preview and selected state. At 390 x 844, the editor had no horizontal overflow, keyboard tuning remained usable, and the comparison slider changed from 50 to 51 with visible focus. Desktop homepage, photo-guide and empty-basket views were visually inspected. No console warnings or errors were recorded.

Evidence: [desktop tuning](studio-accessibility-desktop.png), [mobile tuning](studio-accessibility-mobile.png), [mobile keyboard comparison](studio-comparison-keyboard-mobile.png), [homepage template toggle](home-accessibility-preview.png). These show digital artwork and licensed test photographs, not completed physical kits.

Remaining work includes representative screen-reader and touch-assistive-technology sessions, real devices, zoom/reflow, complete focus order, pointer target sizes, all dynamic/error/payment/admin states, forced colours and a full WCAG audit. CSS ratios and an accessibility tree cannot establish complete accessibility or physical guide legibility.
