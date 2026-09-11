# Last Marble — 5×5 collapsing floor

The accepted change replaces eight pizza slices with a 500×500 floor of 25 tiles.
The player promise is to read a threatened group, move onto safe floor, and use
its changing edges for deliberate rams. The host owns all floor and collision
state; phones retain the existing thumbstick.

Eight collapse waves retain five-second spacing and three-second warnings. Small
warned groups create changing corners and narrower routes. Surviving tiles must
stay connected by full edges, not merely touch at corners. The final wave ends
the floor at the existing 40-second limit. Five heats, survival/KO/win scoring,
launch preparation, elimination wait and reconnect behavior remain unchanged.

Native cream tiles, dark seams, stationary warning hatch and large countdowns
carry the mechanic without new assets. Tile faces and collision bounds must
agree; seams are markings rather than holes. Existing crack cues sound once per
warning beat, regardless of group size. Muted/reduced-motion play stays readable.

## Acceptance evidence

`npm run verify` passed on grid revision `5c4b2f7`: 29 room tests + 217 client
tests (246 total), TypeScript and production build, exit 0. The final host tests
check every removal prefix across 200 seeds, escape routes through live floor
only, all eight warning windows, exact tile seams/bounds and public countdowns.
`git diff --check` passed. Independent review found no unresolved high/medium
findings and independently reran all 18 host tests.

The generator builds a connected set one tile at a time, then reverses that
order. Every remaining floor is therefore a connected prefix of that construction.
A wave may threaten separate edge tiles; all are marked simultaneously. Before
the final drop, each threatened tile has a route of at most three 100-unit steps across live floor
to safety. This guarantees a geometric route, not freedom from opponent collisions.

Production preview command:
`npx vite preview --host 127.0.0.1 --port 5199 --strictPort`.
`curl -fsS -o /dev/null http://127.0.0.1:5199/` passed (exit 0).
Real Chromium QA on the same revision passed with ten isolated 390×844 touch
controller contexts: join/ready, active post-GO drag/ram, reload retaining Alex,
five natural heats, Party standings, and next-game selection at the same host
route. The warning screenshot shows 25 tiles and “3 TILES DROP IN 3”; the removal
capture shows those three tiles absent, leaving 22 connected tiles. Zero browser
console/page errors. A separate two-controller reduced-motion launch confirmed
the preference on host and phone, displayed the warning and exited normally.

Frame-interval samples: 1280×720, 864 samples, p95 18.1ms; 1920×1080, 710 samples,
p95 18.1ms. Neither sample contained an interval over 50ms. These short local
samples do not establish performance on venue hardware or human game feel.

Evidence directory: `/private/tmp/sideshow-grid-evidence/`, containing
`last-marble-grid-warning-host.png`, `last-marble-grid-warning-phone.png`,
`last-marble-grid-removed-host.png`, and `last-marble-grid-reduced-warning-host.png`.
Browser contexts and the local preview were closed after verification.

**PLAYTEST-READY.** Scope, automated behavior/build, host/controller lifecycle,
warning legibility, reduced-motion feedback, reconnect and independent review
pass. Native geometry requires no new assets; audio, shell/protocol and scoring
remain covered by existing regression checks. Human room dynamics remain the
acceptance boundary below.

## Human playtest questions

Does the changing floor produce useful escape and ramming choices? Can newcomers
read a multi-tile warning without spoken coaching? Do narrowing routes remain
comfortable with mixed skill levels? The existing early-elimination wait and
physical-phone/audio comfort still need a group at the venue.
