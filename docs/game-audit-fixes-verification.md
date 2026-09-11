# Seven-game audit fixes — implementation and verification

Base: `e20b4cb`. Implementation branch: `codex/game-audit-fixes`.
Audit sources: the committed Cut & Shut audit and the six reports at audit commit
`3821567`. The retained audit worktree was read, not modified.

## Delivered behavior

| Game | Implementation and design decision |
| --- | --- |
| Cut & Shut | Competitive six-step deliveries are explicit. First deal is stationary; subsequent folds happen **before** trading/planning. A private, host-computed oriented-road forecast shows all six courier outcomes before confirmation. Forecasts explicitly depend on roads placed so far. Numbered tiles, destination markers, longer planning/resolution and causal recaps connect choices to points. Private preview updates coalesce into the regular snapshots. |
| Split | A fixed, four-second forecast rift pressures idle formations; players can dodge together. Both queued and active edge strikes retain their committed target. The single 55-second heat, survival/finish/edge-KO scoring and role handoff are taught. Public status batching retains 10Hz feedback within the router budget. The clock is moved clear of shell controls. |
| Log Runner | A perspective river diorama replaces the flat display: cylindrical bark, cut-end rings, layered canyon/trees/water, numbered lumberjacks, distinct hats, poses and splashes. One current obstacle is shared by every phone/projector. A locked answer stays visible; repeats cannot answer a later obstacle. Every real, fake and bank warning retains 2.4 seconds plus fixed late grace. Ten seconds of equal, unscored practice replace selective rescue. Survival points/placement bonuses and stumble-only bank play are explicit. Stable roster positions anchor characters and falls. |
| Backyard Circuit | Fixed world-sized bumpers match collision geometry. Restrained lateral slip and steering inertia add weight while traction recovers quickly. Host-confirmed boost readiness/bursts, laps, race/finish time and outstanding-checkpoint recovery are explicit. A separate heading flag remains readable at shared zoom; bounded bump headlines and a compact recovery list reduce pile-up clutter. Public feedback is batched. |
| Last Marble | Live match totals expose survival +1/s, KO +2 and win +5. The stick persists through preparation and a visible GO releases play. Early-out players see a refreshed upper-bound wait. Forty-second heats remain; repeated early elimination still needs group evaluation. |
| The Gun | One transform owns the facing cue. Holding the gun is the primary scoring instruction. Local press response is separated from host-accepted action cues, protection, respawn and cooldown status. Public batched status/cues retain rapid feedback without exceeding the router budget. |
| Featherweight Championship | Collision → dropped egg → pickup scoring is taught. Owner head start/pickup availability are labelled. A horizontal-only relative drift lane communicates the actual horizontal movement affordance and ignores vertical thumb movement. |

The shell remains Canvas2D and the host remains the simulation authority. The
Durable Object still treats game payloads as opaque. Three.js was assessed for
Log Runner; a fixed-camera projected diorama avoids a second rendering context,
compositing lifecycle and new dependency. This is accurately described as a
Canvas2D perspective scene, not WebGL 3D. No runtime assets, remote fonts, new
packages, credential access, deployment or push were introduced. Existing local
sample/procedural audio is retained, with accepted-action feedback changes where
needed.

## Automated and independent evidence

`npm run verify` runs room tests, client tests, TypeScript and the production
build. At code revision `38ea3b4`, it exited 0: 29 room tests and 216 client
tests (245 total), followed by successful TypeScript and production builds.
Focused suites were run before the full verification. The subsequent Last Marble
slice change has its own verification record below.

Regression coverage includes shared/repeated Log answers, full warning spacing,
equal practice, stable splash positions, Kart handling/contact/recovery/boost,
Split idle pressure/frozen targets, private road previews, Marble preparation,
Gun accepted feedback, horizontal drift, and ten-player outbound message budgets.

