# Verification matrix

Select scenarios by affected risk, not by habit. Cover every relevant row; use `N/A` only with a concrete reason.

| Dimension | Scenarios and evidence |
| --- | --- |
| Players | 1, manifest minimum, typical 5, manifest maximum, and platform maximum 10; enforce unsupported counts |
| Lifecycle | new party, returning device, ready state, game selection, launch, round end, standings, next game, reset |
| Connectivity | controller disconnect/reconnect, phone lock/background, late join, host refresh, socket loss/recovery |
| Ability | first-time player, least and most skilled, early elimination, no spoken explanation, colour-vision difference |
| Display | 16:9 projector at 1280×720 and 1920×1080, washed-out contrast, phone portrait and safe areas |
| Input | touch down/move/up/cancel, multi-touch where relevant, coalescing, stuck input, latency and jitter |
| Shared agency | aligned, opposed, noisy, and missing simultaneous inputs with 1/5/10 controllers; every connected player can affect and recognize the outcome |
| Assets | cold load, slow/missing asset, offline-after-preload, correct crop/scale, no remote venue dependency |
| Motion | countdown, core action, impact, score, transition, reduced motion, no harmful flashes or obscured play |
| Audio | gesture unlock, preload/decode, master mute/volume persistence, cue priority, polyphony, missing file, no speakers |
| Performance | declared frame budget, target-resolution p95 frame time/FPS, long tasks, maximum players/effects, long round, and no resource-count growth across repeated cycles |
| Failure | dynamic import failure, malformed/unexpected input, invalid game or results, storage/server error where affected |

## Experience lenses

- **Comprehension:** goal, identity, state, next action, timing, and outcome are obvious at the moment they matter.
- **Control:** actions feel immediate, fair, recoverable, and visibly acknowledged.
- **Room energy:** everyone acts often; elimination and resolution create involvement rather than waiting.
- **Spectacle:** the shared screen turns simultaneous actions, reversals, and results into something the room watches together.
- **Restraint:** effects, audio, and decoration serve the game hierarchy rather than compete with it.

For each finding record evidence, affected scenario, player consequence, severity, and the smallest credible fix.
