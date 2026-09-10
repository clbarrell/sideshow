# Game concepts

Games for the projector-and-phones shell, roughly in the order I'd build them.

## Delivery status

Last reconciled: 10 September 2026.

| Game | Status | Evidence / next gate |
| --- | --- | --- |
| **Joust** | **Implemented** | Merged into `main`, registered as `joust`, and shown in the lobby as **Featherweight Championship**. |
| **Last Marble** | **Implemented** | Merged into `main` through PR #2 and registered as `last-marble`. |
| **Split** | **Implemented** | Merged into `main` through PR #3 and registered as `split`. |
| **Log Runner** | **WIP** | Isolated build worktree started from `origin/main`; implementation has not merged yet. |
| **Cut & Shut** | **WIP** | Isolated build worktree started from `origin/main`; implementation has not merged yet. |

Everything else below is a **Concept**. These labels track delivery state only; playable quality and human-playtest verdicts stay with each game's implementation evidence.

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

Built first. It proved the fixed-arena camera before the more experimental games began.

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

This is the shooter on the list, and the first team game. Capture the flag was the obvious alternative and it doesn't work here — two bases far apart is exactly what one camera can't frame.

---

## 12. One Touch

Pucks fly between ten players standing in a circle. Keep the room's streak alive by choosing who gets each puck next and tapping exactly when it reaches you.

| | |
| --- | --- |
| **The moment** | Two puck trails cross in the middle and both receivers hit perfect one-touches. |
| **Shape** | Co-op chain with visible individual contributions, no elimination |
| **Screen** | Fixed overhead circle. Players are big, numbered shapes around the rim; bright trails make every puck's recipient and arrival time obvious. |
| **Controls** | A 3×3 grid of the other players. Tap a player's large numbered tile to catch and redirect in one motion. |
| **Escalation** | Start with one teaching puck, add a second after 10 seconds and a third after 30. Flight time never gets shorter, so the timing window stays fair. |
| **When you miss** | The shared streak resets, but nobody loses a turn. The puck rebounds to the middle and picks a new recipient. |
| **Scoring** | The room chases one chain score. Individual party points come from clean one-touches, cross-circle passes and saves; the multiplier grows only when pucks visit new players. |
| **Length** | 60 seconds, best of three |
| **Build cost** | Small. Mostly timing, trails and readable player targeting. |
| **Risk** | Ten target tiles may make people stare at their phone. Keep the same seat layout every round and make the projector do all the timing communication. |

The pass is committed by the tap; there is no separate catch button. That is the whole game: choose a target and hit the beat with one thumb. A missed puck makes a sharp visual ricochet and phone buzz, while a perfect pass gets a clean chime and a fat pulse around both players. It must remain readable with sound muted.

---

## 13. Open Plan

Infection tag in a destructible office. Anyone caught joins the seekers, and every escape route leaves the floor plan more broken.

| | |
| --- | --- |
| **The moment** | The last runner smashes through a meeting-room wall and discovers three seekers waiting on the other side. |
| **Shape** | One seeker against everyone, then a growing team against the survivors |
| **Screen** | One fixed top-down office floor. Chunky rooms, desks and drywall create a maze without hiding any player from the camera. |
| **Controls** | Stick to move, one shoulder-charge button to break drywall or shove through furniture |
| **Escalation** | The office starts cramped and opens up as walls, glass and cubicles break. Fewer hiding routes, longer sightlines, more seekers. |
| **When you die** | Two seconds later you respawn at the edge in a red tie with a jagged silhouette. Getting caught is a team change, not elimination. |
| **Scoring** | Runners score per second uncaught and a bonus for being last. Seekers score for tags and assists. |
| **Length** | 60–75 seconds; rotate the starting seeker for three rounds |
| **Build cost** | Medium. Tag itself is cheap; readable destruction and collision are the work. |
| **Risk** | Ten players plus debris becoming visual soup, or the first seeker catching nobody. Walls need only two states, loose objects should vanish quickly, and the starting seeker gets a brief speed burst. |

Literal hide-and-seek cannot survive a shared screen: the seeker sees what everyone sees. Make it tag, and let the office provide the hiding *feeling* through corners, blocked routes and panicked wall-breaking. Give runners an eight-second head start during the launch runway, with controls live but tagging disabled until a giant **CLOCK IN**.

---

## 14. Last Marble

