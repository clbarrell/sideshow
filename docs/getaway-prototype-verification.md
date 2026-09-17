# Getaway prototype verification

Scope: the first playable grey-box described in [the concept](getaway-concept.md), not a production release. The testable promise is that carrying risk creates opportunities for escorting and interception with only movement and shove.

## Acceptance and limits

- Real lobby → cold controller load → practice → countdown → live heist → team results → next game.
- Balanced 4/6/8/10-player matches; explicit refusal for unsupported rosters.
- Host-owned simulation, opaque routed payloads, existing controller kit and unchanged party URLs.
- Test pickup, capacity/slowdown, shove/protection, delivery, team scoring, timers and disconnect handling at public seams.
- Inspect one real projector and independent phone surfaces, including ten-player legibility.
- Target 60 fps at 1280×720 and 1920×1080, with a 16.7 ms frame budget. Do not substitute CPU-only simulation timings for measured browser frame times.
- Native geometric art and silent play deliberately keep the first prototype focused on the rules. Every critical event must remain visibly understandable. Production music, sound effects and raster assets are outside this prototype milestone.
- Only a real group can establish voluntary escorting, mixed-skill fairness, room energy and comprehension without spoken explanation.

## Test environment

The local production preview uses port 5179 to avoid another task's server. Test phones use loopback-only proxy origins on ports 5181–5190, all forwarding to that same local Worker and room. Each origin has separate browser storage and therefore an independent durable device identity. This substitutes origin isolation for separate browser profiles; it is not ten physical handsets or a mixed-device network test.

Baseline before game implementation: `npm run verify` passed 29 room tests, 217 client tests and the production build. This is a baseline only, not verification of Getaway. Tests require local socket access outside the filesystem sandbox.

## Verdict

**Core prototype implemented and browser-verified; human group playtest needed. Full production/play-ready verification is incomplete.** No deployment or merge is claimed.

Tested state: uncommitted Getaway game directory, registry entry and two test files on base `cd34695`, 12 September 2026. No shared server/protocol changes. The concept/catalogue and this report are also local changes.

| Gate | Result | Evidence / limit |
| --- | --- | --- |
| Core rules and scope | PASS | Host-owned hauling, shove/spill/protection, team banking, fixed vans, practice/runway and 150-second match. |
| Automated behaviour/build | PASS | `npm run verify`, exit 0: 29 room tests + 242 client tests = 271, TypeScript and production build. Final focused rerun below also passed. |
| Host/controller journey | PASS | Real four-player match: controller movement → five bags collected → slower return → five banked → team standings → next game, same room URLs. Final ten-player build launched and recovered as described below. |
| Roster policy | PASS WITH NOTES | Five-player launch visibly refused with EVEN CREWS NEEDED and disabled controls; Exit game returned to lobby without adding a result. The generic catalogue still says 4–10: even-only is explained in preview and enforced inside the game. |
| Onboarding and visual feedback | PASS WITH NOTES | Ten numbered/named players, distinct crew shapes, visible bag stacks, countdown, bank totals, shove-ready arcs, protection and sealed vault positions. Real people must still test instruction comprehension and a crowded moving scrum. |
| Controller responsive layout | PASS | Actual controller route rendered in exact 844×390 and 390×844 QA iframes. Landscape controls fit; portrait shows the rotation card. Joystick movement worked at 844×390. This is not physical handset testing. |
| Reconnect/recovery | PASS | Final ten-player host refresh restarted practice and all mounted phones resynchronized without being reloaded. A controller absent >10 seconds froze the timer at 116 and disabled controls; reconnect restored the same seat/crew with zero bags and resumed. |
| Late join | PASS | Fifth controller joining the four-player match received Watching this round and disabled controls; entered the next lobby normally. |
| Independent review | PASS | Separate reviewer reran the focused tests and reported no unresolved high/medium source defect after fixes. |
| Audio/assets | N/A for prototype | Deliberately silent, native Canvas/CSS visual feedback; no new raster/audio dependencies or external asset fetches. Optional haptics are reinforcement only. Production audio is deferred. |
| Performance | INCOMPLETE | No actual browser p95 frame trace, repeated-cycle resource trace or 1920×1080 projector evidence was obtained. A CPU-only exploratory stress run indicated low simulation/mock-render cost; it is not frame-rate evidence. |
| Fun, fairness and room energy | HUMAN PLAYTEST NEEDED | Scripted/browser operation cannot establish voluntary escorting, balanced interception or mixed-skill enjoyment. |

### Commands

- `npm run verify` — exit 0, 271 tests plus build.
- `npm run test:client -- test/client/getaway-host.test.tsx test/client/getaway-controller.test.tsx` — exit 0, 25 tests; independently rerun by reviewer and coordinator.
- `git diff --check` — exit 0.
- `npx vite preview --host 127.0.0.1 --port 5179 --strictPort` — persistent preview started successfully.
- `curl -fsS -o /dev/null http://127.0.0.1:5179/` — exit 0 with local network access.

### Real-surface observations

The test party was `PH4F`. On the initial four-player candidate, Alex delivered five bags and both Crimson teammates received five points; neither Cobalt teammate received points. The fifth late joiner did not participate in that result. The final game-local result tests explicitly cover crew places 1/2 and all-place-1 ties with four and ten participants. The shell's cumulative leaderboard uses its existing competition ranking and may show third place after two tied firsts.

The final ten-player candidate showed the load gate briefly, then began practice as the remaining controllers synchronized. Reloading only the host repeated that process successfully. The corrected HUD leaves the top-right shell controls unobstructed. Both route movement and a paused/reconnected controller were exercised. The match ended naturally, showed all ten players in Party standings after round two, and returned through Pick the next game to the same ten-seat lobby with cumulative scores preserved. Captured host and inspected phone error logs were empty during the final run.

The browser's viewport override did not change its 1280×720 tab dimensions. The temporary QA proxy therefore embedded the real controller route in a size-constrained iframe to inspect the phone media queries. It did not substitute a controller mock or modify game source.

Small retained screenshot bundle:

- [Ten-player projector](/tmp/getaway-qa/projector-ten-players.png)
- [844×390 controller](/tmp/getaway-qa/phone-landscape.png)

Cleanup: all eleven test tabs were closed, the viewport override was reset, the preview and local proxy processes were stopped, and the temporary proxy script was removed. The two screenshot files remain available.

### Next gate

Run a real four-person group session, then ten players. Look for varied haul sizes, voluntary escorts, escapes that remain possible under interception, and decisions after a spill. Measure actual projector frame times and repeated-cycle resource behaviour before claiming production readiness. The accepted concept's extra mechanics remain deferred until this core loop earns them.