Independent reviews were performed by agents who did not author each area.
Review exposed and fixed the Gun traffic failure, adjacent Split/Kart traffic
failures, private-preview bursts and the Log splash-position mismatch. A separate
visual review accepted the diorama and identified the splash defect before its
fix. A 100-seed Log simulation kept a perfect runner alive for all 80 scored
seconds against nine bank players: 786 admitted branches, with at least 0.40s
between the prior impact and the next warning (above 0.15s grace). A separate
30-seed outbound sweep found no token-bucket deficit in Marble, Joust or Log.

## Real application evidence

The production Vite/Worker/Durable Object preview was tested at
`http://127.0.0.1:5197`; `curl -fsS -o /dev/null` verified the entrypoint.
Chromium used independent browser contexts, **not shared-origin tabs pretending
to be different devices**. Actual `innerWidth`/`innerHeight` were measured at
390×844 portrait and 844×390 landscape. Projector checks used 1280×720 and
1920×1080. These are emulated phone surfaces, not physical handsets.

The compact screenshot bundle is `/private/tmp/sideshow-game-fixes-evidence/`.
Screenshots document visible states; motion, input, phase and score claims below
come from driving the live routes. No simulation clock shortcuts were used.

| Journey | Live evidence |
| --- | --- |
| Common lifecycle | Real rooms, ten distinct joined/ready identities, launch, actual round completion, standings and next-game. Host and controller URLs and identities persist. |
| Log Runner | Repeated real cycles, once with all idle and once with two scripted survivors/eight bank players. Repeat taps did not consume another warning. Shared locked answer and bank roster captured; bank throws exercised. Active phone reload reclaimed identity/role and continued answering. Two full-duration survivors each received 80 survival points +15 tied-first bonus. |
| Cut & Shut | Ten-player four-deal game completed. Private oriented forecast and confirm were exercised repeatedly. The confirmation target measured x27/y662/336×48 within a 390×844 viewport, with no horizontal or vertical overflow. Observed recap → fold → market → commit → six-step march → recap on later deals. Confirmed roads visibly locked. A supplemental real trade was accepted, competing tile confirmation returned an explicit tile-taken recovery, and reloading a committed phone retained TILE 01 LOCKED. Naive scripted placements earned zero; this run does not prove strategy quality or positive-delivery comprehension. |
| Kart | Ten touch-emulated controllers drove simultaneously, combining steering and accelerator. Boost changed from ready to host-confirmed boosting and recharged; active phone reload kept Alex's identity. Race ended naturally, standings and next-game retained the room. Initial busy-state screenshots exposed heading/clutter issues, followed by focused rendering fixes. |
| Split | Ten idle players saw the four-second rift warning and transitioned into edge/survivor roles, instead of the old no-cut equal +9 outcome. Edge aim/strike/recharge and phone reload were exercised. Round ended naturally and returned to the same room. |
| Gun / Marble / Featherweight | Independent Terra verification completed all three ten-controller lifecycles: launch, actions, active phone reload with identity retained, natural finish, standings and next game. Marble completed all five heats and exposed out/wait/preparation/GO states. Gun also completed a muted, reduced-motion run with trusted input and no errors. Frame-interval p95 was 17.4ms Gun, 17.9ms Marble and 18.0ms Featherweight. A supplemental two-phone Gun run directly observed pickup, LOADED / 1 SHOT / FIRE, a real Fire click, host ALEX FIRES with tracer, RELOAD 4.2, and 2 hold points; no errors. Three bounded Featherweight attempts did not directly reproduce egg pickup/theft, so that specific action remains inconclusive despite the completed ten-player scoring journey. |

The final Log confirmation kept all ten scripted runners alive for a complete
80-scored-second contest at 1920×1080: 6,146 sampled frames, CPU update/draw p95
1.7ms, frame-interval p95 17.5ms, zero long tasks. This satisfies the 16.7ms CPU
frame budget. Earlier complete cycles measured 1.2ms CPU p95 at 720p and also
exercised eight bank players. These are local Chromium measurements, not venue
hardware guarantees. Canvas-mock timing is not used as browser rendering proof.

