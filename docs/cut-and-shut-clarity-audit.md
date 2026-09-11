# Cut & Shut clarity audit — 11 September 2026

**Verdict: FAIL for first-time comprehension.** The game has a coherent visual style, but players cannot reliably connect their goal to a useful road choice or explain the resulting score. The central problem is missing information at decision time. More tutorial copy alone will not fix it.

Reviewed clean revision `3be1ae67e222097deaed197406aeaf123a12f41a`. No game code changed. Scope: rules, onboarding, targeting, feedback and the integrated two-player journey. An independent agent reviewed the mechanics; the main reviewer inspected the built interface. This is an expert usability audit, not a human group playtest or release certification.

## What the game actually asks you to do

Make any of the six shared couriers finish its sixth move on your private numbered destination. Each such courier earns you four points. Every surviving courier also gives every player one point. You may exchange road cards, then replace the road on one tile. Roads have fixed orientations determined by the tile and current deal. After placements lock, the city rearranges and the couriers move.

That explanation needs to be discoverable through play. Currently players encounter fragments of it across a brief projector overlay, private contract, card hand, tile keypad and fast resolution.

## Findings, in priority order

### 1. High — the board changes after you make the decision

Players place against the current map. Only after commitments lock does the fold rearrange the numbered tiles; movement uses that new layout. There is no future-layout preview during planning. Even the first deal folds before its first march.

**Consequence:** a sensible-looking route can fail because of a change a newcomer could not see coming. Players cannot establish which card they need, so the preceding trading phase also lacks a clear purpose.

**Smallest credible fix:** keep the introductory deal static, and show or perform later folds before trading and placement. If forecasting is intended to be the challenge, make the forecast explicit and available throughout planning.

Evidence: `src/client/games/cut-and-shut/host.ts:355`, `:371`, `:745`; `protocol.ts:44`. Live targeting screenshot shows the current board with no fold forecast.

### 2. High — the contract does not state the actual win condition

“Deliver to seam 10 · 4 points each” does not explain that a courier must finish **exactly its sixth move** there. Passing through earlier earns nothing. Couriers are shared pieces, but the instruction never clearly says “any courier”; players must also infer that their seat number is not a courier identity.

The launch screen mentions “six steps exactly” and delivery points separately. It does not demonstrate their relationship.

**Smallest credible fix:** “Get any courier to finish on tile 10 after 6 steps. Each one earns you 4 points.” Introduce the shared couriers explicitly and demonstrate one successful route. If the six-step puzzle is not essential, consider scoring arrivals instead, as a separate rules change.

Evidence: `controller.tsx:74`, `host.ts:398`, `host.ts:993`. Live controller contract and launch screenshots.

### 3. High — selecting a road does not show its effect

The phone presents generic straight, bend and junction symbols. The destination tile and deal determine the actual orientation. The phone's twelve-number grid shows only OPEN/TAKEN, with no road topology, private destination marker or preview. Tapping the tile immediately commits; there is no correction step.

**Consequence:** the player must translate a generic glyph and numbered keypad into a rotated isometric road network, predict six shared routes, and commit within eight seconds. A wrong guess supplies little useful information for the next choice.

**Smallest credible fix:** select a road and tile, preview the actual oriented road and affected route, then confirm. Keep the public board the spatial reference; a preview on it must avoid revealing the private contract. Privately mark the player's destination on the phone. Give the first placement enough time to learn this interaction.

Evidence: `controller.tsx:210`, `host.ts:659`, `host.ts:335`; paired targeting screenshots.

### 4. High — terminology and numbers create false connections

“Lot,” “seam,” “slab” and “contract” describe overlapping parts of the target. Worse, “stitch” describes both an accepted trade and a road placement. A trade receipt numbered 01 has no connection to tile 01, while the phone calls a placement on that tile “STITCH 01 LOCKED.” Accepted trades exchange cards; they do not alter the board.

**Smallest credible fix:** use **destination**, **tile**, **road** and **trade** consistently. Label receipts “Recent trades” and remove their sequential numbers unless those numbers support an actual player action. Reserve numbered labels for board tiles and clearly distinguished player identities.

Evidence: `controller.tsx:109`, `host.ts:488`, `host.ts:934`, `host.ts:626`.

### 5. High — the result does not teach why it happened

Six couriers move simultaneously at 0.65 seconds per beat. The 2.2-second recap covers the central board with “X/6 SAFE,” shared points and a lost count. The phone gives a private point increment, but neither surface explains which courier fulfilled the contract or why a planned route failed. The next deal changes the contract and clears placements.

**Consequence:** players see spectacle and numbers without learning the causal chain. Repeating four deals is unlikely to resolve the initial confusion by itself.

