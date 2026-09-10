# What Sideshow should learn from pstack

Research date: 2026-09-10
pstack revision inspected: [`9bd4a82`](https://github.com/cursor/plugins/tree/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack)

## Verdict

pstack's most valuable idea is not running more agents. It is building enough
context, verification, isolation, and inspectable evidence that parallel work
can be trusted. Sideshow already has a stronger domain-specific definition of
quality than pstack: the projector-and-phone journey, party legibility, game
feel, resilience, and an independent `PLAY-READY` gate are explicit. The best
adoption strategy is therefore selective.

Build the missing executable verification layer first. Add a small amount of
routing and durable context around it. Do not import pstack's 47 skills or 23
principle skills wholesale.

## What pstack is

pstack is a Cursor plugin with 47 top-level skills, including 23 single-principle
skills, plus 23 playbooks behind one user-invoked `poteto-mode` router. The
router matches a request to a playbook, copies its steps into the task list,
routes to specialist skills, and requires skipped steps to remain visible with
a reason. Its stated goal is less, higher-quality code and "fearless
parallelism" built on verifiable work, not maximum throughput. See the
[README](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/README.md)
and [`poteto-mode`](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/skills/poteto-mode/SKILL.md).

Its architecture has five useful layers:

1. A single front door selects a task-specific playbook.
2. Small specialist skills answer questions such as how, why, architecture,
   blast radius, and adversarial review.
3. Named principles steer decisions with short, reusable vocabulary.
4. App-specific control and verification turn claims into reproducible proof.
5. Decision logs, pickup playbooks, and blinded skill evals make long-running
   work reviewable and improvable.

The linked X article frames this as supervising a highly capable engineer with
amnesia: provide context and observable signals, state the outcome rather than
micromanaging the implementation, and encode repeated corrections into tools.
See [The Complete Guide to pstack, Part 2](https://x.com/poteto/status/2097732320606507506),
[Part 1](https://x.com/poteto/status/2094457600259842065), and
[Loops You Can Trust](https://x.com/poteto/status/2069824386283319343).

## What Sideshow already does well

| pstack idea | Existing Sideshow equivalent | Assessment |
| --- | --- | --- |
| Outcome over code volume | `AGENTS.md` defines done as the real party journey | Already strong |
| Domain-first design | `party-game-design` and its concept questions | Stronger than generic pstack guidance |
| Real-artifact proof | `party-game-verification` requires host and controller QA | Strong policy, weak executable interface |
| Independent verdict | `engineering-manager` requires a fresh verifier | Already strong |
| Verifiable slices | Manager builds vertical host/controller/protocol/shell slices | Already strong |
| Product quality vocabulary | `production-quality.md` | Already strong |
| Human gates | `PLAYTEST-READY` separates technical proof from actual fun | Better calibrated than generic automation |

Sideshow should preserve these project-specific skills as the authority. A
generic imported mode should not compete with them.

## Highest-value adoptions

### 1. Build an executable `verify-sideshow` interface

This is the clearest gap. The verification skill specifies what to inspect, but
each agent still has to rediscover how to launch the right build, confirm it is
healthy, drive host and phone surfaces, capture evidence, and clean up.

pstack's
[`create-verification-skill`](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/skills/create-verification-skill/SKILL.md)
uses five sections worth adopting: Launch, Doctor, Drive, Evidence, and Cleanup.
Its
[`maintain-verification-skill`](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/skills/maintain-verification-skill/SKILL.md)
adds the equally important rule that every mapped feature receives both source
coverage and a live pass.

Recommended Sideshow shape:

- `.agents/skills/verify-sideshow/SKILL.md` contains exact launch, health-check,
  driving, evidence, isolation, and teardown instructions.
- `.agents/skills/verify-sideshow/features/` maps user journeys rather than risk
  dimensions: create party, join/identity, ready/launch, active controller,
  reconnect, results/standings, next game, and reset.
- The existing verification matrix remains the risk matrix. The feature map is
  complementary; it answers what exists and how to prove it.
- `party-game-verification` invokes this interface instead of asking each agent
  to invent browser setup.
- `npm run verify` becomes the canonical deterministic check for typecheck,
  tests, and build. Real-surface evidence remains a separate required gate for
  affected player journeys.

### 2. Treat evidence as the review interface

pstack consistently makes the artifact, not the agent's assurance, the thing a
reviewer consumes. Its
[`blast-radius`](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/skills/blast-radius/SKILL.md)
ranks proof from assertion through live reproduction and asks for the one or two
facts the safety argument depends on.

For Sideshow, a player-facing change should leave a small proof bundle:

- exact tested revision or dirty-state description;
- host and phone screenshots or recordings that include the action and result;
- the relevant test/build command and result;
- the durable side effect when applicable, such as recovered identity, stored
  round history, or the next-game transition;
- an explicit `INCONCLUSIVE` rather than a confident pass when the real surface
  could not be driven.

### 3. Add a cross-boundary change-risk map

Sideshow's small-looking changes often cross controller, WebSocket, Durable
Object, host, and standings boundaries. Add
`.agents/references/change-risk-map.md` with owners, invariants, public seams,
callers, and proof paths for protocol messages, room persistence, registry and
dynamic imports, `GameHost`, controller input and disconnect neutralization,
audio lifecycle, and standings/history.

This adapts pstack's blast-radius habit without creating another broad skill.

### 4. Design twice only where reversal is expensive

pstack's
[`architect`](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/skills/architect/SKILL.md)
grounds the current system, produces at least two structurally distinct designs,
cross-judges them, implements against the chosen sketch, and scraps the sketch
when repeated escape hatches show the architecture is wrong. Its
[`arena`](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/skills/arena/SKILL.md)
separates candidate outputs and requires a rubric before fan-out.

Adopt this selectively for new public game contracts, protocol changes,
controller primitives, persistence boundaries, and novel player interactions.
Do not require a panel for routine game tuning or isolated fixes. For gameplay,
the competing artifacts should usually be playable micro-prototypes rather than
abstract architecture prose.

### 5. Add lightweight decision trails and session pickup

pstack's
[`show-me-your-work`](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/skills/show-me-your-work/SKILL.md)
uses one append-only TSV row per decision or checkpoint, with evidence pointers
instead of narrative. Sideshow's manager mentions durable checkpoints but has no
format or pickup contract.

For unattended or multi-phase runs, use a compact checkpoint containing the
objective, exact repository state, important decisions, evidence passed and
failed, dirty files, next safe action, and remaining human gate. Keep it local
by default; commit it only when a reviewer genuinely needs it.

### 6. Encode repeated lessons in structure

Pstack's most transferable principle is
[`encode-lessons-in-structure`](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/skills/principle-encode-lessons-in-structure/SKILL.md):
when the same instruction appears twice, prefer a test, type, lint, metadata
flag, or script to more prose.

Use this as a pruning rule for Sideshow's skills. A repeat failure found in a
playtest should become, in order of preference, an executable check, a reusable
kit primitive, a domain type, or a short reference rule. Add new skills only
when the behavior has a distinct trigger and cannot be expressed more reliably
in code.

### 7. Evaluate skill changes as behavioral changes

pstack's [blinded eval playbook](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/skills/poteto-mode/playbooks/eval.md)
hides the experiment from candidate agents and judges outputs under neutral
labels. This is valuable after the verification harness exists: run the same
organic game brief against old and proposed skill versions, then grade actual
artifacts, chain-following, and evidence quality. It is too expensive to be the
first adoption.

## A thin router, not a pstack clone

There is value in one optional `sideshow-mode` front door for investigation,
bug fix, feature/game build, behavior-preserving refactor, performance, and
release/session pickup. It should route to existing Codex and Sideshow skills,
especially `diagnosing-bugs`, `prototype`, `codebase-design`, `code-review`, and
`engineering-manager`.

Keep this router small and user-invoked. pstack avoids permanent context load by
making most skills user-invoked and routing through `poteto-mode`, but its inline
index still repeats many leaf principles. Sideshow will be more predictable with
fewer, project-specific branches and a single source of truth for each rule.

## What not to copy

- Do not import all 47 skills or 23 principle files. They overlap existing
  capabilities and would add maintenance and trigger ambiguity.
- Do not copy model slugs, Cursor Cloud Agent assumptions, `/loop`, or companion
  `cursor-team-kit` dependencies. Port the invariant, not the mechanism.
- Do not make four-model arenas mandatory. Scale independent review by blast
  radius and use one fresh verifier for most changes.
- Do not adopt `no-comments` as a blanket policy. Sideshow has non-obvious
  network, browser, and game-loop constraints where a concise why-comment can be
  the right representation.
- Do not copy pstack's broad autonomy over external actions. Keep Sideshow's
  existing human gates and platform safety boundaries.
- Do not let verification checklists replace real group play. Automated proof
  can establish technical and production readiness; only people in a room can
  validate the fun hypothesis and social energy.
- Do not treat the author's productivity figures as benchmarks. They are
  first-party claims, not controlled evidence, and depend on mature internal
  infrastructure.

## Recommended sequence

1. Add `npm run verify`, include `npm test` in the default completion contract,
   and use the same deterministic command in CI and local pre-deploy checks.
2. Create `verify-sideshow` with Launch, Doctor, Drive, Evidence, Cleanup, and a
   user-journey feature map; wire it into `party-game-verification`.
3. Add the cross-boundary change-risk map.
4. Add compact checkpoint/session-pickup rules for long runs.
5. Add the thin optional router if repeated usage shows a real discovery gap.
6. Add reflection and blinded skill evals only after the executable harness can
   score their outputs.

## Immediate inconsistencies exposed by the audit

- `AGENTS.md` requires `npm run check` and `npm run build`, but omits `npm test`.
- `npm run deploy` builds and deploys without testing when run directly. The
  current GitHub workflow runs tests first, but only on `main` pushes and manual
  dispatch, not on pull requests.
- The imported music and sound-effect installation references recommend global
  or remote installation paths that conflict with the engineering manager's
  project-local, no-remote-installer rule.
- Project-authored skills have no lightweight validation or behavioral eval
  loop yet.

## Licensing

pstack is MIT licensed. If substantial text or code is copied rather than the
ideas being reimplemented, retain its copyright and license notice as required
by the [license](https://github.com/cursor/plugins/blob/9bd4a8289f1c3fe870d518051772762a78b66ea0/pstack/LICENSE).
