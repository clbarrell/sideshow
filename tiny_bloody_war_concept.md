# Tiny Bloody War — mechanics exploration

Status: proposed design, 12 September 2026. Not an approved implementation spec or a tested fun verdict. Builds on Tiny Bloody War and Hill in [game_concepts.md](game_concepts.md). Numerical values below are starting points for a prototype.

Exploratory visual mockups: [battlefield](docs/concepts/tiny-bloody-war/battlefield.png) and [combat and phone controls](docs/concepts/tiny-bloody-war/combat-and-controls.png). Generated with the built-in image tool; the [prompt set](docs/concepts/tiny-bloody-war/prompts.md) records their production. These are illustrations of a direction, not evidence of playable implementation.

## The promise

Two small medieval armies fight over a banner. Every player directly controls one fighter. A soldier can protect an archer, a flanker can break that partnership, and capturing ground matters more than collecting kills.

The moment: “Stay behind my shield — go around them — push NOW!”

Start with team combat. A free-for-all can follow if the combat itself proves satisfying; do not compromise the first team loop to support both at once.

## Round loop

1. Join a team and choose shield soldier or archer. Duplicate roles are allowed. Choices stay visible on the projector so teammates can discuss their composition. No forced captain or role quota.
2. An approximately ten-second launch runway loads landscape controls, identifies each player, demonstrates aim-and-release, and permits a harmless practice attack. A shared 3–2–1–GO starts movement and damage together.
3. Fight for one banner in a fixed arena. A team earns one point per second when it has at least one player inside and no opponent inside. Extra occupants do not multiply the score. An empty or contested circle scores nothing.
4. At 30 and 60 seconds the banner relocates to another authored site. The next site and its countdown appear five seconds ahead. Only one site scores at a time. This creates a choice between taking the last few points and moving early.
5. At 90 seconds, the higher territory score wins. A tie stays a draw; no unannounced overtime. Show a short victory beat and contributions, then permit role changes. Target a best-of-three set, ending early on two wins; if neither team has two wins after three battles, use battle wins to decide the set, or draw if equal.

The small loop inside every fight is approach → aim/brace → commit an attack → expose yourself during recovery → reposition or cover a teammate. There is no loot, economy, levelling or equipment menu in the first version.

## Controls and combat

Landscape phone, left thumb moves, right thumb aims. Both controls sit at the outer resting-thumb positions with independently tracked touches. The center contains identity and a brief control hint; no live information requires looking down.

Both roles share one instruction: **Move. Aim. Release to attack.** This is a hypothesis to test, not a settled control scheme.

| Role | Hold the right stick | Release the right stick | Weakness |
| --- | --- | --- | --- |
| Shield soldier | Face the indicated direction, visibly ready a short spear and brace a shield against frontal arrows. Bracing slows movement substantially. | Commit one short spear thrust. The shield lowers through the attack and recovery. | Short reach; slow while braced; vulnerable from the sides, rear and during an attack. |
| Archer | Draw a bow in the indicated direction. Movement slows while drawing; the bow visibly reaches full draw. | Fire one arrow in that direction, then recover before drawing again. | Less health; exposed at close range; arrows lose to a correctly facing shield. |

The left stick alone moves at normal travel speed. The right stick must leave a generous dead zone to prepare an attack. A deliberate pointer release fires once if the weapon is ready; stick jitter does not create repeated attacks. Touch cancellation, orientation change, disconnection or page hiding cancels rather than fires. Very short accidental touches should not attack. The final dead zone and minimum hold duration need phone testing.

Aim determines the attack direction; spinning the stick does not cause damage. Use predictable attack shapes and recovery windows, with exaggerated animation and death ragdolls layered over them. Do not make arbitrary physics impulses decide a hit.

Initial balance seeds:

- Soldier: three health pips; archer: two. All successful attacks remove one pip.
- A shield stops arrows only within a clearly indicated frontal arc. A short spear thrust beats a shield at close range, so two soldiers cannot permanently turtle against one another.
- Soldier attack has a short visible anticipation and roughly half a second of exposed recovery. Each thrust can damage one opponent once. Small, consistent knockback creates a way to move defenders off the circle.
- Archer draw takes roughly 0.4–0.8 seconds, followed by a visible recovery. Cap draw strength; prolonged holding grants no extra damage. Arrow flight must be slow enough to read and evade at useful distances.
- Try braced soldier movement around half normal speed and drawing archer movement around two-thirds. Neither number is a promise; movement and projectile speed jointly decide whether a shield rush or endless kiting dominates.
- Friendly arrows pass through teammates; friendly attacks do no damage. Enemy arrows are intercepted by a teammate's shield before reaching the protected player. Allied bodies separate softly and cannot form an impassable wall.
- No healing, stamina meter, dodge button, critical hits, headshots or gear statistics in the first prototype. Health remains visible on the projector and resets on respawn.

## Why cooperate?

