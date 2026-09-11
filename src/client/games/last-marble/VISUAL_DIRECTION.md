# Last Marble visual direction

## Player promise

The projector should read like a fairground marble table stripped to its useful
parts: one fixed overhead platform, ten unmistakable player tokens, and one
danger signal. The grey-box exists to prove that a player can line up a hit and
say, “I meant that.” Decoration waits until that is true in a group playtest.

## Hierarchy

1. **Marbles and travel direction:** seat colour plus persistent name, seat
   number, and one of ten cream/ink glyph-pattern combinations. A short trail or
   arrow communicates momentum; the platform never scrolls or zooms.
2. **The threatened slice:** mustard diagonal hatch, a distinct slice number,
   and a large 3–2–1 for the complete fixed warning, becoming coral only on the
   final beat. Removed slices expose the deep-teal void. Timing never relies on
   colour or sound.
3. **Attribution and match state:** a brief attacker → victim callout for a
   qualified hit or knockout; heat number, survivors, and cumulative scores stay
   at the edge of the playfield.

## Native-canvas language

- Palette: deep teal void (`#0e2226`), warm cream concrete (`#f6efe2`), ink
  seams (`#17383f`), mustard warning (`#ffc24a`), coral drop (`#ff5a47`). Seat
  colours come from the existing shell identity palette.
- Shape: eight edge-to-edge radial pizza slices in a 250px circular arena with
  heavy seams; circular marbles carry a numbered crest and a redundant
  geometric glyph/pattern. No raster assets.
- Type: existing Archivo/system stack, uppercase signage, heavy weights, and no
  essential projector text below 20 CSS px at 1280×720.
- Texture: flat, high-contrast geometry in the first playable. A restrained
  concrete speckle may be added only after it survives washed-out-projector QA.
- Motion: 80–120 ms contact squash/burst, short velocity trails, widening crack
  anticipation, then plate fade/drop. Camera punch is render-only and capped at
  2 px. Reduced motion removes trails, squash, and punch while retaining contact
  normals, hatch, outline, numerals, and state changes.

## Investment gate

Do not commission or generate raster art until 1v1 tests show deliberate straight
rams, glancing hits behave differently, release stops within two marble diameters,
and at least 90% of displayed knockout credits are defensible. If a 6–10 player
playtest still describes the result as random or slippery, tune or simplify the
physics before adding visual density.
