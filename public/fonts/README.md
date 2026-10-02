# Lettering source licences

SRS Serif Outline and SRS Sans Outline are vector subsets derived from the regular 400-weight WOFF files in @fontsource/playfair-display@5.3.0 and @fontsource/dm-sans@5.3.0. The original authors and complete SIL Open Font License 1.1 notices are retained beside this file. The derivative vector data remains under the OFL; documents created with it are not required to adopt that licence.

The derivative data uses SRS names, respecting Playfair Display's Reserved Font Name. Source attribution does not imply endorsement. The application maps its generic Serif/Sans choices to these internal outline sets. Rebuild with `node scripts/build-font-data.mjs`. Source font hashes are recorded in `lib/renderers/font-data.json`; the runtime does not download fonts or call a font parser.

The build-only tools opentype.js@2.0.0 (glyph outlines) and fontkit@2.0.4 (kerning including GPOS extension positioning) are MIT licensed.
