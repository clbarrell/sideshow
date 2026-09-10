# Log Runner concept sheet

**Log Runner — ten tiny lumberjacks share one rolling log; read the river and JUMP or DUCK together.**

- **The moment:** one player yells the wrong call and a whole colour-and-numbered cluster pinwheels into the river.
- **Shape:** free-for-all survival with an asymmetric bank role after elimination.
- **Screen:** one fixed 16:9 side view. All runners occupy a compact readable band on the same log; threats travel right-to-left through one marked response line.
- **Controls:** exactly two large controls while running: `JUMP` and `DUCK`. Eliminated players receive one large `THROW BRANCH` control plus cooldown status.
- **Ergonomics:** landscape, one tap action under each resting thumb. The first press commits the answer for the next real warning; host timing and sequence numbers make both actions equally resilient to jitter. Buttons support pointer and keyboard activation.
- **Shared agency:** every runner answers independently. Bank throws affect the whole log, never a named player, enter a host-owned queue, keep the same warning time, and cannot overlap another impact closely enough to make either response impossible. Missing one causes an attributed 0.8-second stumble but never changes elimination order or scores.
- **Escalation:** the warning-to-impact time stays 2.4 seconds. Later phrases add doubles, alternating duck/jump composition, breath gaps, and harmless fakes instead of accelerating the travel speed.
- **Eliminated players:** wash onto the near bank, keep their identity visible, and throw clearly attributed branches on a nine-second personal cooldown. The host admits at most one queued bank hazard into a safe gap; it creates comic disruption without becoming a lethal kingmaking tool.
- **Scoring:** one point per completed survival second. The last three standing receive 15, 10, and 5 bonus points; bank throws do not directly score, avoiding kill farming and targeted kingmaking.
- **Round length:** 90 seconds after a nine-second launch runway, ending early only if every runner is washed off. During the opening 18 seconds, a deterministic “last grip” saves one runner from a collective miss so the new bank players get a real chance to throw; after that onboarding mercy, the last runner is fully mortal.
- **Build cost:** small-to-medium; timing logic is simple, but phrase readability and ten-player projection legibility need serious QA.
- **Risk:** the authored phrases may become rote or visually mushy. The first build therefore uses explicit geometric silhouettes and exposes its phrase schedule for deterministic tests.
- **Fun hypothesis:** fixed-warning authored phrases remain readable, varied, and socially explosive for mixed-skill groups across a full 90-second heat.
- **Onboarding:** projector runway shows `LOW = JUMP`, `HIGH = DUCK`, then demonstrates both silhouettes before an unmistakable shared `GO`. Phones show the same verbs and no rules paragraph during play.
- **Launch runway:** controls mount immediately; seconds 9–6 identify runners and objective, 6–3 demonstrate low/high hazards, and the final 3 beats count down to `GO`.
- **Art direction:** tactile park-ranger field guide—ink, cream paper, river blue, safety orange—with chunky cut-paper silhouettes and numbered badge shapes.
- **Animation:** rolling bark bands, water parallax, warning chevrons, anticipation squash, jump/duck pose changes, bounded splash droplets, branch arcs, fake peel-aways, and a short last-three/result tableau.
- **Audio:** dry wooden warning knocks, jump/duck phone taps, splash, bank throw, and a short finish sting. No music: room calls and false calls are the soundtrack.
- **Recovery:** late joiners arrive on the bank; disconnects neutralize held duck state while leaving the runner in the host simulation; reconnect restores the current role and cooldown; malformed/repeated inputs are ignored.
- **Accessibility:** every identity combines colour, seat number, name and one of ten badge patterns. Threats differ by geometry, lane, label and icon rather than colour. Reduced motion removes shake/parallax/particles while preserving position, labels and timing bars. Muted play remains complete.

## Acceptance signals

1. A first-time player can identify their runner, read both threats, and act before `GO` without spoken help.
2. Every authored hazard and bank branch provides at least 2.4 seconds from first visible warning to the shared response line; responses are host-timed discrete commits.
3. The schedule contains at least 20 deterministic phrase variants spanning singles, doubles, alternation, fakes, and rests.
4. Ten-player rendering keeps names/numbers clear without overlapping the live timer or warning lane.
5. Bank interference is bounded: nine-second personal cooldown, fair attribution, one active branch, collision separation from authored hazards, and no effect on survival time or placement.
6. Results return each player exactly once, preserve ties, award survival seconds plus last-three bonuses, and complete only once.
7. The real lobby → launch → phones → play → results → next-game journey succeeds at 1280×720 and a common landscape phone viewport.
8. Ten-player 1080p simulation/rendering remains below a 16.7ms p95 CPU frame budget in the repository test harness.
