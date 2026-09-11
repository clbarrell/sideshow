# Capability routing

Read this when routing a Sideshow build. Use only capabilities available in the current session. For an unavailable specialist skill, use its method directly within the manager/worker responsibilities in SKILL.md.

## Model defaults

Use these Sideshow defaults with the spawning and escalation rules in [SKILL.md](../SKILL.md#route-implementation).

| Subtask | Default model | Typical effort |
| --- | --- | --- |
| Small, well-specified local change | `gpt-5.6-luna` | low or medium |
| Bounded moderate coding | `gpt-5.6-terra` | medium or high |
| Complex cross-module work, diagnosis, or review | `gpt-5.6-sol` | high or xhigh |
| Focused hard problem unresolved by a suitable worker | `gpt-6-astra` | high or greater |

## Specialist skills

- `$party-game-design`: mandatory before a new game or material mechanic change, and again after playable QA.
- `$party-game-verification`: independent system/game evidence and the final play-ready verdict.
- `$verify-sideshow`: exact local launch, health check, host/controller drive, minimal screenshot evidence, and cleanup for affected real-browser journeys.
- `$imagegen`: initial raster visual exploration, mood/style frames, backgrounds, sprites, textures, or production cutouts. Prefer code-native canvas/CSS/SVG for scalable geometric art and dynamic effects.
- `$sound-effects`: ElevenLabs gameplay, UI, transition, impact, and ambience assets. Follow its generation parameters; the manager's local-only installation, key-handling, and spend bounds override broader setup examples.
- `$music`: optional ElevenLabs music when it improves pacing or atmosphere without masking gameplay cues.
- Browser control: use through `$verify-sideshow` for Sideshow journeys; use directly only for diagnosis outside that skill's mapped surface.
- `$diagnosing-bugs`: reproduce a hard failure and tighten the loop before proposing a fix.
- `$tdd`: behavior changes whose public seam supports a stable red/green check.
- `$codebase-design`: consequential harness or game-contract seams.
- `$code-review`: fresh Standards and Spec review against a fixed base when a meaningful diff exists.
- `$bolder`: use when visual QA finds the result safe, generic, or low-energy.

Use one worker as the single owner for small work. Parallelize independent work only when ownership and integration are explicit. The critical review is independent from the author.
