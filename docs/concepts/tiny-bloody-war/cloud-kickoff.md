# Tiny Bloody War — cloud continuation

Continue implementing Tiny Bloody War in the Sideshow repository. The user approved proceeding with the direction in `tiny_bloody_war_concept.md` and its linked visual mockups. Its older “proposed” status does not mean another approval is required to begin implementation. Numerical balance and controller feel remain hypotheses to test.

Follow `AGENTS.md` and the repo's `.agents/skills/engineering-manager/SKILL.md`, including implementation delegation and independent verification. Read `README.md`, the production-quality reference and change-risk map. Preserve unrelated changes and the architecture: host simulation/rendering, Durable Object party state/routing, opaque game payloads.

Deliver a complete team-combat vertical slice: shield soldier and archer; landscape movement plus aim-and-release; a 90-second battle with one moving, uncontested-scoring banner; short respawns; best-of-three results and the real lobby → launch → play → results → next-game journey. Preserve the concept's shield exposure, friendly-fire, input-cancellation, protected-respawn, readable identity and approximately ten-second practice/runway rules. Use `docs/concepts/tiny-bloody-war/battlefield.png` and `combat-and-controls.png` as visual direction, not as playable assets. Do not add extra classes, economies or combat abilities to the first slice.

Begin with even teams and prove controls, class cooperation and objective flow before expanding polish. Specifically test unintended release attacks, all-soldier dominance, archer kiting, continuous respawn contesting and 5v5 readability. Odd-population fairness remains an explicit product decision; do not silently force spectators or invent bots or handicaps. Complete independent work before raising any remaining decision.

Add meaningful public-seam checks, run `npm run verify`, exercise real projector/phone journeys using the repo's verify-sideshow skill, and obtain independent party-game-verification plus a fresh party-game-design critique. Resolve play-blocking findings and record evidence at the tested revision. Generate production assets and audio using the prescribed skills when available without exposing credentials. Report unavailable capabilities honestly and complete unaffected work.

Continue until the engineering-manager's applicable completion gate passes or a genuine human decision or unavailable capability blocks remaining work. Do not claim human fun or onboarding validation from automated tests. Leave a reviewable implementation and concise evidence report with remaining human playtest questions. Deployment and merging are not requested.

This cloud task will not inherit the desktop conversation. The concept, mockups, prompt record and this handoff contain the accepted context. Read them before changing code. Check the current repository state and adapt to existing games instead of assuming the local design session described every current harness feature.