Ten marbles ram each other on a platform that disappears in big, telegraphed chunks.

| | |
| --- | --- |
| **The moment** | A three-marble collision sends the winner spinning toward the edge too. |
| **Shape** | Free-for-all, very short elimination rounds |
| **Screen** | Fixed overhead platform. Each marble has a unique colour, stripe pattern, topper and name flag that survives at projector distance. |
| **Controls** | Stick only. Momentum is the weapon; there is no attack button. |
| **Escalation** | Every ten seconds a marked slice cracks, flashes, then falls away. Warning time stays constant while safe space gets scarcer. |
| **When you die** | The round is only 35 seconds. You orbit the rim as a visible ghost marble and place one harmless fake crack marker to panic the survivors. |
| **Scoring** | Points per second on the platform, plus a small knockout bonus and a round-win bonus. |
| **Length** | 30–40 seconds, best of five |
| **Build cost** | Small to medium. One arena and one control, but the rolling and collisions need tuning. |
| **Risk** | Physics feeling slippery and arbitrary. Steering needs generous traction and collisions need exaggerated, predictable knockback. |

This is the strongest cheap prototype in this batch. Start with flat circles and tune whether people can deliberately line up a hit before making any art. The platform falls in readable slabs rather than shrinking smoothly, so people can plan, betray and yell before it goes.

---

## 15. Tiny Bloody War

Five versus five in one small battlefield. Pick a class, move with one thumb and physically aim your weapon with the other.

| | |
| --- | --- |
| **The moment** | A knight charges through the scrum, gets clotheslined by a spear, and the archer behind them lands the finishing shot. |
| **Shape** | Teams, class-based brawl, no elimination |
| **Screen** | Fixed top-down battlefield. Two strong team silhouettes, then a distinct helm and weapon silhouette for every player. Names stay overhead. |
| **Controls** | Landscape dual-stick: left thumb moves; right thumb aims the weapon. Melee weapons follow the stick, while an archer draws in the aimed direction and fires on release. |
| **Escalation** | The battlefield closes inward in two loudly telegraphed steps, forcing the armies together without making attacks faster. |
| **When you die** | Four-second respawn in a protected edge zone. You re-enter in a short, visible charge so nobody is spawn-killed. |
| **Scoring** | Team knockouts decide the battle. Personal points also reward assists, blocks, healing and time spent protecting an ally. |
| **Length** | 90 seconds, best of three |
| **Build cost** | Large. Dual-stick combat feel, four readable classes and balance make this the expensive one. |
| **Risk** | Four classes becoming four mediocre games. Prototype soldier versus archer first; knight and spear only earn a place if that duel is already fun. |

Keep the classes brutally simple: soldier is quick and balanced, spear has reach but poor turning, knight is slow with armour and a charge, archer is fragile and must release to fire. Weapon direction, reach and recovery should be visible in the animation, not explained through cooldown numbers on the phone.

The blood is exaggerated paint-like splatter in each team's colour, with a clean-mode toggle that swaps it for sparks and torn banners. It marks hits and deaths for the room; it cannot be the only signal. A heavy impact, silhouette pop and optional haptic cue carry the same information.

---

## 16. High Stakes

Ragdolls balance on tiny stilt platforms and throw one heavy axe every eight seconds. Nobody can walk; aim, release, then lean out of everyone else's way.

| | |
| --- | --- |
| **The moment** | Two axes collide in mid-air, tumble sideways and knock a completely uninvolved player off their perch. |
| **Shape** | Free-for-all knock-off contest, no elimination |
| **Screen** | Fixed three-quarter view. Ten platforms form a ring around the arena, with large name flags and different ragdoll silhouettes. Nobody can leave their perch. |
| **Controls** | Landscape stick plus fire. The stick leans your ragdoll and aims a held weapon; hold and release fire to wind up and throw. While reloading, the stick still dodges and recovers balance. |
| **Escalation** | Every knockout raises the scorer's stilt one tier, up to three. Leaders become taller, wobblier and easier for the room to target without making anyone's timing window shorter. |
| **When you die** | You ragdoll all the way down, then a springboard fires you back onto a rebuilt platform after three seconds with a fresh axe and brief protection. |
| **Scoring** | One point for a knock-off, one assist for the previous hit, and a bonus for toppling the current leader. |
| **Length** | 60 seconds, best of three |
| **Build cost** | Medium. The rules and controller are small; predictable ragdoll joints, aiming and projectile collisions are the work. |
| **Risk** | Eight seconds feeling like dead air instead of suspense. Leaning must make defence genuinely useful, and the replacement axe must visibly climb the stilt like a fuse counting down. |

