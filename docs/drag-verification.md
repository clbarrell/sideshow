# Drag prototype verification

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
