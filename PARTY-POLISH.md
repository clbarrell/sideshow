# Party polish worklog

Working brief for the September 2026 lobby, standings, and Backyard Circuit pass.

## Player promise

The projector always makes the party, current rank, and next action obvious. During Backyard Circuit, the track owns the screen and the phone behaves like a tactile landscape controller that can steer, accelerate, reverse, and boost at the same time.

## Design decisions

- Readiness is advisory, not a launch gate. Ready players get a compact tick; waiting players keep a clean name pill; disconnected seats say `Away`.
- A host-set party name is durable room state and appears beside the room code on projector and phones.
- The lobby doubles as a scalable game browser: a compact rank-ordered player rail stays visible while games live in a horizontally browsable shelf with a separate selected-game preview.
- Standings celebrate the current leader and the latest point gains, while round history becomes a labelled, evenly spaced footer rail.
- The race HUD becomes one bottom ticker ordered left-to-right by position. Each pill contains only place, colour, and name.
- Backyard Circuit uses held left/right steering plus held forward/reverse buttons and an independent boost button. Portrait explains that the phone should rotate; landscape is the play surface.
- Cars gain an unmistakable nose/windshield and rear brake lights. Identity remains colour-independent through seat numbers and name labels.

## Party-game pressure test

- **First finisher / last finisher:** no elimination; finished cars coast and the race ends after a short grace period.
- **Phone role:** input only during play. All race state remains on the projector.
- **Fair escalation:** density, collisions, boost gates, and comeback cooldowns create pressure without shrinking reaction windows.
- **Skill gap:** trailing racers retain the stronger turbo cooldown advantage.
- **Ten-player camera:** the shared camera frames the pack; labels and seat numbers remain independent of colour.
- **Controls:** two-button steering, two-button throttle, and boost; simultaneous multi-touch is required.
- **Recovery:** released/cancelled pointers return their axis to neutral; disconnect behavior remains owned by the room shell.

## Acceptance checklist

- [x] Party name can be edited by the host, persists through room state, and renders with the code.
- [x] Lobby ready state uses a tick without the redundant word `Ready`; away remains explicit.
- [x] Rank-ordered mini leaderboard and a game shelf/preview leave room for a growing catalogue.
- [x] Standings player names and round-history fields have deliberate spacing at 1280×720 and scale cleanly with the 1920×1080 shell.
- [x] Standings feel celebratory without reducing leaderboard clarity.
- [x] Race leaderboard is a single bottom ticker of position, colour, and name.
- [x] Landscape controller supports steering and throttle held together, plus boost with a second finger.
- [x] Controller makes active/released states obvious and never strands input after cancel/lost capture.
- [x] Ready phone state reads as a completed state and clearly offers an undo action.
- [x] Kart front and rear are obvious at race camera scale.
- [x] Relevant tests, `npm run check`, `npm run test`, and `npm run build` pass.
- [x] Real projector and phone journeys pass with no browser errors.

## Verification targets

- Projector: 1280×720 and 1920×1080, 1/5/10 players, long names, mixed ready/away state.
- Phone: portrait rotate prompt and common landscape sizes with safe areas.
- Performance: 60 fps target; no new per-frame DOM work or unbounded canvas allocations.
- Human gate: confirm with a real group that button steering feels more learnable and that the denser standings celebration lands well in the room.

## Verification record

- Completed a real host/controller lifecycle: join, party naming, ready/undo, game selection, launch, play, timed result, standings, and next-game lobby.
- Checked the projector at 1280×720 with 1 and 10 players and the shell at 1920×1080 with 10 retained players. Checked the phone at 390×844 portrait and 844×390 landscape.
- Ten-player race HUD keeps every ranked pill in one row; dense pills move position/colour above a full-width name line so all ten representative names remain readable at 1280×720.
- Host and phone browser consoles reported no warnings or errors.
- Automated: 32 client tests, 28 room tests, TypeScript check, production build, diff check, and presence-only secret scan pass.
- Disconnect recovery now neutralizes held controls immediately on phone blur/unmount and again at the game seam when the room reports the controller offline.
- Party-game-design verdict: the clearer control mapping, persistent party identity, compact live ranking, and more celebratory standings improve comprehension and room spectacle without changing the race's comeback structure. `HUMAN PLAYTEST NEEDED` remains for steering feel, social energy, and audio mix with an actual group.

## September controller follow-up

- [x] Hold the starting grid for a full ten seconds so game code and phone controls can load before movement begins.
- [x] Show `GET YOUR CONTROLS READY` from 10–4, then `HANDS READY` from 3–1 on the projector.
- [x] Reserve the left phone edge for two tall steering buttons, the centre for identity/instructions, and the right edge for stacked forward, reverse, and boost controls.
- [x] Preserve simultaneous steering, throttle, and boost plus neutralization on every pointer/disconnect path.
- [x] Verify 1280×720 projector timing and the 844×390 landscape controller on the real host/controller journey.
