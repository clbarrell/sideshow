# Log Runner — river diorama

The requested redesign replaces the flat field-guide world. A low, fixed perspective looks upstream through a cedar canyon; ten lumberjacks share a broad cylindrical log in the foreground. A warm sun, layered cool hills, faceted banks, lit foliage, moving water ribbons and rolling bark establish depth. The camera never shakes or moves away from the whole group.

Mode: Experience. The first viewport must prove identity, the two obstacle heights, and the competitive survival objective. The signature interaction is the whole row reacting to one approaching branch; each locked answer stays visible above its runner until impact. The palette is deep spruce #102E32, warm foam #FFF3D7, clear teal river and amber hazards #FA9B42. Local Archivo remains the display face. Names stay fixed while characters jump, duck and stumble; hats vary by silhouette, with seat numbers as the reliable ten-player key.

## Rendering choice

Three.js was considered seriously: a PerspectiveCamera, low-poly CylinderGeometry log, instanced trees, lit materials and a WebGLRenderer could provide this scene. Its renderer produces a separate canvas ([official renderer documentation](https://threejs.org/docs/#WebGLRenderer)); the current shell owns one Canvas2D surface. It would require compositing an offscreen WebGL canvas each frame, a second context lifecycle and renderer failure handling, or a broader GameHost change. This scene has one fixed camera, a few hundred simple faces and no dynamic light/shadow requirement. Projected world coordinates and deliberately shaded facets carry the depth inside the existing renderer, with no new dependency or GPU-resource lifecycle. This is a perspective Canvas2D diorama, not a claim to ship WebGL 3D.

## Art and motion contract

The log wraps six lit facets around a cylindrical cross section; rings expose its cut end. Obstacles approach from upstream and span the whole log. High branches occupy head height; roots occupy foot height. Water and bark move continuously while labels stay still. Reduced motion freezes environmental movement and removes stumble rotation; threat approach and explicit timing remain. Responsive poses, splash droplets and persistent choice labels separate tap, host acceptance and outcome.

Code-native geometry is the production art: it scales, tints and animates without bitmap loading. The existing local sound library already supplies warning, jump, duck, splash, throw and finish cues; the redesign reuses it. No new audio generation or additional spend is needed. Independent real-browser inspection must assess the resulting composition and 1080p maximum-player frame budget.
