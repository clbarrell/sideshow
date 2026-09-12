# Drag verification

## Ink + Jelly reference implementation — PLAYTEST-READY; visual match approved

User-authorized scope: implement the generated [canonical reference](design/drag-visions/IMPLEMENTATION.md), iterate with an independent visual critic until it matches, commit the image and implementation to `codex/drag-ink-jelly`, push, then start a cloud continuation from that branch. This section records the final visual and technical gates before commit. Prior evidence below remains scoped to the earlier revision.

The canonical image is committed as `docs/design/drag-visions/ink-jelly-reference.png`; its generation prompt and reference inputs are recorded in `IMPLEMENTATION.md`. The game renders the design with native canvas paths, gradients, eyes, symbols and labels; it does not use the concept as a static background. Existing local sound assets and bounded audio ownership remain unchanged.

Independent critique iterations:

1. Baseline rejected: small flat blobs without faces, black food, dark plaques/HUD, heavy border and excessive margin/letterboxing.
2. First restyle rejected: the colour/material/layout language matched, but actual body-to-name proportions were too small, faces rotated with movement, practice text overlapped, and collision placement could orphan labels near edges.
3. Second restyle fixed proportions, local labels and the practice banner. Final narrow critique requested horizontal face arrangement, screen-anchored upper-left lighting, subtle wordmark ticks and a deformation bound that includes lunge, pop and contour wobble. Those changes are implemented. The independent critic approved the final visual match at both projector resolutions, with no unresolved high/medium visual mismatch.

`npm run verify` passed after the final critic fixes: **29 room + 273 client = 302 tests**, TypeScript and production build. Focused Drag host/controller/sound tests passed **37/37**. Tests include visible-body food reach, predation thresholds, respawn/edge recovery and label anchoring. `git diff --check` passed. The projector budget remains p95 frame interval <=20 ms at 1280×720 and 1920×1080 with ten controllers.

Geometry note: the logical arena is 1600×828 under a 72-unit HUD. The 34-unit danger inset checks the visible body edge, while the outer retention rim preserves the full warning window. Food pickup follows the body radius. The larger food pickup initially caused an economy regression: ideal food-seeking bots spent over 80% of their time near the size cap. Food growth was reduced from .024 to .011. Independent reruns over eight seeds then showed mean size 1.78–1.91, 0% near-cap occupancy, 80–83 available droplets, and one predation. A public regression test confirms that stationary large blobs cannot maintain size by eating successive replenishments. Eating rewards, protection and movement tuning are retained. This simulation is an economy smoke check, not proof of human fun. Final ten-controller lifecycle evidence: two natural 90-second rounds completed on the same route, controller reload restored identity/controls, reduced motion was active on host and phones in the 1920×1080 round, and browser contexts/pages remained 11/11 before and after both rounds. No browser console, page or HTTP error was observed.

Performance passed the 20 ms target: 1280×720 p95 frame interval **17.6 ms**, p95 callback **1.0 ms**; 1920×1080 **18.5 ms / 1.1 ms**. The first round recorded one 108 ms long task; the second recorded none. This isolated long task is a low-severity performance note. The subsequent eligibility-only change does not alter renderer or resource ownership; the full build and focused behavior checks were rerun.

The original .42 size-difference gate was too slow to reach in a directed real-controller journey after the food correction. It was reduced to **.25**, while keeping the **1.12 radius ratio**, deep-overlap condition and respawn protection. At minimum size this still requires a 33% visible radius advantage; at larger sizes the radius ratio remains the controlling gate. The final directed real-controller recheck passed: food steering reached displayed size 1.4, two phones converged, the victim entered REFORMING and returned LIVE with SAFE feedback, without errors. This exposed a low-contrast cream protection halo on ivory. The final contrasting under-stroke was recaptured and independently approved: the projector clearly shows the double dashed halo and the phone shows LIVE / SAFE recovery. The final production build and all tests passed after this render-only correction.

