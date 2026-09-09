# Game concepts

Ten games for the projector-and-phones shell, in the order I'd build them.

---

## 1. Joust

Flap to fly. Whoever is higher wins the crash. Losers drop an egg, anyone can grab it.

| | |
| --- | --- |
| **The moment** | You kill someone, and while you're gloating they fly back and steal their own egg off you. |
| **Shape** | Free-for-all, no elimination |
| **Screen** | One fixed arena, no scrolling, edges wrap around. Everyone always visible. |
| **Controls** | One button (flap) and a stick for drift |
| **Escalation** | Platforms crumble under you, so nobody can camp up high |
| **When you die** | Back in three seconds |
| **Scoring** | One point per egg collected. Kills score nothing on their own. |
| **Length** | 90 seconds |
| **Build cost** | Smallest of the lot. Two days. |
| **Risk** | If the crumble timing is wrong everyone sits on the top platform and nothing happens. |

Build this first. It's cheap, and it proves the fixed-arena camera works before you spend real time on anything.

---

## 2. Log Runner

Ten people on a rolling log. Obstacles come at you. Jump or duck.

| | |
| --- | --- |
| **The moment** | Six people knocked off in one badly-timed jump. |
| **Shape** | Last one standing, but the dead stay busy |
| **Screen** | Side-on, fixed. Obstacles sweep in from the right. |
| **Controls** | Two buttons |
| **Escalation** | Obstacles always take the same time to reach you. It gets harder by getting busier — doubles, fakes, duck-then-jump combos — not faster. |
| **When you die** | You wash up on the bank and throw branches at the log |
| **Scoring** | Points per second alive, bonus for last three standing |
| **Length** | 90 seconds |
| **Build cost** | Small. No physics, just timing windows. |
| **Risk** | Getting boring if the patterns run out. Needs maybe 20 hand-made ones. |

---

## 3. Split

The camera can't hold two groups. When people spread out, a countdown starts and the smaller group gets left behind.

| | |
| --- | --- |
| **The moment** | Four seconds left, everyone sprinting sideways, nobody sure which group is bigger. |
| **Shape** | Free-for-all with no combat at all |
| **Screen** | Frame follows the survivors and ratchets tighter with every split. It never opens back up on its own. |
| **Controls** | Stick only |
| **Escalation** | Each split shrinks the arena about 18%, down to a floor of a quarter size |
| **When you die** | You become part of the edge. Pick a section of the border and push inward on a cooldown. Kills score. |
| **Scoring** | Points per second alive, plus kills from the edge |
| **Length** | 45–60 seconds, best of five |
| **Build cost** | Small. One stick, no combat code. |
| **Risk** | The first split firing before people understand the rules. Needs a ten-second grace period at the start. |

The good bit: someone on the edge can call you over to be rescued, and a rescue opens the arena back up a notch. They might be helping. They might be about to spike you. Nobody can tell, and the whole room hears the negotiation.

---

## 4. The Gun

Nobody has a weapon. You can only shove. Every 15 seconds a gun drops that kills in one shot.

| | |
| --- | --- |
| **The moment** | You pick up the gun and nine people turn around at once. |
| **Shape** | Free-for-all, villain role rotates constantly |
| **Screen** | Side-on platform arena, fixed. The gun keeps everyone bunched together, so the camera never has to work. |
| **Controls** | Stick, jump, shove/shoot |
| **Escalation** | Drop points move to nastier spots — ledges, gaps, the middle of everything |
| **When you die** | Respawn in three seconds |
| **Scoring** | Points per second holding the gun, plus one for killing whoever has it |
| **Length** | Two minutes |
| **Build cost** | About a week. Platform physics and knockback need real tuning. |
| **Risk** | The reload timing is the whole game. Too fast and one person holds it forever, too slow and picking it up is pointless. Only findable on the wall. |

Whoever holds the gun can't shove. No fallback, so reloading is terrifying.

---

## 5. Drag

Eat to grow. The bigger you are, the more the camera follows you. Fall out of frame and you burst.

| | |
| --- | --- |
| **The moment** | Two big players quietly agree to move the same way and wipe out half the board. |
| **Shape** | Free-for-all with spoken alliances and no alliance mechanic |
| **Screen** | Camera sits on the weighted average of everyone's size, so heavy players drag the frame around. Stragglers genuinely fall out. |
| **Controls** | Stick, plus a lunge button that costs size |
| **Escalation** | Food stops spawning as the round goes on, so the total shrinks and the camera closes in on its own |
| **When you die** | Back in eight seconds as a small fast one, with three seconds of edge immunity and a short double-food window |
| **Scoring** | Points per second, scaled by your size |
| **Length** | 90 seconds |
| **Build cost** | Medium. The camera rule is the whole game and needs care. |
| **Risk** | Snowballing. Being big has to hurt — size decays faster the bigger you are, and lunging costs size, so you can never sit still on a lead. |

Warning band 10% in from the edge: vignette, your name pulsing, a buzz on the phone. Death should always be seen coming.

---

## 6. Shared Tower

One tower. Everyone drops blocks on it. Whoever is highest when it falls wins.

| | |
| --- | --- |
| **The moment** | Someone places a block to boost themselves and brings the whole thing down. |
| **Shape** | Free-for-all, no elimination, no phases |
| **Screen** | Camera pulls back as the tower grows |
| **Controls** | Tap where you want your block |
| **Escalation** | Blocks arrive faster and get more awkward in shape |
| **When you die** | Nobody dies |
| **Scoring** | How high your colour sits when it collapses |
| **Length** | 60 seconds or until it falls |
| **Build cost** | Small if you use an off-the-shelf physics library |
| **Risk** | Physics being fiddly rather than funny. Needs chunky forgiving blocks. |

