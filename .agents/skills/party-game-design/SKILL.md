---
name: party-game-design
description: Design, pressure-test and spec games for a shared-screen party platform — one projector plus up to 10 phones as controllers. Use this whenever the user is brainstorming, evaluating, or writing up game ideas for Sideshow, Jackbox-style games, couch multiplayer, phone-as-controller games, or any "everyone watches one screen and plays on their phone" format. Also use it when they name a specific concept to flesh out ("what about a Bomberman one"), when they ask which of several ideas is best, or when they ask what a game is missing. Do not wait for the words "party game" — if the setup is one shared display plus multiple personal controllers, this applies.
---

# Party game design

Games for one projector and up to ten phones. The output of this skill is a
concept sheet good enough to build from, or an honest critique of one.

## What the hardware fixes

These are not preferences. They come from the platform and they constrain
every design.

- **One shared camera.** Everyone sees the same framing. No split screen, no
  per-player viewport, no fog of war that varies by player.
- **The host runs the simulation.** The phone sends input; the projector
  renders. Round-trip is roughly 40–80ms.
- **Ten players, mixed ages, mixed skill, some drunk, most standing up.**
- **Phones are input devices.** Small, held low, glanced at rarely.
- **Rounds sit inside a longer party** with a running leaderboard, so a game
  is one course of a meal, not the meal.

## The five failure modes

Check every concept against these before going further. Most bad party games
fail on one of them, and the fix is usually structural rather than a tweak.

**1. Dead time.** Last-one-standing with ten players means someone is out
twenty seconds in and holding a dead phone for three minutes. Elimination
isn't banned — unmanaged elimination is. Fix it with one of:
- *Dead players become the hazard.* The knocked-out player controls a rock, a
  ghost, a rolling log. Elimination becomes a promotion.
- *Score by survival time,* not by winning, so the leaderboard still moves for
  the first person out.
- *Short rounds, played repeatedly.* Dying is cheap when the next round is
  fifteen seconds away.

**2. The phone as a second screen.** Anything a player needs mid-action must
be on the projector. A health bar on the handset is a health bar nobody reads.
The phone earns a display role only when the information is *private by
design* — a hidden role, a fragment of a manual, a sealed bid — or when the
player is between rounds and can safely look down.

**3. Difficulty that scales into unfairness.** Speeding a game up eventually
shrinks the reaction window below network latency, and skill stops mattering.
Hold the *warning time* constant and escalate density, variety, combinations
and fakes instead. The screen should get busier, not less fair.

**4. Skill-gap domination.** Free-for-all with mixed ability means one person
wins everything and eight people feel bad. Launder it: teams, co-op against
the game, a shared threat, catch-up mechanics, or scoring that rewards
survival and participation rather than only kills.

**5. Waiting for a turn.** Nine people watching one person think is the
fastest way to lose a room. Go simultaneous: everyone commits inside a timed
window, then the big screen resolves all of it at once as one animated sweep.
The resolution becomes the spectacle and nobody waits.

## The camera problem

Ten players at shared-camera zoom means everyone is small and nobody can find
themselves. Solve it deliberately:

- Distinct silhouette *and* colour per seat; colour alone is not enough on a
  washed-out projector.
- Name tags above characters during play.
- A force that keeps the pack together — a shrinking arena, a chasing threat,
  a scrolling screen, or a fixed single-screen arena that never scrolls at all.

Fixed single-screen arenas (Bomberman, Pac-Man) are the safest shape on this
hardware and the arcade era proved it. Prefer them when unsure.

## Pick controls before inventing them

Every game should compose from a small kit. If a concept needs something
outside this list, that is a real cost and should be called out.

| Control | Good for |
| --- | --- |
| Two buttons | Timing and pattern games. The cheapest thing to build. |
| Dpad | Grid movement. |
| Thumbstick | Free movement, driving, flying. |
| Stick + fire | Shooters. |
| Tap-a-cell grid | Strategy, territory, target selection. |
| Commit-with-timer | Simultaneous turns, bids, votes. |
| Draw canvas | Drawing and gesture games. |
| Text entry | Prompts and guesses. Use sparingly — typing is slow. |

Note also: haptics via vibrate, and the fact that phones lock, so a game
should tolerate a player vanishing for ten seconds.

## Before proposing a concept, answer these

1. What does the person who dies first do for the rest of the round?
2. What is on the phone, and would the game survive if the phone had no screen
   at all?
3. How does it get harder without getting unfair?
4. Can the least game-literate person in the room enjoy it, and can they win?
5. How does the camera keep ten players legible?
6. Which kit controls does it use, and does it need anything new?
7. If inputs combine, how are agreement, conflict, dominance, idle/disconnected players, and visible individual contribution handled?

If any answer is missing, the concept is not ready — say so plainly rather
than writing around the gap.

## Shape the whole night, not just one game

A good rotation covers different muscles. When proposing several games, check
the set includes:

- something with **no reflexes and no elimination** — bidding, drawing,
  voting — so the least twitchy person gets a round they can win
- something **co-op**, where everyone faces the game rather than each other
- something **fast and silly** at 60–90 seconds, for reliably restarting
  a flagging room
- at most one **long-form** game; anything over ten minutes is how the evening
  ends, not part of the rotation

Round lengths: 60–90 seconds for action games played best-of-five; 3–5 minutes
for a single-round game; 8–12 minutes for the closer.

## Concept sheet format

Write up each accepted concept like this. Keep it tight — this is a spec to
build from, not a pitch deck.

```
Name — one line of what it is

The moment          The thing people will shout about. If there isn't one, stop.
Shape               Free-for-all / teams / co-op / asymmetric roles
Screen              What the camera does and how it stays readable
Controls            Which kit pieces, exactly
Shared agency       How combined inputs stay influential, fair and legible
Escalation          How it gets harder, and why that stays fair
Eliminated players  What they do instead of nothing
Scoring             How points map to the party leaderboard
Round length        Target seconds, and how many rounds per turn at the party
Build cost          Relative to a simple two-button game
Risk                The one thing most likely to make it not fun
Fun hypothesis      The riskiest claim a playable test must prove
Onboarding          How a first-time player learns without spoken explanation
Art direction       Palette, shape, type, texture and motion language
Animation           Feedback and transitions that make the core action feel good
Audio               Critical cues, ambience/music role, and muted alternative
Recovery            Late join, disconnect/reconnect and missing-input behavior
Accessibility       Colour independence, reduced motion and touch/readability needs
```

## Critique honestly

When the user brings an idea, lead with the structural problem rather than
enthusiasm. "Elimination will leave six people idle" is more useful than a
list of features. Say which idea in a batch is strongest and which to cut, and
give the reason. If two concepts are the same game with different art, say so
and suggest building one as a variant of the other.

Good ideas usually need one structural change, not ten small ones. Find that
change.

For a playable implementation critique, use all applicable concept questions against observed behavior, then apply `.agents/references/production-quality.md`. Separate structural game problems from UX confusion and production polish. A simulated critique can identify risks; only a real group playtest can confirm that the fun hypothesis holds.
