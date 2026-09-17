# Cut & Shut simplification

The requested outcome is a game that can be understood from short on-screen
instructions, with recognisable couriers and no unexplained relationship between
player numbers, tile numbers and courier IDs.

The selected direction is a shared road-repair puzzle. Each player turns one
road marked with their name and colour. Everyone tries to keep six couriers on
the roads for six moves. Survivors earn one team point each. Trading, hands,
secret destinations, tile claiming and personal score arithmetic are removed.
The city folds before each new planning window. Correct neutral roads and
scrambled player-owned roads keep the puzzle solvable across the player range.

## Acceptance scope

- Host-authoritative road turns affect exactly the owning player's tile.
- Two- and ten-player games have a solvable baseline each round.
- Couriers follow the visible roads and face their travel direction.
- Phone instructions fit a short goal plus one clear turn action.
- Four rounds score once and return to shared standings / next-game selection.
- Reconnect, late join and disconnection have explicit outcomes.
- Sprite assets load locally during the runway and have a readable fallback.
- Muted and reduced-motion play retain all necessary information.
- Full repository checks and an independent code/design review must pass.

The generated atlas and full built-in ImageGen prompt are documented in
`public/images/cut-and-shut/README.md`.

## Verification results

- Focused Cut host/controller checks passed, including ownership, malformed and
  stale inputs, fast repeated turns, reconnect reconciliation, spectators,
  deterministic solvability and four-round shared scoring.
- `node /private/tmp/cut-shut-simple-qa.cjs 2` exited 0: real lobby → four repaired
  rounds → standings → next-game lobby; six survivors each round and 24 points
  each. The run muted the host, requested reduced motion and deliberately blocked
  the atlas to exercise the readable courier fallback. A third phone joined from
  the live join-code overlay as a spectator; opening it did not stop the timer or
  replace the canvas. The first phone reloaded and recovered its identity.
- `node /private/tmp/cut-shut-simple-qa.cjs 10` exited 0 on the final game code:
  all four rounds, all 24 courier runs safe, equal team scores and next-game lobby.
  The phone also fit at 320 × 568 without document overflow. Projector checks used
  1280 × 720 and 1920 × 1080. No page errors were recorded.
- Browser audio-source instrumentation counted exactly 40 final-countdown ticks
  across four ten-player planning windows, and zero during the muted two-player
  run. Cadence, delayed loading, unavailable audio, reset and cleanup also have
  focused automated coverage.
- Ten-player sampling over four rounds recorded 8,003 simulation/render callbacks,
  with 0.6 ms p95 callback work. Frame intervals were 17.6 ms p95, with one interval
  above 50 ms and one browser long task. These are local headless-browser readings,
  not a hardware-independent frame-rate guarantee. The two-player callback p95
  was 0.5 ms. Timers and score progression stayed correct throughout.
- Independent host, phone and design reviews found no remaining high/medium issue.
  Visual QA found player labels covered by foreground slabs; a separate final
  label pass fixed this and the ten-player screenshot was recaptured.

The final game code was exercised before the clean rebase from `cd34695` to
`4206cad`, whose upstream changes are lobby styling and lobby tests. The final
integrated build and rebased shell journeys are recorded in
`docs/party-polish-verification.md`.

## Evidence and verdict

- `/private/tmp/cut-shut-simple-evidence/solved-10-host.png` — named roads and real couriers.
- `/private/tmp/cut-shut-simple-evidence/planning-10-phone.png` — one-action phone.
- `/private/tmp/cut-shut-simple-evidence/couriers-2-host.png` — missing-atlas fallback.
- `/private/tmp/cut-shut-simple-evidence/join-code-host.png` — live room QR.

**PLAYTEST-READY.** Technical behavior, visual ownership, lifecycle, recovery and
accessibility checks pass. **HUMAN PLAYTEST NEEDED** for whether the fixed 18-second
window and shared repairs create enough coordination and stay interesting after
players learn the circuit. A browser simulation cannot establish that social feel.

A final ten-player visual/input probe after the rebase also exited 0 with no page
errors; the retained host and phone captures are from that rebased layout.

Test contexts and the task's preview server were closed; temporary runners and
superseded captures were removed. The four listed Cut/QR images are retained.
