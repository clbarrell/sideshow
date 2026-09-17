# Getaway

**Two crews rob the same bank. Grab more than you can safely carry, protect your loaded teammates, and steal the other crew's haul before it reaches their van.**

Status: local **PLAYTEST-READY** candidate implemented as `getaway`. See [production verification](getaway-production-verification.md). All objective production gates pass; no group playtest evidence yet. Numerical values below are starting hypotheses, not balance findings.

## The game we want

Getaway adds decisions about risk, position and cooperation to Sideshow's short action games. The controls stay simple; the situation changes what a useful action looks like.

The defining moment is a teammate shouting “I've got five—get them off me!” A player abandons their own collection run to clear a route, an opponent knocks one bag loose, and everyone has to choose between the escaping carrier and the money on the floor.

The central fun hypothesis: **does seeing an overloaded teammate make someone voluntarily stop collecting and help them get home?** If escorting is merely something the tutorial recommends, the design has not worked.

## Concept sheet

| | |
| --- | --- |
| Shape | Two teams, simultaneous action, no elimination. Supports 4–10 players; odd rosters use a smaller-crew scoring bonus. |
| Screen | One fixed overhead bank courtyard, with a central vault, three collection positions, short alternative routes and a getaway van at each side. No scrolling or hidden information. |
| Controls | Landscape thumbstick on the left; one large SHOVE button on the right. Pickup and banking are automatic under the conditions below. |
| Ergonomics | Both actions sit under resting thumbs and work simultaneously. No aiming stick, drag gesture, inventory or phone reading during play. |
| Shared agency | Each person controls their own robber. Carrying, escorting and intercepting are temporary jobs anyone can adopt. Teammates cannot knock loot out of each other. |
| Escalation | Decisions accumulate through carried loot and positioning. In the final 30 seconds, the vault closes and remaining loose or carried loot becomes the only money available. Movement and shove timing stay constant. |
| Eliminated players | Nobody is eliminated. A hit causes a short stumble and loses at most one bag. |
| Scoring | Each banked bag earns one point, with a crew-size bonus for the smaller crew on odd rosters. Everyone on a crew shares its adjusted match result and party placement; no individual combat score. |
| Length | 150 seconds of live play, plus a first-play practice and launch runway: approximately three minutes. One match per visit in the party rotation. |
| Build cost | Medium relative to a two-button game: movement, predictable shove contacts, loot, teams, banking and ten-player readability. No projectile, class or ragdoll simulation required. |
| Main risk | Fighting becomes more rewarding than transporting, particularly outside the vans. |
| Onboarding | Projector teaches “Grab bags. More bags = slower. Shove to spill one. Reach YOUR van to score.” A short practice demonstrates each action. |
| Launch runway | Wait for required controllers to load, show landscape controls, run first-play practice, reset, then give an eight-second visible runway ending in 3–2–1–GO. |
| Art direction | Toy-sized crooks robbing an oversized bank: cream stone, ink outlines, two bold team colours and shapes, yellow money sacks. The growing physical stack is the main visual joke and information display. |
| Animation | Loaded robbers hunch and waddle; shoves have a clear wind-up and thump; one sack arcs out on a hit; banked sacks fly into an open van. Animations must preserve predictable movement. |
| Audio | Distinct pickup rustle, shove thud, deposit chime and vault-closing bell. Music supports the rush without carrying rules. Every cue has a visible equivalent. |
| Recovery | Neutral input immediately stops movement on loss of control. After a short grace period, a disconnected robber withdraws and leaves its bags; reconnect at its van with no carried loot. Roster changes wait until the next match. |
| Accessibility | Team silhouettes and van emblems supplement colour; seat identity and short names identify individuals. No critical audio, rapid tapping, tiny cooldown text or shake is required. Reduced motion retains all hit, pickup and deposit signals. |

## Arena and flow

Start with a symmetrical courtyard. The vault sits in the middle, each van sits at an opposite edge, and two short walls create a direct route plus a detour on either side. Both vans and every player remain visible at all times. This is a compact arena, not two distant bases connected by a scrolling level.

