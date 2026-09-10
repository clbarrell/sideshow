---
name: party-game-verification
description: Verify a Sideshow harness or game through automated checks, real projector-and-phone journeys, UX and game-design critique, animation, assets, audio, accessibility, resilience, and performance. Use before claiming a game or platform change is finished or play-ready.
---

# Party game verification

Produce an evidence-backed verdict for the integrated artifact. Verification may diagnose and report; when the user or `$engineering-manager` owns implementation, fix failures and rerun the invalidated gates.

## Frame the run

1. Read `AGENTS.md`, `README.md`, `.agents/references/production-quality.md`, the request or brief, affected source, available scripts, and current repository state. For a cross-boundary seam, also read `.agents/references/change-risk-map.md`.
2. Choose scope: `game` for one game and its shell journey, `harness` for shared lifecycle/protocol/controller behavior, or `release` for both. Name the tested revision or exact uncommitted state.
3. Map every acceptance criterion and affected production-quality section to observable proof. Read [verification-matrix.md](references/verification-matrix.md) and select every scenario capable of exposing the changed behavior.

The frame is complete when every claim has a check and every omitted matrix row has a reason.

## Automated evidence

- Run the narrowest behavior checks first, then the repository's relevant type, test, build, and static commands.
- New behavior needs a red-capable test at the highest practical public seam. Prove a bug's original symptom before the fix when possible.
- Inspect generated asset manifests and files for existence, decodeability, size, and source/provenance without exposing secrets.
- Verify secret absence from tracked files, diffs, logs, built client assets, and browser network requests using presence-only output.
- Record exact commands, exit codes, and material output. A command passing at an earlier revision is stale after relevant changes.

## Real-surface evidence

Run the built app, not a substitute component. Invoke `$verify-sideshow` for the local projector-and-phone journey.

- Exercise the complete lobby → launch → play → results → next-game cycle with a host and controllers.
- Inspect host and phone console/network errors and visible recovery states.
- Keep visual handoff evidence to the smallest screenshot set defined by `$verify-sideshow`.
- Evaluate the implemented game with `$party-game-design`; distinguish structural problems from polish opportunities.
- Inspect animation timing, input feedback, asset readiness, audio unlock/mute/mix/failure behavior, and reduced-motion behavior in motion rather than from source alone.
- Record a maximum-player trace over repeated complete cycles against the brief's frame budget: p95 frame time or FPS, long tasks, and whether timers, listeners, audio nodes, or particle counts grow between rounds.

Simulation is useful evidence but does not become a human playtest. Label subjective fun, social energy, confusion, and audio-mix questions as `HUMAN PLAYTEST NEEDED` when real participants are required.

## Independent verdict

For behavioral, player-facing, audio, security, data, or cross-module work, use a fresh review context that did not author the change. Review requirements/spec, defects, tests, and complete experience separately.

Grade each applicable gate `PASS`, `PASS WITH NOTES`, `FAIL`, or `N/A` with a reason:

- requirements and scope
- automated behavior and build
- host/controller real-surface journey
- game design and room dynamics
- UX and onboarding
- visual direction, legibility, and asset quality
- animation and game feel
- audio design and implementation
- accessibility and comfort
- reconnect, degraded-network, and failure recovery
- frame-time and load behavior
- independent code/spec review

Any unresolved acceptance failure, high/medium defect, crash, broken lifecycle, unreadable state, missing critical feedback, secret exposure, or untested high-risk journey makes the overall verdict `FAIL`. `PASS WITH NOTES` is only for objective low-severity observations or deliberate design-strengthening omissions. Otherwise report `PLAY-READY`, `PLAY-READY WITH NOTES`, or `HUMAN PLAYTEST NEEDED`. The last is mandatory while the central fun hypothesis, no-spoken onboarding, shared-control feel, social energy, or room audio mix still requires real participants.

Return the verdict first, then the evidence table, actionable findings by severity and file/surface, invalidated checks to rerun, and remaining human playtest questions.