**Smallest credible fix:** let the first resolution teach the rules: trace paths, mark the broken connection where a courier fails, and privately say “C2 finished on your tile 10: +4.” Preserve the result long enough to read it, with a clear transition into the next plan.

Evidence: `host.ts:16`, `host.ts:376`, `host.ts:966`; `controller.tsx:117`.

### 6. Medium — the opening overloads attention and visibly clips

The eight-second runway asks players to look down and read their contract while the projector contains the road laws and scoring explanation. Meanwhile the phone headline says LOOK UP and WATCH THE CITY. It asks players to read their roads before the hand is displayed; the hand only appears in market/commit phases.

At the observed 1280×720 viewport, the large “CROOKED ROADS…” heading extends off the left edge and across the public rail. The header's contract instruction overlaps the timer. The map is obscured while its rules are explained.

**Smallest credible fix:** replace the promotional heading with one plain objective and one visible example. Stage the attention cues consistently, show the hand when asking players to inspect it, and use measured text bounds. Introduce trading after players understand a useful placement.

Evidence: launch screenshot; `host.ts:717`, `host.ts:983`; `controller.tsx:39`, `:86`, `:99`, `:117`.

### 7. Structural — the shared objective does not change relative ranking

Every player receives the same survival bonus. It therefore cancels out when comparing players: private deliveries decide relative placing. Preserving couriers raises cumulative party totals, but cannot improve your position against the other active players by itself.

The UI gives substantial space to the shared pot, while private delivery success is much less prominent. The design describes a semi-cooperative tension without a collective success/failure threshold.

**Recommendation:** explicitly choose the promise. For competitive play, foreground private deliveries and describe survival as a common bonus. For semi-cooperative play, give survival a clear collective consequence. This needs a game-design decision and group testing, not just relabelling.

Evidence: `host.ts:398`, `host.ts:597`, `host.ts:955`; `DESIGN.md` scoring and shape.

## Recommended order of work

1. Make one useful road placement understandable on a stable board: clear destination, actual orientation and visible consequence.
2. Teach a successful delivery and a failure through a slower introductory resolution.
3. Unify names, repair launch layout and coordinate look-up/look-down instructions.
4. Reintroduce optional trading and clearly forecast folds once players can judge card value.
5. Settle whether the game is competitive or meaningfully semi-cooperative.

Preserve the visual palette, numbered tiles, distinct phase controls and lack of elimination. The priority is making those assets communicate the rules.

## Evidence and limits

| Check | Result |
| --- | --- |
| `npm run verify` | PASS: 29 room tests, 189 client tests, TypeScript and production build. Initial sandbox attempt failed on local socket permission; permitted rerun exited 0. |
| `npx vite preview --host 127.0.0.1 --port 5187 --strictPort` | Built Worker/client preview started successfully. Initial port 5173 had an existing wildcard listener, so the audit moved to 5187. |
| `curl -fsS -o /dev/null http://127.0.0.1:5187/` | PASS outside the network sandbox, exit 0. Sandboxed probe could not reach the listener. |
| Two-player live UI | Created party 843B, joined Alex/Sam, readied both, selected and launched Cut & Shut, observed contract/market/commit/fold/march states and sent an offer visible to its recipient. The offer expired; placements used the game's timeout fallback. Completed all four deals, observed standings (Sam 14, Alex 10), and returned to the lobby with scores and routes preserved. Successful trade acceptance and deliberate placement were not verified live. |
| Browser isolation | Used distinct origins `127.0.0.1` and `localhost` for independent device storage in the available browser; a second browser/profile was unavailable. Both players were visibly distinct. |
| Projector layout | Inspected at 1280×720; opening overflow confirmed. |
| Portrait handset dimensions | INCONCLUSIVE: requested 390×844 override did not change captured dimensions. Controller content was inspected at desktop dimensions; physical phone ergonomics are not certified. |
| Independent mechanics review | Completed in a separate agent context; findings agree with the live interface audit. |
| Group comprehension and fun | HUMAN PLAYTEST NEEDED. No participants were recruited. |

Evidence files, retained outside the repository:

- `/tmp/cut-shut-audit-20260911/launch-host.png`
- `/tmp/cut-shut-audit-20260911/targeting-host.png`
- `/tmp/cut-shut-audit-20260911/targeting-controller.png`

Audit tabs were closed, the temporary viewport override was reset, and both preview processes started by this run were stopped. Existing user servers were left running.

This audit does not certify maximum-player legibility, network recovery, audio mix, reduced motion, asset failure or frame-time endurance. Those release-matrix checks were excluded because this request concerns comprehension and no behavior was changed. Automated test success does not establish understandable onboarding.

After changes, repeat the affected host/controller journey and have new players explain, without coaching: what earns points, which tile they want, what their chosen road changes, and why the courier scored or failed. Include two players and a busy room, with real portrait phones. Those answers are the acceptance test for this redesign.
