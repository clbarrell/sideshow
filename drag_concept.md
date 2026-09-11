# Drag — easy entry, strategic depth and mastery

**Prototype implemented; real group playtest pending.**

Choose **Drag** in the lobby with 4–10 players. The implementation is in `src/client/games/drag/`. The design below remains the intent and playtest contract; numerical balance is provisional.

Drag's strongest idea is that players fight over where the game takes place. Its biggest risk is that getting large wins everything at once: more points, more camera control and easier survival. The design should make size valuable to hold **and** valuable to spend.

The rule a newcomer needs: **“Eat to grow. Big blobs pull the screen. Lunge to escape. Stay inside the border.”** No direct combat, equipment, upgrades or extra buttons. Strategic depth should emerge from movement, food and the shared camera.

## Recommended concept

| | |
| --- | --- |
| **The moment** | Two heavy players agree to pull right. One spends their size lunging toward fresh food on the left, abandoning the other just as the room follows. |
| **Shape** | Simultaneous free-for-all for an initial target of 4–10 players, with spoken, unenforced alliances. Smaller groups need a separate test. |
| **Screen** | One scrolling overhead field, fixed zoom initially. Persistent names, distinct silhouettes and seat marks. A sparse world grid makes camera movement visible. |
| **Controls / ergonomics** | Landscape phone: left thumbstick, right large LUNGE button, both under resting thumbs. Lunge follows the stick or the last nonzero direction. Its ready state also appears on the blob. |
| **Shared agency** | Everyone's position contributes to camera pull; size increases that contribution with diminishing returns. Opposing pulls balance. No player becomes the designated camera driver. |
| **Escalation** | Successive food patches create different route choices. Warning times, camera limits and lunge timing stay constant. |
| **Eliminated players** | A two-second pop-and-reform animation, then return near the safe centre. Nobody waits eight seconds. |
| **Scoring** | Bank points continuously for survival plus a diminishing, capped size bonus. Bursting loses grown size and earning time, never banked points. Final score maps to the party standings. |
| **Round length** | One 90-second heat. Another heat is an immediate rematch, with no persistent upgrades. |
| **Build cost** | Medium: modest controls and content, substantial camera, movement and balance tuning. |
| **Risk / fun hypothesis** | Can people deliberately pull, resist and betray through the camera while newcomers still understand why they burst? |

## One action, several reasons to use it

Lunge briefly accelerates you and spends a fraction of your **grown** size, never your minimum body. It has a short cooldown and remains available at minimum size. Holding the button does not repeat it. There is no damage, invulnerability or collectible trail to learn.

That creates four uses of the same familiar button:

- **Escape:** sacrifice earning power to get back inside the border.
- **Invest:** reach food first, hoping to regain more size than you spent.
- **Reposition:** move around the pack to pull from a different direction.
- **Betray:** give up influence at the moment an ally was counting on it.

The cost must be noticeable without making pressing the button feel like a mistake. If optimal play is always saving it for emergencies, the offensive positioning and food opportunities are too weak. If optimal play is pressing whenever ready, its cost or cooldown is too weak.

## Where mastery comes from

| First useful habit | Deeper decision | Counterplay |
| --- | --- | --- |
| Follow food. | Choose a patch that also gives you a useful pulling position. | Take the other patch or occupy the route the pack must cross. |
| Stay near the middle. | Move off-centre early to steer where the middle will be. | Several smaller players move together to resist. |
| Grow large. | Hold size for income and influence, then spend it before poor positioning traps you. | Faster small players contest the next food supply. |
| Lunge when threatened. | Save the cooldown and take a shorter interception route instead of chasing the pack. | Bait an early lunge, then change direction visibly. |
| Follow an ally. | Recognize when their size, position and cooldown make a promise credible. | Change sides before the pull becomes dangerous. |

Mastery is reading several seconds ahead, not hitting tighter input windows. A quieter player must still have useful food and positioning choices without winning a shouted negotiation.

## Make size powerful without making it permanent

Start with bounded growth, diminishing camera influence and diminishing size income. A maximum-size player should pull more than one newcomer, but less than several newcomers acting together. Exact ratios are tuning variables, not proven values.

Large blobs accelerate and turn somewhat worse; small blobs remain responsive. Do not make large-player travel so slow that their own pull prevents them escaping danger. Use the same generous food pickup reach for every size, so growing does not automatically win the next food contest. Players pass through each other: no body-blocking or hidden collision advantage.

Grown size gradually decays, faster at larger sizes. Minimum size never decays. Maintaining a large body therefore requires moving between food patches. Food should appear in at least two separated, reachable choices, previewed before arrival, with neither a permanent central buffet nor a consistently richest side. Keep new patches visible and reachable when previewed; ordinary camera motion can subsequently threaten access.

Survival must remain a meaningful part of scoring. Tune its share so a careful newcomer remains competitive, while collecting food still beats simply hiding in the centre. Do not add kill points: attributing a burst to one person would misrepresent the shared pull and encourage farming weaker players.