Each van has a wide, clearly marked deposit apron approachable from at least two directions. There are no narrow doors, dead-end spawn pockets, controllable gates or traps in the first prototype. Use fewer obstacles for four players; retain the same rules.

The three collection positions around the vault prevent a single player from covering all supply. Start each position with five bags and replenish one every 1.5 seconds, up to five, while the vault is open. Supply timing is predictable. These deliberately generous prototype values should let loaded carriers appear even with ten players; tune supply against observed haul sizes before judging escorting. There are no random jackpots or bags worth different amounts.

At 120 seconds, the vault shuts. Show a ten-second warning before closure. Existing bags stay in play. This creates a final choice between securing your haul and intercepting the opponent's last delivery, without introducing another control or faster hazards.

At 150 seconds, adjusted banked points decide the result. Unbanked bags are worth zero. A tie stays a tie; there is no surprise overtime or last-delivery multiplier.

## Carrying: choosing when enough is enough

Carry up to five bags. A candidate movement curve is 100%, 92%, 82%, 70%, 58%, then 48% of empty speed for zero through five bags. Display the physical stack on the robber; the exact percentages never appear in the player UI.

Fresh vault loot is collected by remaining in a collection position: one bag every 0.6 seconds. Moving away stops collection. This makes taking another bag a deliberate commitment instead of an unwanted pickup while passing the vault. Loose bags on the ground are picked up on contact if there is capacity.

There is no extra bag-stack bonus. Five bags are worth exactly five bags. Carrying more saves repeated journeys but increases exposure; banking one or two should be a reasonable response to nearby opponents. If full loads dominate every trip, adjust carrying slowdown, collection time or route length before adding mechanics.

Players cannot manually drop, throw or transfer bags in the first version. Escorting earns its value by protecting movement, not by opening a trading interface.

## Shoving: creating an opening

Press SHOVE to strike a short cone in the direction of movement or the last faced direction. A forward-facing body and arm pose keep that direction visible. Prototype a roughly one-second cooldown, a short wind-up and a generous contact window. Holding the button repeats at the same cooldown so success does not depend on rapid tapping.

A shove hits only the nearest opponent in its cone. It causes modest knockback, a roughly 0.25-second stumble, and at most one dropped bag. An empty opponent can still be displaced, which lets an escort clear an interceptor away from a carrier. There is no damage, stun meter or kill.

After a hit, the target has approximately 1.2 seconds of protection against another shove or spill, shown by a clear outline. Additional attackers cannot juggle a carrier indefinitely. The attacker is not guaranteed the bag: it lands visibly away from the victim and becomes collectible after a brief landing beat. The victim cannot immediately recollect it for 0.8 seconds; other players can compete for it after landing.

Player bodies use soft separation, not solid walls. A line of defenders must not physically seal an exit. Teammates neither block each other nor take friendly shove hits. Simultaneous valid enemy shoves can both connect; no input race decides a clash.

## Banking and interception

Crossing your van's deposit line with bags banks the entire haul immediately. No hold-to-deposit, stationary progress bar or ability to steal already banked money. Crossing the opposing van's line never deposits your loot.

The small apron immediately behind the line protects only the van's own crew from shoves. An opponent entering it gains no protection. It is a delivery endpoint, not a firing position: nobody standing in either apron can shove. Match resolution must consistently treat reaching the line as a completed delivery before accepting a later hit.

Opponents intercept on the routes outside the apron. Both approaches must be wide enough to permit dodging and escorting. If camping still dominates, widen approaches, shorten exposed return paths or increase shove recovery; do not solve it first with turrets, invulnerability pickups or another button.

This deliberately changes the original alternating shared-exit pitch. One active shared gate risks pulling every player into a permanent scoring scrum. Two team vans give the arena several simultaneous purposes. Moving vans remain an optional experiment only if fixed routes become predictable after the core loop works.

## Why teamwork should happen

An empty player is substantially faster than a loaded carrier. That player can catch an attacker or move ahead to clear the return route. The carrier can accept losing one bag and keep moving, or turn back to recover it and risk the remainder. The interceptor can chase the haul or secure the bag already stolen.