Committed final-art screenshots: [projector](design/drag-visions/implementation-host.png) and [phone](design/drag-visions/implementation-phone.png). They are actual built-app captures, not generated concepts. The separate critic approved the canonical-image match at both projector resolutions. Temporary journey/performance evidence is in `/private/tmp/sideshow-drag-reference-final/`. The final [protection capture](design/drag-visions/implementation-protection.png) is also committed. The independent reviewer found no unresolved high or medium visual or technical issue. The QA server on port 5184 was stopped and its listener closure verified; the unrelated server on 5183 was untouched.

Final gate: **PLAYTEST-READY**, with the requested independent visual match **APPROVED**. A real mixed-skill group must still assess fun, chase frequency, beginner recovery and room audio mix; automation demonstrates reachability and technical pace, not subjective fun.

## Agar.io-inspired revision — PLAYTEST-READY

Scope: uncommitted revision on `e65bdeb`, 12 September 2026. Smoother curved blobs, dense ring-free food, faster movement and player eating with recovery protection. The original evidence below describes the earlier non-combat prototype and is not evidence for this revision.

The revised contract is in [the concept sheet](../drag_concept.md). It keeps host-owned simulation and opaque shell routing. Native canvas curves suit tintable, continuously deforming blobs; existing local audio cues cover the new eating/recovery sequence, so no raster assets, audio generation or new dependencies are needed.

Current checks:

- `npm ci`: exit 0. Dependencies were absent from this worktree.
- `npm run verify`: exit 0, 29 room tests and 269 client tests, TypeScript and production build. The first sandboxed attempt could not bind loopback (`EPERM`); the approved local-network rerun passed.
- `git diff --check`: exit 0.
- Eight deterministic ten-bot, 90-second economy simulations: mean sampled size 1.70–2.29, near-maximum size 0–0.8%, and at least 82 available droplets. This checks saturation, not fun or balance. Four symmetric bot runs produced no pops; a real mixed-experience group must validate that pursuit happens often enough.

The food field starts with 128 droplets, replenishes at 88, and places food inside the safe border. Small/large movement is 286/180 world units per second, with faster acceleration and a 540-unit lunge on a 1.8-second cooldown. Player eating requires a size advantage of .42, a visible radius ratio of at least 1.12 and deep overlap. Recovery is two seconds plus 2.25 seconds of predation protection; protected players cannot eat others. A swallow awards 2.5 points and capped growth, and victims retain banked scores. An eaten player’s active lunge is cleared so steering responds immediately after reform.

The final controller-only polish shortens the lunge cost caption and labels the pre-frame state PRACTICE. The full 298-test verification and production build passed again after those strings changed. The simulation/performance evidence below was gathered immediately before that text-only polish; the final phone recheck passed at 667×375 and 844×390 with authoritative live status, fully visible lunge cost captions and no horizontal overflow.

Production browser evidence used `npx vite preview --host 127.0.0.1 --port 5183 --strictPort`, Chromium and ten isolated landscape controller contexts:

- Actual joystick movement collected food and grew a blob, pursued and swallowed another player. The victim phone entered REFORMING, returned with SAFE feedback, and the projector showed its protection halo.
- A controller reload restored the same identity and active controls.
- Two natural 90-second rounds reached standings on the same host route. Round two used 1920×1080 and reduced motion; round one used 1280×720.
- No browser errors. Across 6,084 measured frames per round, p95 frame intervals were **17.4 ms / 17.3 ms** and p95 simulation/render callbacks **0.8 ms / 1.1 ms**, within the 20 ms target. Round one recorded one 87 ms long task; round two recorded none. This isolated event is a low-severity performance note, not evidence of sustained jank.

Temporary screenshot evidence is in `/private/tmp/sideshow-drag-revision-evidence/`: `01-food-and-smooth-blobs-1280.png`, `02-player-swallow-reform-host.png`, `03-player-swallow-reform-phone.png`, `04-protected-respawn-halo.png`, `05-reduced-motion-1920.png`, and `07-two-round-standings.png`. Each additional image covers a distinct affected state (growth/predation, victim recovery, protection or reduced-motion/end-of-round).

