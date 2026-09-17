# Getaway: Toybox Caper build

Status: visual direction and action experience independently approved; human party playtest remains.

## Acceptance contract

The actual game must read as the selected [Toybox Caper image](visual-concepts/getaway/toybox-caper.png): a tactile miniature bank courtyard, cream stone, rounded masked crooks, sculptural metal vault, hedge planters and open-backed team vans. A palette-only change does not meet the request. Preserve the whole-arena camera, clear routes, phone joystick/shove controls, four-to-ten player support and fixed odd-crew scoring.

Production uses separate optimized local raster layers, with runtime identities, bags, shadows and action feedback. The reference is inspiration rather than a baked screenshot in the playfield. Minor camera, peripheral decoration and typography differences are acceptable when they improve readability. Core materials, modeled depth, character silhouettes and prop identity are required.

## Independent review targets

- Warm, uncluttered paved courtyard with modeled bank perimeter and four hedge planters.
- Consistent lighting, materials and grounded contact shadows across all layers.
- Masked crooks with directional silhouettes, movement, load stacks and clear team/seat identity.
- Dominant sculptural vault with readable supply and closure states.
- Open-backed modeled vans with obvious deposit targets.
- Compact physical scoreboard, readable at projector distance and clear of shell controls.
- Shove anticipation/contact/recoil and a visible, contestable spilled-bag arc.
- Ten-player legibility at 1280×720 and 1920×1080, including crowding and cover.

Spilled gold must finish beyond a stationary victim's immediate pickup range; a temporary overlap at a wall must not restore the bag automatically. Other players can contest a landed bag, and the original owner can recover it by moving away and returning.

## Required evidence

Fresh public-seam behavior tests and `npm run verify`; actual lobby → controller → game → standings → next game; reference-to-live screenshot critique and iteration; load/shove/closure/reduced-motion/asset-failure checks; two complete maximum-player cycles with a 60 Hz target (p95 frame interval approximately 16.7 ms, no sustained long tasks or accumulating resources). Simulated controller activity is technical QA, not evidence of human party fun.

Asset prompts and provenance live in [production/prompts.md](visual-concepts/getaway/production/prompts.md). Accepted PNG source renders remain in the generated-image archive; runtime assets are WebP under `public/images/getaway`.

## Evidence and verdict

Independent final review: visual/action PASS, source review PASS, automated checks PASS. Actual full-resolution ten-player frames at30/45/60/90 seconds show readable crew/seat identities in the central scrum, directional crooks, heavy loads, loose gold, vault stocks, shoves, and unclipped northern routes. The reviewer explicitly accepted the actual game as recognizably matching the selected Toybox Caper reference, with practical camera/layout tradeoffs. See [the actual game image](visual-concepts/getaway/toybox-in-game.webp).

Human party fun, room audio balance and odd-roster competitiveness still require real participants. These are not claimed as proven by automated controllers.

## Iteration record

1. Replaced flat scenery with eight layered, generated miniature assets. Rejected opaque checkerboard outputs, corrected the courtyard's walkable bounds, normalized transparent cutouts and atlas cells. Runtime files total378,758 bytes; alpha is present on every prop/character and intentionally absent on the courtyard. No runtime image-generation calls or new package dependency.
2. Independent first-frame critique rejected oversized identity rings, floating labels, oversized van badges, broad team washes and a wide scoreboard. Enlarged crooks, attached labels to hats, used small painted van marks and reduced UI weight.
3. Moving QA exposed northern HUD occlusion and a dense gold belt. Added visual projection `screenY=130+0.84*worldY`, preserving physics/routes and counter-scaling characters/type; seat numbers now survive overlapping name pills. Each bay shows one sack plus stock count; score details are larger; full-height banking boundaries match the existing rule. Practice formations stagger to preserve identity.
4. Independent mechanic review found overlapping bay pickup radii and hedge-adjacent stranded spills. Radius45 preserves separate bays. Spills use normalized direction, a safe112-unit endpoint with alternate-side selection, exact landing tween, owner-separation eligibility, a path and landing marker. Loose loot draws above cover. Tests cover these public simulation behaviors.

## Automated and asset checks

