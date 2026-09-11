---
name: engineering-manager
description: Autonomously take a Sideshow party-game idea or harness change from rough intent through design, implementation, assets, audio, verification, and play-ready polish. Use when the user asks to build, finish, improve, or fix a game or the shared projector-and-phone platform and wants the whole job handled.
---

# Sideshow engineering manager

Run an evidence-gated loop until the requested outcome is **PLAY-READY**, **PLAYTEST-READY**, or a genuine human gate remains. A conversational idea is a sufficient starting contract: infer reversible implementation details from the repository and keep moving.

## Establish the contract

1. Read `AGENTS.md`, `README.md`, `.agents/references/production-quality.md`, relevant source, and current repository state. Preserve unrelated work.
2. Turn the request into a short executable brief: player promise, scope, party-game constraints, acceptance signals, risky journeys, evidence required, and a frame-time budget for the target projector. Keep it in the task unless a long run needs a durable checkpoint.
3. For a new game or material mechanic change, invoke `$party-game-design`. Resolve all applicable concept questions and identify the game's shout-out-loud moment. The design gate is complete when the concept sheet is buildable and its central fun hypothesis is testable.
4. Define visual and audio direction before production. For a new game, produce a visual direction artifact; invoke `$imagegen` when raster exploration is appropriate. Write the minimal sound cue sheet and route generation through `$sound-effects`; use `$music` only when music earns its place.

Read [capability-routing.md](references/capability-routing.md) when selecting specialists. The manager owns scope, sequencing, integration, evidence, and the final verdict.

## Route implementation

Astra coordinates the build: shape the brief, route work, integrate results, and make the gate decisions. Delegate most implementation to non-Astra workers, including single-owner small work; the manager may make small integration fixes. Set `model` and a supported `reasoning_effort` explicitly on every spawn because inheritance otherwise uses the parent model, and use `fork_turns: "none"` or a bounded positive value so the override applies. Give every worker the necessary context, explicit ownership, acceptance criteria, and this routing policy for any nested agents.

Select each worker by its subtask's complexity using the [model defaults](references/capability-routing.md#model-defaults). Escalate only a focused, unresolved hard problem to Astra after recording evidence from the prior attempt, then return routine work to non-Astra workers. Confirm the models currently available to the spawn tool; if a named default is absent, use the closest available non-Astra model. If delegation or any non-Astra model is unavailable, disclose that constraint instead of routing the whole build to Astra.

## Build vertical slices

Implement the smallest complete path through host, controller, protocol, and shell that proves the mechanic, then deepen it.

For each slice:

1. Establish a red-capable check at the highest practical public seam.
2. Implement the coherent change and make the narrow check green.
3. Exercise it through the actual projector/controller surface.
4. Apply the production quality bar, including purposeful animation and game feel rather than a final cosmetic pass.
5. Checkpoint only coherent work. Use Git branches or PRs when they already exist or help isolation; neither is required to accept a conversational request.

Keep one critical-path author and one independent verifier active when delegation is available. Choose a non-Astra verifier by review complexity. Give each worker explicit file ownership and acceptance evidence. Shared writers need separate worktrees; otherwise serialize writes. The coordinator integrates and reruns invalidated checks.

## Asset and audio rules

- Concept images are design evidence, not automatic production assets. Convert only selected directions into correctly sized, consistent, optimized game assets.
- Generate audio locally from the existing environment key. Read only `ELEVENLABS_API_KEY` without printing it, sourcing the entire `.env`, or passing it on a command line. Keep the key out of source, Vite variables, browser code, logs, and artifacts.
- Use an existing ElevenLabs tool or a project-local SDK; installation is project-local and may not use a global package install or remote installer.
- Approve the minimal cue-sheet batch before generation. The autonomous budget is one draft and one targeted regeneration per rejected cue; exceeding it requires user authorization. Retain accepted outputs and never regenerate an unchanged cue.
- Preload assets and expose readiness or a deliberate fallback before play begins.

## Verify and polish

Invoke `$party-game-verification` against the integrated state. The author cannot be the sole verifier for a behavioral, player-facing, cross-module, or audio change; use a fresh review context.

Treat every applicable verification gate as `PASS`, `PASS WITH NOTES`, `FAIL`, or `N/A` with evidence. `PASS WITH NOTES` is limited to objective low-severity observations or deliberate omissions that strengthen the design; a departure from the brief or quality bar needs user acceptance. A build result alone cannot pass a game. Ensure verification includes a fresh `$party-game-design` critique of the playable result, fix every high/medium-confidence defect and acceptance failure, and rerun invalidated evidence until no play-blocking issue remains.

## Human gates

Pause only for a product choice that evidence cannot resolve, unavailable credentials/access, destructive or material billing risk outside the request, contradictory requirements, deployment/merge authority, or human play judgment that is itself the acceptance criterion. Finish every safe independent task first and ask one concrete question with a recommended choice.

## Completion verdict

Declare `PLAY-READY` only when:

- the requested player outcome works through the real lobby → launch → play → results → next-game journey;
- relevant automated checks and the build pass at the tested revision;
- projector and phone QA, game-design critique, UX, animation, visual, audio, accessibility, resilience, and performance gates pass or have explicit accepted notes;
- an independent verifier reports no unresolved play-blocking, high, or medium finding;
- generated assets are local, optimized, preloaded, licensed/created for the project, and the secret remains private.

Map the verifier's `HUMAN PLAYTEST NEEDED` verdict to manager status `PLAYTEST-READY`: the artifact passes every technical and production gate, while the central fun hypothesis, no-spoken onboarding, shared-control feel, social energy, or room audio mix still needs real participants. A manager without access to an independent review context reports `VERIFICATION BLOCKED` after finishing all other safe work; it does not hand debugging or review back to the user.

Report the delivered outcome, gate verdicts with exact evidence, remaining human playtest questions, and the single action needed to run or deploy it.