The banner pays the same rate for one occupant as five. A team therefore has spare players who can intercept reinforcements, escort an archer or threaten a second angle.

- **Protection:** a shield soldier gets an archer into a useful position by intercepting enemy arrows.
- **Covering an attack:** the soldier opens their guard to thrust; their archer threatens enemies trying to exploit that opening.
- **Flanking:** two attack directions force a defender to choose where the shield faces. An isolated shield should be breakable.
- **Peeling:** a soldier drives a close attacker away from the team's archer, letting the archer resume contributing.
- **Rotation:** one player takes the last seconds of possession while allies move toward the next banner.

Each player owns their movement, facing and attack. Team coordination is spoken, voluntary and visible. No player's input is averaged away or dependent on a captain granting permission.

Award the same team-result leaderboard credit to teammates using the eventual shell-compatible mapping. Display concrete personal contributions such as successful arrow blocks, assists and time contesting as end-of-battle accolades, rather than making kill farming compete with the objective. Do not add a vague “protected ally” score until attribution can be measured honestly.

## Arena and population

One fixed overhead battlefield, with slightly three-quarter character art. All ten players stay in frame. A few low stone obstacles create flanking choices, with broad routes and no narrow spawn choke. Three authored banner sites have comparable access from both teams' entry routes. Do not shrink the arena as well as moving the objective in this first version.

Start balance testing at 2v2, then 3v3 and 5v5. The intended party range is four to ten players. Odd-team fairness remains an explicit unresolved design question: do not silently claim a 4v5 match is balanced or make somebody spectate. A decision on odd populations is required before shipping to the general catalogue.

The live HUD contains team crests, scores, timer and banner state. The next-site preview appears only in its five-second warning. Each fighter has a short name, seat mark, clear facing and health pips. Team colour is reinforced by square-versus-triangle insignia; soldier and archer silhouettes remain distinct within either team. No live ten-row leaderboard.

## Death and recovery

Death is a brief exaggerated collapse, followed by a three-second countdown and respawn at an authored safe edge entry. Keep the player's name and return countdown visible; the phone retains its controls. The walk back to the fight should be short but long enough that winning a fight earns actual uncontested possession.

Brief spawn protection has an obvious outline and ends on attacking, entering the objective, or its timeout. Protected players cannot obstruct opponents. Clear the effect immediately when protection ends. A killed player does not gain a fresh offensive action while still protected.

Late arrivals join at the next battle boundary. On lost input, movement and aim cancel; the fighter remains vulnerable. Reconnection restores the same seat and current life or respawn state. Extended absence and host refresh should pause or abort the battle through the shell's established recovery flow rather than silently award the other side a win. Check actual shell capabilities before implementation; this document does not assert those flows already exist.

## Look, motion and sound

Proposed visual direction: chunky, slightly ridiculous medieval miniatures. Huge helmets, short legs, broad shields and readable bows. Warm parchment ground, charcoal outlines, rust-red square insignia against bright teal triangular insignia. Sparse stone cover. Team-coloured paint splats, with a clean alternative using sparks and torn banner scraps.

Weapons visibly prepare, commit and recover. A shield block makes a crisp spark at the contact point; a hit changes silhouette and removes a health pip. Corpses and paint clear quickly. Camera movement is unnecessary; reduced motion removes shake and reduces debris while preserving attack warnings.

Sound roles: shield clang for a blocked arrow, bow creak for draw, release twang, weighty but short melee impact, banner-change warning, shared GO and victory sting. Limit overlapping impacts and keep warnings above the battle mix. Phone haptics may acknowledge a local hit or ready state where supported; visual feedback remains sufficient when muted or haptics are unavailable. Audio generation belongs after mechanics selection.

## What must be proved before expansion

1. A newcomer can find their fighter and deliberately move, aim, attack and block after the launch runway. Specifically watch for unintended attacks when re-gripping the right control.
2. One soldier protecting one archer has a useful advantage over two disconnected solo attacks, and opponents can understand how to break the partnership.
3. All-soldier teams do not automatically beat mixed teams; archers are useful without dominating through endless kiting. Test equal and unequal experience levels.
4. A won fight earns meaningful possession. Constant respawn contesting must not leave both teams near zero. First tune entry distance and circle size, rather than adding capture rules.
5. At ten players, people can still identify themselves, distinguish attack recovery from defence and find a useful job. Test at actual projector distance.
6. Rounds create deliberate pushes, escapes and rotations rather than just repeated movement toward the center.

If release-to-thrust repeatedly confuses players, compare it against an explicit attack-button control prototype before adding combat features. If class synergy fails, change those two roles before adding spear specialists, knights, charges or healers.

Build cost is medium-to-large relative to a simple two-button game: readable ten-player aiming, responsive touch input, fair attack timing and class balance are the work. This proposal is ready for discussion and visual exploration; a build-ready spec still needs control validation, odd-population policy and verified lifecycle integration.