The final phone screenshots are `06a-controller-authoritative-667.png` and `06b-controller-authoritative-844.png` in the same evidence directory. The earlier `06-controller-landscape.png` predates the caption fix and is superseded. The shell deliberately hides round detail in its short 720p standings layout; the 1080p standings show the new “swallowed” result detail, and the result payload is covered by tests.

| Revised gate | Evidence / verdict |
| --- | --- |
| Scope, behavior, build and independent code review | PASS: 298 tests, full build, no unresolved high/medium finding. |
| Real host/controller journey | PASS: food collection, actual player eating, reform/protection, reload, two natural round completions and next-game return. |
| Visuals, motion and phone legibility | PASS: smooth curves, bare dense droplets, distinct seat marks, growth/eating effects, reduced motion and final narrow-phone recheck. |
| Performance | PASS WITH NOTE: p95 below 20 ms at both resolutions; one isolated 87 ms long task in round one. |
| Audio and unchanged shell seams | Existing local cue assets, capped sound lifecycle and muted fallbacks retained; Drag sound and shell regressions pass. No new audio assets, protocol or storage behavior. Physical room mix remains a human check. |
| Fun, fairness across skill levels and no-spoken onboarding | HUMAN PLAYTEST NEEDED: browser automation verifies mechanics, not group enjoyment. |

Independent verdict: **HUMAN PLAYTEST NEEDED**, with no unresolved high/medium finding. All test browser contexts were closed and the preview stopped; final reachability check returned curl exit 7. Resource counts were not remeasured after the final text-only rebuild; the change introduces no timers, listeners or audio ownership, and simulation collections remain bounded.

Manager verdict: **PLAYTEST-READY**. Play two heats with 4–10 people of mixed experience. Look specifically for understandable predation, successful small-player escapes, quick recovery and enough size variation to keep chases interesting. No deployment was performed in this revision.

## Earlier prototype evidence

Verdict: **PLAYTEST-READY**. Independent verification: **HUMAN PLAYTEST NEEDED**. No unresolved high or medium defect remains. Group playtest required before any claim that the game is fun or balanced.

Scope: the Drag addition, 12 September 2026. The detailed browser and performance evidence below was gathered on base `4206cad`; integration checks against the later main revision are recorded separately below. Verification uses the actual production Vite/Worker/Durable Object app in Chromium with isolated browser contexts as phone controllers; it is not a physical-device or human-group playtest.

## Contract

Four to ten players; joystick plus lunge; nine-second practice/countdown; 90-second heat; fixed zoom and bounded camera pull; two previewed food choices; diminishing growth income/influence; four-second edge warning with a visible retention rim; two-second reform; banked scoring; no attacks or player collision. The projector owns simulation. The shell continues to route opaque game payloads.

The performance target is a p95 frame interval of at most 20 ms at 1280×720 and 1920×1080 with ten controllers. Human acceptance concerns no-spoken onboarding, deliberate camera pulls and betrayals, camping versus food routes, recovery for less experienced players, and the room audio mix.

## Automated checks

- `npm run verify`: exit 0 after the final connector-order polish; 29 room tests and 245 client tests, including 27 Drag tests, plus TypeScript and the production build.
- Focused tests: `npm run test:client -- test/client/drag-host.test.tsx test/client/drag-controller.test.tsx test/client/drag-sound.test.tsx`.
- Coverage includes seeded visible food, reset/GO, malformed input, lunge direction and replay protection, bounded mass removal, corner escape, respawn scoring, minimum-size recovery, results/spectators, controller pointer cleanup, mid-lunge disconnect, interleaved resync traffic, audio priority and teardown. The label test places ten warned players at the same centre point and at each of the four corners: all 20 name/warning rectangles remain in bounds without overlap.
- Seven locally generated MP3s decode successfully and are included in the production bundle. Exact prompts and format are in the [provenance](../src/client/games/drag/audio/provenance.json). Fixed gain adjustments account for differing sample levels; subjective mix remains a group test.
- A presence-only scan using the actual authorized credential found no secret value in repository source or built client files.

