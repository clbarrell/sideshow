# Party polish verification

This local work also includes the Last Marble, The Gun and Cut & Shut changes
recorded in their individual verification notes.

## Additional requested changes

- A small projector menu exposes **Show join code** and **Exit game** during play.
  Showing the current room's QR must not restart, pause or replace the game.
  Exit retains its confirmation and connection guard.
- Active timed play emits one quiet beep per displayed second from ten to one.
  It uses the existing master mute and local audio; intros and result screens
  do not acquire an extra countdown.
- Backyard Circuit removes the visible circular bumpers/boost rings and softens
  heading guidance. Collision geometry and recovery guidance remain functional.
- Sustained fast steering produces a controllable drift and a small, bounded exit
  reward without another phone control. Grass, reverse and weaving cannot farm it.
- Seeded tracks gain distinct, drivable outlines within the existing shared-camera
  footprint. This pass uses non-crossing tracks; a figure eight would also require
  branch-aware checkpoint, recovery and collision rules.

## Required evidence

- Focused public behavior tests, then `npm run verify` on the integrated state.
- Real projector menu open/close, QR join, continued simulation and exit confirmation.
- Real race through finish/standings/next game, changed seeded layout on replay,
  readable projector cars and phone controls, and maximum-player rendering check.
- Countdown cadence and mute/cleanup checks with representative real timed play.
- Independent code/design review and explicit human playtest questions for the
  cooperative road puzzle and automatic drifting.

## Integrated revision and automated gate

The working changes are rebased onto `origin/main` at `4206cad` (clubhouse lobby
styling). `git rebase --autostash origin/main` succeeded and reapplied all local
changes without conflicts. Nothing was committed or deployed.

- `npm run verify` — exit 0 after rebase: 29 room tests + 234 client tests, then
  TypeScript and the production Vite build.
- `git diff --check` — exit 0.
- Independent final review against `4206cad` — no high/medium finding; affected
  client checks and the later car-identity review passed.
- Kart-focused checks passed. They cover deterministic family variation,
  finite/even samples, curvature and branch clearance, ordered checkpoint and lap
  progress, start-grid fairness, drift rewards/caps, no grass/reverse/wiggle
  farming, frame-rate consistency and countdown lifecycle.
- Countdown plus six affected host suites — 109/109 passed. The helper preloads
  a committed local sound, uses an immediate fallback while unavailable, never
  replays delayed loads, follows master mute and stops/cleans up on reset or exit.
- No server/protocol/config changes were made. A presence-only common API-key
  prefix scan of source, public files and built client assets returned no matches.

An unchanged room-provisioning test failed once during a concurrent local run.
The isolated reproduction and final full runs passed; read-only triage found no
related server change. This remains an unreproduced local test-runtime observation,
not a claimed diagnosis or a reason to modify the server in this task.

## Review fixes

Real Cut visual QA found player names covered by foreground tiles. Names now draw
in a separate final pass. The racing review found a turbo pad overlapping three
starting positions; the pad moved away from the grid and a ten-seat regression
check proves no automatic launch boost. The menu review also corrected generic
join instructions, trapped dialog focus and prevented stacked join/exit dialogs.

## Browser setup

`npx vite preview --host 127.0.0.1 --port 5197 --strictPort` served the production
bundle. `curl -fsS -o /dev/null http://127.0.0.1:5197/` exited 0. The homepage uses
its current “Couch co-op got a bigger couch.” heading (the older journey-map
“Sideshow” heading selector is stale). Each phone used its own browser context
and normal join/ready controls. Game inputs were sent through visible controller
buttons, with real browser multi-touch input for racing. Seeded pure helpers were
used only as test oracles, not as a replacement game runtime.

Cut's full two/ten-player outcomes, live QR join, fallback, reduced-motion and
forty-beep evidence are in `docs/cut-and-shut-simplification-verification.md`.

## Racing browser results

Both real multi-touch journeys exited 0 with zero page errors:

- `node /private/tmp/racing-polish-qa.cjs 1`: join, ready, launch, hold GO and steer,
  live phone feedback, race timeout, standings, next game with a new seed/geometry,
  then confirmed exit. Muting during the final countdown suppressed two beats;
  unmuting did not replay them, and the next scheduled second resumed normally.
  Eight audible-source starts remained, as expected.
- `node /private/tmp/racing-polish-qa.cjs 10`: ten distinct phones joined and drove;
  all ten reported motion. The game reached standings, replay generated different
  geometry from a new seed, and the menu exited the replay through confirmation.
  Exactly ten countdown sources started at approximately one-second intervals.
  The phone fit both 844 × 390 and 667 × 375 landscape viewports without overflow.
  Replay also mounted with reduced-motion preference enabled.

These runs used real browser touch contacts; an earlier synthetic DOM-event probe
was discarded because it did not establish active pointers for pointer capture.
The final runs had no such error.

During concurrent solo and ten-player journeys, p95 simulation/render work was
0.5 ms and 1.0 ms respectively across about 6,000 game callbacks each. Both had
17.7 ms p95 frame intervals, three intervals over 50 ms and one browser long task.
These local headless readings include the concurrent test load and do not predict
all projector hardware. Timers, input, scoring and cleanup completed correctly.

The complete gameplay journeys preceded a final render-only change from floating
full names to compact car numbers. Full names and stable car IDs stay in the bottom standings and
on phones; the strip remains ordered by race position. Independent review and the focused renderer tests passed; final
post-change visual evidence is recorded below.

## Final gates

| Gate | Result |
| --- | --- |
| Requested behavior and scope | PASS: prior Marble/Gun fixes, simpler Cut, menu/QR, countdown and racing improvements |
| Tests, types, build | PASS: final `npm run verify`; no server changes |
| Lobby → play → results → next-game | PASS: real Cut 2/10 and kart 1/10 journeys |
| Visual clarity and generated assets | PASS: local courier atlas/fallback, named Cut roads, compact kart numbers and faded heading guide |
| Input, animation and recovery | PASS: actual phone input; reconnect/late join and missing atlas exercised; bounded drift and ordered progress tested |
| Audio behavior | PASS: exact live countdown counts, mute/unmute, local load failure and cleanup; room mix still needs human ears |
| Accessibility and comfort | PASS: tested small/landscape layouts, focus, mute and reduced-motion paths |
| Performance | PASS WITH NOTES: measured local headless callback/frame timings above; no general hardware guarantee |
| Independent review | PASS: no unresolved high/medium findings after identified fixes |
| Social feel and mastery tuning | HUMAN PLAYTEST NEEDED |

**PLAYTEST-READY.** A mixed-skill group should check whether Cut's 18-second repair
window creates conversation without waiting around, and whether new racers learn
the drift release reward without over-steering. Crossing/figure-eight tracks are
intentionally outside this pass because they require explicit branch-aware
checkpoint and recovery rules. The four non-crossing families provide variety
without that ambiguity.

## Retained visual evidence

- `/private/tmp/racing-polish-evidence/10-racing-live-host.png` — compact car identity and subdued heading guide.
- `/private/tmp/racing-polish-evidence/10-racing-phone.png` — live landscape controls.
- Cut and join-code evidence is listed in its companion verification note.

Final post-change probes `node /private/tmp/racing-polish-qa.cjs 10 --visual-only`
and `node /private/tmp/cut-shut-simple-qa.cjs 10 --visual-only` exercised the rebased
playing layouts, controller input, viewport fit and confirmed exit. The final
racing layout keeps stable IDs in its rank-ordered strip and reserves space for
`#10`; the short runway hint is “FAST TURN · RELEASE · DRIFT BOOST”.

Both final visual probes exited 0 with no page errors. All test browser contexts
were closed. The preview started by this task was stopped; a final reachability
check returned connection refused (curl exit 7), confirming cleanup. Temporary
browser runners/oracles and superseded screenshots were removed. Only the six
listed Cut/racing evidence images remain in these two verification directories.
