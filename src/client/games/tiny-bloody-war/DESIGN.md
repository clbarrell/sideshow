# Tiny Bloody War — executable slice

**Player promise:** two tiny armies create a shouted “behind my shield — flank them — push now!” moment while ground, not kills, wins the war.

The accepted concept in `tiny_bloody_war_concept.md` is authoritative. This slice deliberately contains only shield soldiers and archers, an authored fixed arena, one moving banner, three-second respawns, and a best-of-three set. Teams are assigned by alternating seats and role choice stays voluntary during the harmless runway. The shell gives every teammate equal tournament credit; battle cards report blocks, hits and contest time without rewarding kill farming.

## Prototype hypotheses

- Release-to-attack is intentional after a 180ms hold and generous aim dead zone; cancel/lost capture/blur never attacks.
- Soldiers move at 48% speed while braced; archers at 66% while drawing. Soldier thrust recovery is 520ms; archer draw caps at 700ms and recovers for 620ms.
- A 250px objective, three-second respawn and short protected walk should let a won exchange earn possession without eliminating anyone.
- Arrow speed and shield arc should make an escort useful without making all-soldier teams dominant.

Odd populations remain an explicit product decision. The prototype does not add a bot, spectator or hidden handicap; an unequal match is labelled **PLAYTEST: UNEVEN TEAMS** on both surfaces.

**Frame budget:** 16.7ms at 1280×720 with ten fighters. Simulation is bounded to ten fighters, 24 arrows and 140 particles; no frame-loop DOM work or network asset dependency.

## No-spoken runway

For six seconds players can move, choose a role and harmlessly practice. The arena then resets for a visible four-second `3–2–1–GO`. Projector and phone repeat one rule: **MOVE · AIM · RELEASE**. Controls remain mounted throughout.

## Human playtest questions

1. Do re-grips still create accidental attacks despite the hold threshold?
2. Does one soldier/archer pair outperform disconnected solo play without becoming mandatory?
3. Do mixed teams beat all-soldier turtling, and can an archer escape without endless kiting?
4. Does a won exchange buy meaningful banner time at 2v2 and 5v5?
5. Can ten players identify self, class, facing, guard and recovery at projector distance?