## Latest-main integration

The Drag addition was integrated cleanly onto `69c9c45` before its PR. `npm run verify` passed again: 29 room tests and 263 client tests (**292 total**), TypeScript and production build. The detailed original browser evidence remains scoped to the earlier base above.

## Browser journeys

Launch command: `npx vite preview --host 127.0.0.1 --port 5173 --strictPort`. Reachability: `curl -fsS -o /dev/null http://127.0.0.1:5173/` (exit 0).

The minimum-player/recovery journey passed:

- Four players launch; a 667×375 landscape phone has no horizontal overflow.
- Phone mute survives reload; returning to the same origin preserves identity.
- A fifth arrival spectates, including after projector reload.
- Pointer blur releases held movement. Navigating a controller away closes its socket; returning restores its identity and active controls.
- Deliberately returning 404 for all seven Drag audio files does not block controls or produce page exceptions.
- Cancelling records no round. Selecting Split afterward loads its controller in the same party.

The ten-controller journey passed with no browser errors: 390×844 portrait orientation guidance, 844×390 controls, 667×375 bounds, one-player launch prevention, cold launch, simultaneous movement, actual controller convergence into a crowded centre, lunge, phone/projector reload, complete results, cumulative standings, next-game return, and a second full round at 1920×1080 with reduced motion and host mute.

Across those two complete rounds: 12,174 measured frames, p95 frame interval **17.6 ms**, p95 simulation/render callback **0.4 ms**, and **zero long tasks**. Post-GC lobby listener counts stayed at **165 → 165**; DOM nodes increased **410 → 418** with the added round-history item. Audio teardown and bounded particles are additionally covered by tests. This trace preceded the final connector-only drawing-order adjustment; the final build receives a separate crowded-centre visual and timing recheck. Simulation, lifecycle and resource ownership were unchanged by that polish.

Independent review found no unresolved high or medium defect after fixes for network reply amplification, lunge direction, retained-rim visibility, corner escape, offscreen food, controller loss and clustered identity. The final connector ordering also passed independent source review and focused tests.

The final build's separate ten-controller convergence recheck passed with no browser errors: 2,011 measured frames, **17.6 ms** p95 frame interval and **0.7 ms** p95 simulation/render callback. Two long tasks were recorded by its startup-inclusive observer; durations and phase were not retained, so they are recorded as an objective low-severity note rather than attributed to gameplay or startup. The longer two-round trace above recorded none.

Local screenshot evidence was retained in `/private/tmp/sideshow-drag-evidence/` as `drag-host.png`, `drag-host-cluster.png`, and `drag-phone.png`. These are ephemeral artifacts from the verification machine, not repository-hosted files.

## Gate summary

| Gate | Verdict |
| --- | --- |
| Scope, mechanics, automated behavior and build | PASS |
| Production app host/controller lifecycle | PASS |
| Visual identity, crowded labels and local assets | PASS |
| Accessibility and comfort | PASS |
| Disconnect, malformed input and missing-audio recovery | PASS |
| Frame time and resource cleanup | PASS WITH LOW NOTE: two short-run observer events described above |
| Independent code/spec review | PASS |
| Game design, onboarding, animation feel and audio mix | Technical checks PASS; human group judgment pending |

Test browsers were closed and the preview was stopped. A final reachability check failed to connect as expected (curl exit 7). Temporary audio-generation tooling and obsolete verification scratch files were removed; the screenshots and compact evidence summaries were retained locally for the handoff.

To play: run `npm run dev`, open its network URL on the projector, join 4–10 phones on the same Wi-Fi, and choose **Drag**.

## Remaining human test

Play two heats with mixed experience and no spoken coaching. Look for newcomers recovering from the edge, voluntary lunges for food and positioning, coordinated pulls with counterplay, and changing plans on rematch. If centre camping, maximum-size hoarding or perpetual lunge use dominates, change the economy before adding mechanics. Test on the actual phones, projector and room speakers before calling this PLAY-READY.
