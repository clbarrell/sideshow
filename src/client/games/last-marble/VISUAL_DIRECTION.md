# Last Marble visual direction

## Player promise

The projector should read like a fairground marble table stripped to its useful
parts: one fixed overhead platform, ten unmistakable player tokens, and one
danger signal. The grey-box exists to prove that a player can line up a hit and
say, “I meant that.” Decoration waits until that is true in a group playtest.

## Hierarchy

1. **Marbles and travel direction:** seat colour plus persistent name, seat
   number. A short trail or
   arrow communicates momentum; the platform never scrolls or zooms.
2. **The threatened tiles:** mustard diagonal hatch and a large 3–2–1 across
   every tile in the warned group, becoming coral only on the final beat.
   Removed tiles expose the deep-teal void. Timing never relies on colour or sound.
3. **Attribution and match state:** a brief attacker → victim callout for a
   qualified hit or knockout; heat number, survivors, and cumulative scores stay
   at the edge of the playfield.

## Native-canvas language

- Palette: deep teal void (`#0e2226`), warm cream concrete (`#f6efe2`), ink
  seams (`#17383f`), mustard warning (`#ffc24a`), coral drop (`#ff5a47`). Seat
  colours come from the existing shell identity palette.
- Shape: a 5×5 edge-to-edge cream tile floor, 100 units per tile, with heavy
  seams; circular marbles carry a plain, outlined seat number. No extra player
  glyphs or patterns, and no raster assets.
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

## Result pauses

Heat results show only the outcome and next-heat countdown for eight seconds.
The final winner banner holds for five seconds. The arena and live HUD yield
to the result; scoring rules belong in the opening instructions, not the pause.