- Final candidate `npm run verify`: exit0;31 room tests +268 client tests =299 passing; TypeScript and both production builds pass.
- Independent `getaway-host.test.tsx` + `getaway-art.test.tsx`:36 passing; independent TypeScript check passes.
- `git diff --check`: exit0.
- All eight WebPs decode with expected dimensions; seven have real alpha. Local source archive and production prompts are recorded alongside the encoder.
- Presence-only client bundle scan: `ELEVENLABS_API_KEY` value absent. Environment remains local and ignored.

## Performance observations

Actual built app in a1920×1080 iframe at DPR2, ten separate phone origins, real controller messages. Temporary QA UI drives pointer events; no simulation state injection. These are automated participants, not a human playtest.

| Final candidate run | Frame samples | Interval p95 | Render callback p95 / max | Long tasks | End resources |
| --- | ---: | ---: | ---: | --- | --- |
| Cold |10974|17.5ms|1.0 /23.3ms|0|RAF0, timeouts0, intervals0, voices0, listeners14|
| Warm1 |10953|17.7ms|0.8 /10.1ms|one67ms|same baseline|
| Warm2 |10969|17.6ms|0.7 /9.4ms|one53ms|same baseline|

The isolated warm long tasks are browser-session observations, not measured render callback costs; do not claim zero long tasks. Sustained rendering remains near60Hz with no growing game resources, and maximum render callback stays below16.7ms in warm runs. Explicit `image.decode()` removed the earlier140ms cold long task. Audio peaks at3 voices, returns to0, and all eight cues decode without failure. Browser-reported app errors are empty in these final-cycle reports.

5. Final crowd critique rejected overlapping name pills during a simultaneous vault scrum. Crowded identities now use stable outward team columns with leader lines; unobstructed labels stay attached. A ten-actor coincident-position test proves separation, bounds and unchanged physics. The label layout uses bounded loops with no per-frame array allocations. Very separated simultaneous scrums can produce longer leader lines; this is a deliberate simple layout tradeoff.

## Final handoff

The independent reviewer accepted all four final actual-canvas captures, including every name in the maximum central scrum and heavy-load/loose-gold readability. Final full verification is299 tests; independent host/art36 tests and TypeScript pass. The clean final art/action evidence is `/tmp/getaway-toybox-qa/final-ten-{30,45,60,90}.png`; the90-second frame is also saved as the linked in-game WebP.

Reduced-motion plus missing-asset smoke check: all8 image requests returned actual HTTP404, all8 audio requests returned injected404, native canvas fallback rendered, reduced-motion preference was active, and no uncaught browser error occurred. This last run remained at the expected “waiting for6” gate after six test phones had been closed; a complete degraded-assets playthrough is therefore **not claimed**. The normal10-phone lifecycle and repeated cycles passed. The user requested that work be wrapped up; the remaining expanded degraded-assets journey is recorded as a verification limitation rather than delaying visual delivery.

Verdict: **requested visual upgrade COMPLETE; independent visual/action PASS; automated/source PASS.** No broader release-ready claim. Human group play remains necessary for fun/balance judgment. Test browser tabs and the run's preview/proxy servers were closed at handoff.

## Player-label correction — 2026-09-13

User play feedback supersedes the earlier crowd-stack approval: tracing leader lines to distant names is difficult. Names now stay attached immediately above each avatar, including in crowds. Team-wide columns and connecting lines are removed. Temporary overlap in a tight scrum is preferable to detaching a player's name from their character; numbered torso badges remain. Earlier screenshots show the previous label layout and are historical evidence only.

Correction verification: focused host/art36 tests and TypeScript pass; fresh `npm run verify` exits0 (31 room +268 client =299 tests, production builds pass); `git diff --check` passes. A temporary browser fixture using the actual renderer checked10 avatars, a vault crowd, the northern HUD boundary, and both horizontal screen edges. Evidence: `/tmp/getaway-attached-labels.png`. Labels stay above their owners with a roughly5–6px hat gap; horizontal movement is limited to the minimum viewport-edge clamp. No new full phone/lifecycle run was needed for this label-only correction. Temporary preview page/tab/server were removed/stopped.