The long reload is the identity, not an inconvenience to tune away. Every shot should be a room event: a short wind-up, a short trajectory wedge near the thrower, a violent release and an unmistakable clang when weapons meet. The projector shows the reload through the replacement axe being winched up each pole; the phone only needs the two controls and haptics.

Prototype one identical axe before adding frying pans, hammers or other skins. Different silhouettes are welcome, but different flight physics would make missed shots feel like the game's fault. The fun hypothesis is simple: can leaning, bracing and watching nine readable trajectories make the eight seconds between throws feel tense?

---

## Wild-card direction

This batch treats **splice** as a verb: roads, rules, bodies, clues and alliances are joined in public, then the result is tested all at once. Most rounds breathe in six beats — bargain, commit, watch an orderly system march, then enjoy the ragdoll collapse when one bad joint reaches the front.

The visual language is acid yellow for live paths and choices, oxblood for promises and failures, and dusty lilac for the board, void and inactive space. Wonky signwriter lettering makes every rule feel hand-painted and negotiable. Motion begins unnaturally precise — straight lines, hard stops, clockwork timing — so the single loose-limbed catastrophe lands harder. This is a creative constraint for the batch, not a house style every Sideshow game has to inherit.

These ideas deliberately explore things the current list barely touches: public bargaining, private motives, drawing, wordplay, haptics, role-based communication and simultaneous tactics.

---

## 17. Cut & Shut

Ten crooked property dealers trade road pieces and secretly route six couriers across a city that folds itself after every deal.

| | |
| --- | --- |
| **The moment** | The route everyone swore was safe folds shut and all six couriers march into the same canal. |
| **Shape** | Semi-co-op public market with private contracts; no elimination |
| **Screen** | One isometric folding grid. Accepted roads appear as thick numbered stitches, while six large couriers keep the resolution readable. |
| **Controls** | Phones legitimately hold private destination contracts and three road strips. Tap one strip and one player to offer a one-for-one trade; accept or reject, then tap a public seam to commit. |
| **Escalation** | Couriers march six deterministic steps, the board folds, and new contracts cross increasingly awkward seams. Trade and warning windows never get shorter. |
| **When you die** | Nobody dies. Failed couriers ragdoll into the scenery, then return at the depot for the next deal. |
| **Scoring** | Private deliveries score personally; every courier that survives the route adds to a shared bonus, so selfish play has a visible cost. |
| **Length** | Three minutes: four markets and four six-step resolutions |
| **Build cost** | Medium. Deterministic movement is cheap; a ten-person offer UI that never becomes admin is the real work. |
| **Risk** | One loud player running the market or ten simultaneous deals becoming unreadable. Cap everyone at one live offer and mirror each pending trade on the projector. |

This is the strongest new prototype. Grey-box it with a folding paper grid, three road shapes, one-for-one offers and no economy beyond the contracts. The fun hypothesis is whether people make, break and loudly reinterpret deals without needing a host to explain what is happening.

---

## 18. Exquisite Workforce

Everyone draws one body fragment, auctions it into a giant composite worker, then watches the assembled creatures attempt six dignified steps.

| | |
| --- | --- |
| **The moment** | A photocopier torso on lobster legs wins the beauty vote, takes one formal step and folds completely in half. |
| **Shape** | Creative free-for-all with shared spectacle; no elimination |
| **Screen** | Three enormous composite workers dominate the projector. Each fragment keeps its artist's name and seat mark. |
| **Controls** | Draw canvas for one prompted fragment, then three chunky stitch tokens to bid on which worker receives revealed parts. |
| **Escalation** | Later assemblies add stranger prompts and one new visible joint rule, never less drawing or bidding time. |
| **When you die** | Nobody dies. A collapsed worker is the payoff, and every artist immediately joins the next auction. |
| **Scoring** | Fragments score when their worker completes steps, matches visible compatibility icons and wins the simultaneous audience vote. Clever bidding can beat drawing skill. |
| **Length** | Four minutes: draw once, assemble three workers, parade them together |
| **Build cost** | Medium to large. Drawing and compositing are straightforward; making compatibility funny and instantly legible is not. |
| **Risk** | If drawings are merely cosmetic, the auction is fake. Every prompt needs one broad mechanical trait — sturdy, springy, heavy, flexible — visible before bidding. |

