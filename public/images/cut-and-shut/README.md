# Cut-and-Shut courier atlas

`courier-atlas.png` is a locally generated, transparent 1254 × 1254 four-view sprite atlas for the Cut-and-Shut host renderer.

- Generator: built-in ImageGen
- Prompt: “2x2 transparent isometric clockwork postal courier atlas, navy cap cream face oxblood coat golden parcel, 4 compass orientations.”
- Source output filename: `exec-65b88cdf-1d94-46ae-89cb-fff41f307cc7.png` (local ImageGen output, copied intact to this directory).
- View order: NE (top-left), SE (top-right), SW (bottom-left), NW (bottom-right)

The runtime crops and pads each source view in `src/client/games/cut-and-shut/courier-sprite.ts`; the raster itself is kept intact.

## Full generation prompt

Use case: stylized-concept. Asset type: production game sprite atlas for Cut & Shut, a playful isometric road puzzle on dusty lilac tiles with acid yellow roads and cream/near-black ink. Create ONE square sprite sheet with a genuinely transparent background, exactly 2 columns by 2 rows, four equal square cells with no drawn grid, labels, text, numerals, ground, scenery or shadows outside the character. Each cell contains the SAME charming small clockwork parcel courier, full body, large readable silhouette, navy postal cap, cream face, oxblood coat, golden-yellow square parcel held at chest, short boots. Clear polished hand-painted 2D game art with thick near-black outlines and restrained flat shading, not photorealistic, not a mockup. Use consistent isometric camera looking down about 30 degrees. Four views: top-left courier facing northeast (away-right), top-right facing southeast (toward-right), bottom-left facing southwest (toward-left), bottom-right facing northwest (away-left). Same proportions, identity, scale and lighting all four. Each sprite centered horizontally in its cell, feet at 88% of cell height, top of hat at 12%, no pixels crossing cell boundaries, generous transparent gutters. Front-facing views must visibly show the parcel; rear views show postal satchel. Readable when each character is drawn only 42 to 56 screen pixels high. This is a single atlas of rotation views of ONE courier, not four different characters. Transparent alpha, no checkerboard baked into image.
