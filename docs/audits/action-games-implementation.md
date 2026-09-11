# Action-game audit implementation — 11 September 2026

Scope: The Gun, Last Marble and Featherweight Championship. This note records
source decisions and focused automated evidence. Integrated browser QA and
independent review belong to the coordinating task; this is not a PLAY-READY claim.

## Design decisions

- **The Gun:** preserve hold-time and holder-fall bounty scoring. Teach +1 per
  armed second, +3 for pushing the holder off, and zero kill points. One facing
  transform now applies to the fixed local eye. The phone still acknowledges a
  press visually; only accepted host actions produce action sound/haptics. Host
  status distinguishes preparation, protection and shove recovery, without
  disabling movement/jump. An accepted shove with no target also confirms the
  attempt. Status refresh is 10 Hz so the 0.72-second cooldown has a useful readout.
- **Last Marble:** preserve survival +1/s, KO +2 and heat-win +5, with wins then
  KOs breaking equal totals. The live rail shows current totals including live
  survival time, in two rows to fit ten seats. Setup and between-heat copy teach
  the formula; result detail spells out weighted components. Retain mounted
  controls through preparation, gate simulation until GO, and preserve prepared
  input when resetting the next heat. Every heat has a visible GO. Eliminated
  players see a refreshed upper bound until their next heat (or final results).
- **Featherweight:** preserve collision→egg→pickup and the owner head start.
  Launch copy explicitly teaches contact, pickup points and self-reclaim denial.
  Egg labels distinguish WAIT, numbered owner-only and rival-ready states, with
  a brief STEAL! +1 transition. Reclaims explicitly say no point and steals +1.
  A game-local horizontal drag lane retains the two-thumb grip and 20 Hz input;
  vertical displacement no longer moves a knob or weakens lateral thrust.

## Participation and remaining human questions

Marble still has 40-second heats and four-second preparation. An immediate fall
can leave a player waiting nearly 44 seconds; the upper-bound display makes this
honest but does not prove it enjoyable. Preserve the full three-second plate
warnings and test with six to ten mixed-skill people before retiming the heats or
adding a new eliminated-player role. Measure time out and repeated early-outs.

The remaining group hypotheses are whether newcomers understand the actual
score incentives without spoken help, can deliberately face/shove opponents,
recognize numbered egg ownership/readiness at projector distance, and find the
horizontal lane comfortable on a physical phone. Automated canvas labels and
synthetic pointer input cannot establish those outcomes.

## Focused evidence

- `npm run check` — passed.
- `npm run test:client -- --configLoader runner test/client/the-gun-host.test.tsx test/client/the-gun-controller.test.tsx test/client/last-marble-host.test.tsx test/client/last-marble-controller.test.tsx test/client/joust-host.test.tsx test/client/joust-controller.test.tsx` — 65 tests passed.
- `npm run test:client -- --configLoader runner test/client/the-gun-sound.test.tsx test/client/last-marble-sound.test.tsx test/client/joust-sound.test.tsx` — nine tests passed.
- Focused new checks cover host-accepted versus pressed actions, rejection during
  preparation/recovery, persistent Marble controls and prepared motion at heat
  two, total rendering and explicit wait bounds, and diagonal/vertical lane input.
- `--configLoader runner` avoids Vite writing generated config into the retained
  checkout's read-only dependency symlink. No retained audit worktree was edited.