All players have identical abilities. Nobody selects “guard” or is locked into a support class. There are no tactical orders that teammates must obey. The projector makes useful work apparent through bag stacks, threatened carriers and the two team totals.

Banked money cannot buy upgrades, so a lead grants no mechanical advantage. Strong movement players may still dominate; team play is a hypothesis for softening that gap, not proof of fairness. Test mixed-skill groups specifically.

All teammates receive the same party result. End-of-match flavour acknowledgements may celebrate a big delivery, but do not award personal points for shoves or pickups: that would encourage abandoning an escort for a farmable statistic.

## First play and projector priorities

First-play practice lasts up to 20 seconds with abundant practice loot near each van. Prompt collecting, shoving and banking in that order, with a small animated demonstration for any action the room misses. Practice scores do not carry over. Returning players can use the standard launch runway.

During play, reserve the top edge for two crew totals and the clock. Names sit over distinct seat silhouettes; stacks sit below those names. Each van carries the same team shape as its crew. Show the vault warning on the vault itself. Omit individual standings, floating point arithmetic and instruction paragraphs during action.

Hit protection and ready-to-shove feedback must be readable on the character, with optional haptics reinforcing them. Critical cues work with muted audio and a washed-out projector. At ten players, check the vault scrum and a five-bag carrier among several escorts before adding visual polish.

## Roster and interruption policy

The game supports four to ten players. Equal crews score one point per bag. For odd rosters, the smaller crew earns an exact larger-size / smaller-size multiplier: ×1.5 for 2 vs 3, ×4/3 for 3 vs 4, and ×1.25 for 4 vs 5. The seven-player UI abbreviates ×4/3 as ×1.33. Crew sizes are fixed at launch, so a disconnect or withdrawal cannot alter either bonus. The projector and phone distinguish raw bags from adjusted points; exact ratios decide ties, while displayed and party-awarded points use at most two decimal places.

This is an accepted balance experiment, not evidence of fair matches. The larger crew retains more coverage and interception capacity, especially at 2 vs 3. A human playtest must establish whether escorting remains useful on both sides. Two-player play cannot test escorting and remains outside the supported range. See [odd-roster verification](getaway-odd-roster-verification.md).

Late joiners enter between matches. A brief input loss produces neutral input immediately; after three seconds disconnected, withdraw the avatar and drop its bags. Reconnection restores the same team and seat at its van with empty hands. It does not refund lost loot or bank carried loot.

If a team remains short-handed for more than ten seconds, pause and offer a restart with an eligible roster or return to the lobby, without awarding a competitive result. A host refresh restarts the match rather than claiming to recover an in-progress simulation. The implementation must map these behaviours onto the existing host-owned simulation and party lifecycle.

## Prototype gate

Build one plain arena with circles, named bag counters, two vans and the rules above. Hold off on classes, police, weapons, upgrades, moving exits, destructible scenery and special loot.

Test four players first, then ten, including players with different game experience. Observe:

- Do players sometimes leave with one or two bags and sometimes risk more? If every run has the same load, the carrying decision is not working.
- Does someone voluntarily escort a loaded teammate without being assigned that job? Ask afterward why they chose it.
- Can an escorted carrier get through a defended approach, and can an interceptor still steal something? Neither job should be futile.
- After a shove, can the victim recover control and make a useful choice immediately? Repeated helplessness is a failure.
- Are both return routes used, and does meaningful play happen outside the vault scrum?
- Can all ten players find themselves, their van and a threatening opponent at projector distance?
- Does vault closure create a final plan, rather than thirty seconds of chasing the last empty opponent? Shorten that phase if it creates dead time.

Record these observations alongside real host/controller lifecycle checks before expanding scope. A second prototype may compare fixed vans with telegraphed moving extraction, but change that one structural rule in isolation.

The concept succeeds if the room starts forming and changing plans through play: “You carry; I'll clear the left side.” It fails if the best answer is always “stand at the vault and hold shove.”