Do not beautify the player drawings. The acid-yellow stitching, oxblood inspection stamps and dusty-lilac workbench are a frame for the room's terrible art, not a replacement for it.

---

## 19. The Sixth Thing

Six conveyor bays demand a repeating category chain. Players pitch, trade and bluff slippery words into the right order before the workers test it.

| | |
| --- | --- |
| **The moment** | Someone successfully argues that **bark** is both a sound and a thing, saving beat five as the clock expires. |
| **Shape** | No-reflex social word game with private hands; no elimination |
| **Screen** | Six huge labelled bays fill one horizontal conveyor. Accepted meanings stamp onto cards immediately, so the room never needs a referee. |
| **Controls** | Tap a private word card, choose a bay, offer a one-card trade, then commit one simultaneous vote. |
| **Escalation** | Categories begin concrete, then overlap in curated ways. The market remains 40 seconds; difficulty comes from ambiguity, not faster reading. |
| **When you die** | Nobody dies. A bad link creates a six-worker pile-up, then the whole table plays the next chain. |
| **Scoring** | Shared points for the longest valid chain; personal points when one of your cards creates a valid double meaning or completes the sixth bay. |
| **Length** | Three minutes: three markets and three conveyor reveals |
| **Build cost** | Small to medium. The code is modest; the tightly tagged word deck is the content investment. |
| **Risk** | Category judgments feeling arbitrary or culturally narrow. Use a curated pre-tagged deck, show every accepted meaning and never rely on host adjudication. |

This is the cheapest genuinely new muscle in the batch. The reveal should be absurdly literal: six perfect marching beats, then a full ragdoll catastrophe at the first broken semantic link.

---

## 20. All Hands, No Captain

A six-panel machine is failing. Everyone holds one different piece of the manual, proposes a repair, then the room can fund only two.

| | |
| --- | --- |
| **The moment** | The ignored intern reveals they were the only person whose diagram showed panel four was upside-down. |
| **Shape** | Asymmetric co-op information puzzle; no traitor and no elimination |
| **Screen** | One large cutaway machine with six folding panels. Every proposal enters as a numbered physical patch bearing its player's seat mark. |
| **Controls** | Inspect one private diagram, tap one seam to propose a splice, then allocate two large funding tokens during a simultaneous commit. |
| **Escalation** | Roles rotate and later machines combine more interacting warnings. Discussion time and the six-beat resolution stay constant. |
| **When you die** | Nobody dies. A failed machine falls apart for six comic beats, then returns with everybody in a new role. |
| **Scoring** | Shared score for successful operations; personal credit when your proposal is funded and prevents a failure. Wrong proposals cost no personal points, so speaking up is safe. |
| **Length** | Four minutes: four machines with rotating roles |
| **Build cost** | Medium. Mostly discrete state and authored puzzles, but each role must carry genuinely useful information. |
| **Risk** | Quarterbacking. Every player's proposal enters the final shortlist automatically, and private knowledge must be non-overlapping enough that nobody can solve alone. |

Roles should be concrete and readable: navigator sees the required route, engineer sees unsafe joints, quartermaster sees costs, inspector knows which warning is counterfeit. The projector owns the resolution; phones go face-down once funding locks.

---

## 21. Pulse Junction

Private haptic rhythms tell players how to set six railway switches. The room must compare pulses and spend scarce reroutes before the parade arrives.

| | |
| --- | --- |
| **The moment** | Two players realize they decoded the same long-short pulse differently just as the entire procession turns and collapses. |
| **Shape** | Co-op sensory communication puzzle; no elimination |
| **Screen** | Six oversized junctions on a folding grid. Switch ownership, route previews and the approaching parade remain visible from across the room. |
| **Controls** | Feel or replay one private pulse, tap left or right on an owned switch, and vote to spend one of three shared reroute tokens. |
| **Escalation** | More clues refer to pairs of junctions and safe routes cross folds. Pulse tempo and discussion time never accelerate. |
| **When you die** | Nobody dies. A failed route becomes the slapstick resolution before roles rotate. |
| **Scoring** | One shared route score, plus visible personal credit for correctly decoded switches and clutch reroutes. |
| **Length** | Three minutes: five short routes |
| **Build cost** | Medium. The game logic is small; consistent device haptics and equivalent alternatives need real testing. |
| **Risk** | Haptics varying by handset or excluding players. Offer an equally private long-short visual and optional tone pattern, with no scoring advantage between modes. |