## Human playtest boundary

No human group played these builds. No-spoken comprehension, physical grip and
touch comfort, shared-room excitement, washed-out venue projection and room audio
mix are unproven. In particular, test Log's non-scoring bank role, Marble's early
elimination wait, whether Split's rifts encourage enjoyable coordinated movement,
and whether C&S newcomers can choose a useful delivery rather than merely explain
a failed route. Kart's modest slip should be compared by mixed-skill drivers.

These are human acceptance questions; passing scripts cannot establish
**PLAY-READY**. The seven-game audit revision `38ea3b4` is **PLAYTEST-READY**: automated checks, full real-surface journeys and independent review passed; no unresolved high/medium finding remained. The later Last Marble slice change is verified separately.

## Historical follow-up: Last Marble pizza slices

Superseded by the 5×5 tile floor at `5c4b2f7`. See
[last-marble-grid-verification.md](last-marble-grid-verification.md) for the current
implementation and verification. The following records the earlier slice build.

The user requested more independently disappearing floor surfaces, favouring
pizza slices over a 3×3 grid. The arena now uses eight numbered circular sectors.
A seeded clockwise/counterclockwise sweep removes one every five seconds while
leaving the remaining pie connected. Warnings remain three seconds long, starting
at heat seconds 2, 7, 12, 17, 22, 27, 32 and 37. Scoring, controls, five heats and
the 40-second heat limit are retained. There is no permanent safe centre hub.

The circular fill and support test share the 250-unit radius and radial boundaries.
Seams are outlines over continuous support, not invisible gaps. Warning hatch is
stationary, with a large countdown and numbered HUD warning. This retains visual
meaning when muted or using reduced motion. Native geometry and retained crack
cues require no new assets or dependencies.

On slice revision `6a2db67`, `npm run verify` exited 0: 29 room tests and 217
client tests (246 total), TypeScript and production build. The initial sandboxed
attempt could not write Vite's shared cache; the authorized rerun passed. Coverage
includes 200 seeded connected removal paths, all eight slice interiors and seams,
centre support, circular bounds, and full three-second public host warnings.
`git diff --check` passed. Preview command:
`npx vite preview --host 127.0.0.1 --port 5198 --strictPort`;
`curl -fsS -o /dev/null http://127.0.0.1:5198/` exited 0.

Independent review of the final slice source found no unresolved high/medium
findings. The reviewer independently reran the 18 host tests and checked the
circular boundary, angular seams, connected sweep, warning/crack timing and
reduced-motion hatch.

Real-surface verification on `6a2db67` passed with ten isolated 390×844 controller
contexts: join/ready, post-GO joystick, same-phone reload identity, all five natural
heats, elimination recovery/intermission/GO, standings and next game at the same
host route. Zero console/page errors. The first warning identified Slice 1 with
hatch and countdown; the next capture shows only that wedge absent. A separate
two-phone reduced-motion launch retained a clear warning and exited normally.
The alive phone showed DRAG TO RAM and the updated slice instruction.

Frame-interval samples: 720p 883 frames, p95 18.1ms; 1080p 350 frames, p95 17.9ms;
zero intervals over 50ms in either sample. These are short local browser samples,
not venue-hardware guarantees. All test browsers and the preview were closed.

Evidence remains in `/private/tmp/sideshow-slices-evidence/`:
`last-marble-warning-host.png`, `last-marble-removed-host.png`,
`last-marble-warning-phone.png`, and `last-marble-reduced-warning-host.png`.

**PLAYTEST-READY.** Scope, automated checks, real lifecycle, readability, warning
feedback, reduced motion, reconnect and independent review pass. Brief overlapping
names/callouts in ten-player contact are a low-severity note; numbered marbles and
the seat strip retain identity. Shared shell, network protocol and audio assets
are unchanged and covered by the prior audit/regression checks. Human participants
still need to assess whether the tighter circle and more frequent small drops
improve recovery choices and room excitement, and whether early-out waits feel fair.