These constraints reduce snowballing; they do not establish that it is solved. Equalize starting size each heat and test whether newcomers can occasionally win through a good route or alliance.

## The camera must feel like a rule

The target is the weighted average of living players' world positions. Bound both camera speed and acceleration. Changes in weight from food, lunges, bursts and respawns must never teleport the view. In particular, removing a heavy player must not instantly kill everyone on the opposite side.

Use an inset danger border with an outer visible margin. Crossing the border starts a clear warning timer around your character; crossing it is not instant death. Return a small distance inside to clear the warning, avoiding flicker at the boundary. Burst only after the full warning interval. In the implemented prototype, the warning lasts four seconds and the outer rim retains a blob visibly while it counts down. Continuing outward cannot make your character vanish before the warning ends.

The margin, camera movement and player movement must be tuned together so the blob stays visible and has a practical escape opportunity throughout that interval. Test the worst opposing movement, not just a stationary camera. The implementation bounds camera speed at 70 world units/second, keeps normal movement at 154–226, and provides a 2.5-second lunge cooldown. A stepped corner-escape test includes outward lunge momentum, a short delayed reversal and an opposing pull. Respawn protection cannot substitute for this property.

Show the camera's current pull as one subtle directional marker, alongside the moving world grid. Avoid ten influence arrows or a mathematical explanation. Players should be able to say “they pulled us left” after watching the action.

Keep zoom fixed for the first prototype. Food scarcity does not inherently imply a safe or readable zoom change, and linking zoom to total size could make every burst trigger a squeeze. Later test a separately announced squeeze only if food movement alone fails to create a climax.

## First ten seconds and production direction

Use an 8–10-second launch runway with controls already mounted: find your named blob, try steering and lunging in a harmless practice state, then watch a brief “big blobs pull” demonstration. Reset positions and size before a shared countdown and GO. Begin with nearby food and a brief nonlethal learning period; show edge warnings during it so safety does not hide the rule.

Squashy ink blobs on a pale gridded tabletop make weight, direction and motion readable. Growth swells the silhouette; lunge visibly compresses it before stretching forward. Keep size variation bounded so ten names and bodies fit. The live HUD needs only time and compact standings; score arithmetic belongs after the heat.

Food gets a soft pickup cue, lunges a short whoosh, danger a prioritized warning and bursts a comic pop. Local player cues may use phone audio/haptics where available; all meanings also appear on the projector. Reduced motion removes wobble and trails; avoid camera shake entirely.

On disconnect, clear movement immediately; the blob remains subject to ordinary rules. Reconnect restores control, with no fresh immunity or food bonus. Late joiners enter at the next heat. Respawn at minimum size with zero input in a safe central location and the ordinary lunge cooldown reset, so dying cannot refresh an escape. A briefly visible reform state earns no points or food and contributes no pull until active.

## Smallest useful playtest

Build only movement, food, growth/decay, lunge, camera pull, danger, respawn and scoring. Use simple shapes. Defer shrinking, attacks, power-ups, skins and new modes.

Test a mixed-experience group, then ten players, through real projector-and-phone play. These are proposed acceptance checks, not results:

1. **Entry:** without spoken coaching, newcomers identify themselves, collect food and recover from a warning during their first heat.
2. **Agency:** players can intentionally change the camera's direction and explain who caused a burst. If it feels random, stop and fix camera feedback.
3. **Choices:** observe successful food-seeking, defensive and alliance play. If centre camping or maximum-size hoarding dominates across rematches, change the economy before adding mechanics.
4. **Lunge:** people voluntarily use it both for opportunity and survival. Check that minimum-size lunge spam is not the best scoring route.
5. **Fairness:** test coordinated heavy pulls, sudden heavy-player removal and return from disconnect with representative phone latency. No unseen bursts or unavoidable camera jumps.
6. **Recovery:** a player who bursts early can rejoin meaningful food and camera decisions within a few seconds. Intentional death must not improve their position more reliably than playing on.
7. **Mastery:** on rematch, look for earlier repositioning, saved lunges and deliberate counter-pulls, while checking that newcomers still participate and sometimes place well.

The decisive question is whether the room starts making plans about where to pull each other. If everyone merely chases dots until the camera kills someone, Drag has movement but has not yet earned its strategic premise.

## Implementation handoff

The prototype preserves fixed zoom, two previewed food patches, diminishing growth benefits, a nine-second practice/countdown runway, a 90-second heat and two-second reforming. A separate projector HUD strip protects names and warnings from the shell controls. Phone state and local cues travel in one five-per-second broadcast, including after resync requests.

Seven local ElevenLabs cues accompany native canvas art. Exact prompts and generation metadata are in [the audio provenance](src/client/games/drag/audio/provenance.json); [the cue sheet](src/client/games/drag/audio/CUE_SHEET.md) documents the mix and fallbacks. No music is used.

See [technical verification](docs/drag-verification.md) for the tested state, commands and projector/phone evidence. Group onboarding, alliances, counter-pulls, skill-gap balance and room audio mix remain human playtest questions.