This is the highest-risk experiment here, which is why it should remain mechanically tiny. If comparing secret pulses is not funny with three junctions, adding a railway and art will not rescue it.

---

## 22. Marching Orders

Tiny Bloody War, rebuilt as simultaneous social programming: two armies negotiate six commands, then execute them without intervention.

| | |
| --- | --- |
| **The moment** | “You put **TURN** before **BRACE**!” as two immaculate formations meet and collapse into one enormous heap. |
| **Shape** | Team tactics with public planning and private commits; no elimination |
| **Screen** | One fixed folding battlefield. Each army gets one bright path preview and six giant command glyphs, then the HUD clears for the resolution. |
| **Controls** | Each player owns at least one beat in the team's six-slot strip. Tap advance, turn, brace or strike, then commit before the planning timer ends. |
| **Escalation** | The board folds between stanzas and new terrain changes what familiar commands do. Planning and attack timing remain constant. |
| **When you die** | Destroyed units return as reinforcements for the next stanza, at most six beats later. Nobody loses their command slot. |
| **Scoring** | Team points for surviving units and claimed ground; personal credit appears on the exact beat where your command blocks, hits or rescues. |
| **Length** | Three minutes: four six-beat stanzas |
| **Build cost** | Medium. Much cheaper than four real-time combat classes, but deterministic previews and legible ten-player authorship need care. |
| **Risk** | Ten plans becoming impossible to follow. Keep only four commands, six beats and one player mark on every slot; resolve both armies in lockstep. |

This is the best 10× mutation of an existing idea. It keeps the army spectacle and bloody ragdoll collapse, but replaces expensive twitch balance with a social question: will teammates honour the plan they just shouted? It could begin as a low-cost variant before Tiny Bloody War earns its full action combat.

---

## Mutators worth stealing

- **Joint Venture** mutates One Body, Ten Drivers: players voluntarily splice into two-to-five-person chains. Everyone privately commits a direction; plurality moves the body, ties make it collapse, and larger chains trade strength for coordination.
- **Six Count** mutates Log Runner: partners share one avatar pair, but one phone gets **JUMP** and the other gets **DUCK**. Roles and partners change after every six-obstacle phrase; repeat pairings are blocked so weaker players cannot be frozen out.
- **The Rules Committee** is a meta-mutator for the whole catalogue: the room bargains over one movement rule and one hazard rule, then plays the resulting tuned hybrid for six beats. Ship only a hand-authored 3×3 matrix; unrestricted combinations would become mush.

---

## Build order

**Joust**, **Last Marble** and **Split** are implemented on `main`. Together they cover fixed-arena combat, one-stick physics and camera-driven rules.

**Log Runner** and **Cut & Shut** are the current build wave in isolated worktrees. They add two-button timing, active eliminated players, private information, deterministic resolution and public bargaining.

After that, **The Gun** and **Drag** remain the action concepts with the most replay in them, but both need real tuning time.

**Hill** whenever you want a team game in the rotation. It shares most of its guts with The Gun — top-down movement, shooting, respawns — so it gets much cheaper if you build that one first.

Of the remaining newer ideas, **One Touch** is cheap but lives or dies on whether a 3×3 target pad stays glance-light. **Open Plan** should follow Bomberman so it can reuse the destructible-grid work. **High Stakes** can reuse Joust's proven knock-off lessons, but its throw-and-lean timing still needs a grey-box test before anyone commits to ragdoll polish. **Tiny Bloody War** comes late, after Hill has proved teams, respawns and ten-player combat; build only the soldier-versus-archer slice before committing to four classes.

For the wild-card batch, **Cut & Shut** is now in progress because it adds the catalogue's biggest missing muscle — public bargaining with legitimate private motives. **The Sixth Thing** is the cheapest fallback if trading feels like admin. Test **Marching Orders** before building Tiny Bloody War's real-time classes. Keep **Pulse Junction** as a tiny hardware experiment until the haptic clue survives mixed phones and accessibility alternatives.

Keep the night varied: something twitchy, something co-op, and something with no reflexes at all so the least game-literate person in the room can still win a round.