Building and wrecking are the same action, so there's no dead build phase to sit through.

---

## 7. Hide as Scenery

Everyone hides by freezing and turning into a bush. One player hunts.

| | |
| --- | --- |
| **The moment** | The hunter walks past you twice, turns around, and you swing. |
| **Shape** | One against nine, hunter rotates each round |
| **Screen** | Camera follows the hunter. Watching is the game. |
| **Controls** | Stick to move, one button to freeze, one to swing |
| **Escalation** | Hunter's shots run down. Wasting one on a real bush costs. |
| **When you die** | Rounds are 60 seconds and the role rotates, so you're never out long |
| **Scoring** | Points for surviving, for near misses, and for ambushing the hunter |
| **Length** | 60 seconds per round, everyone gets a turn hunting |
| **Build cost** | Medium. First game with different roles, so the shell gets a workout. |
| **Risk** | Hiders having nothing to do. Fixed by the swing, and by small risky movements that score if unseen. |

If a hider ambushes the hunter, they become the hunter. Cap it at two swaps so rounds still end.

---

## 8. Bomberman

Grid, bombs, destructible walls. You know this one.

| | |
| --- | --- |
| **The moment** | Watching four people die in one chain reaction nobody planned. |
| **Shape** | Free-for-all, quick elimination |
| **Screen** | Fixed grid, roughly 19×15, all visible |
| **Controls** | Dpad and one button |
| **Escalation** | Walls close in after 45 seconds |
| **When you die** | Rounds are short enough that it doesn't matter. Best of five. |
| **Scoring** | Points per kill and per round won |
| **Length** | 60–90 seconds |
| **Build cost** | Small to medium. Well-trodden ground. |
| **Risk** | Ten players on a normal-sized grid is a bloodbath in eight seconds. Make it bigger than feels right. |

Optional extra: 30 seconds of wall placement before each round, so the map is different every time for almost no extra code.

---

## 9. Volley

Everyone aims at once. Twelve second window, then all ten shots fire together.

| | |
| --- | --- |
| **The moment** | The screen filling with arcs and nobody knowing what's about to land where. |
| **Shape** | Free-for-all, simultaneous turns |
| **Screen** | Whole battlefield visible, terrain gets blown apart |
| **Controls** | Drag to aim, which is the nicest thing a phone can do |
| **Escalation** | Terrain gets more wrecked as the night goes on |
| **When you die** | Rounds are short, and you can watch the shot you already fired land |
| **Scoring** | Hits and knockouts |
| **Length** | Three minutes |
| **Build cost** | Medium. Destructible terrain is the tricky part. |
| **Risk** | Aiming blind at a moving target being frustrating rather than funny. Show your last shot's arc as a guide. |

Best feature: the terrain stays wrecked between rounds all night. By the fifth game the map is scar tissue the room made.

---

## 10. One Body, Ten Drivers

Everyone steers the same character. The inputs get averaged.

| | |
| --- | --- |
| **The moment** | Everyone screaming "LEFT" and the thing going right. |
| **Shape** | Co-op, nobody loses |
| **Screen** | Follows the one character |
| **Controls** | Stick |
| **Escalation** | Harder courses. Land the ship, climb the mountain, park the truck. |
| **When you die** | Instant retry |
| **Scoring** | Everyone gets the same points. It's a shared score. |
| **Length** | Two minutes |
| **Build cost** | Smallest of any game here |
| **Risk** | Averaging feeling mushy. Try averaging only the players who are actively touching the stick. |

Worth having because it's the one game your six-year-old and your mother-in-law play exactly as well as anyone else.

---

## 11. Hill

Five versus five. One circle on the map. Your team scores while you hold it.

| | |
| --- | --- |
| **The moment** | Five seconds before the hill moves, both teams already sprinting for where it's going to be. |
| **Shape** | Teams, no elimination |
| **Screen** | Top-down, whole arena visible. The hill pulls everyone into one spot, so the camera never has to chase anybody. |
| **Controls** | Stick, plus fire |
| **Escalation** | The hill moves every 30 seconds, telegraphed 5 seconds early. Scramble, standoff, scramble. Stops a winning team digging in. |
| **When you die** | Back in four seconds at the edge of the frame. Death costs you position, not the round. |
| **Scoring** | Team seconds on the hill decide the round. Your personal points come from your own seconds held, assists, and contests broken. |
| **Length** | Two minutes, or until a team hits the score threshold |
| **Build cost** | Medium. Top-down movement and shooting, plus team assignment. |
| **Risk** | Teams being hard to tell apart on a projector. Colour alone won't do it. |

Three shots then a slow reload, so fights are decisions rather than a spray contest. That's the main thing keeping a mixed-skill room fair, and it's far easier to read from four metres.

Two team shapes plus two colour families, and the hill glows whoever owns it. Anyone should be able to see who's winning without reading a number.

This is the shooter on the list, and the only team game. Capture the flag was the obvious alternative and it doesn't work here — two bases far apart is exactly what one camera can't frame.

---

## Build order

**Joust**, then **Split**, then **Log Runner**. All cheap, all different shapes, and together they test everything the shell needs to support — fixed arenas, camera-driven rules, two-button input, and dead players who still have something to do.

Then **The Gun** and **Drag**, which are the two with the most replay in them but need real tuning time.

**Hill** whenever you want a team game in the rotation. It shares most of its guts with The Gun — top-down movement, shooting, respawns — so it gets much cheaper if you build that one first.

Keep the night varied: something twitchy, something co-op, and something with no reflexes at all so the least game-literate person in the room can still win a round.
