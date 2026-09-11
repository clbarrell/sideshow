# Backyard Circuit audit fixes

The audit's geometry, silent recharge rejection, missing recovery instructions,
and undisclosed race limit all apply to the retained source. Handling changes
preserve the existing free-for-all, landscape two-thumb controls, three-lap
target, comeback recharge, turbo gates and 90-second maximum.

The driving adjustment adds a short steering settle and bounded sideways
momentum. Road traction regains grip quickly after steering releases; grass
retains a little more slip but still slows the car. This deliberately requires
no drift button or expert timing. The fun hypothesis remains that small slides
and bumper contact make corners more enjoyable without frustrating beginners.

Rubber bumpers have a fixed 44-world-unit contact radius, independently of the
shared camera. Name and seat tags remain screen-sized, connected to the bumper
by a leader line. Side, head-on and exactly coincident contacts use the same
footprint. Steering/speed/slip feed movement; boost impacts retain the existing
additional shove and sound.

Phones receive host readiness, recharge, lap and finish state at 10 Hz in the
existing opaque game frame. The boost button is disabled during setup and
recharge; a sent press does not trigger a success burst. Host-confirmed turbo
events alone trigger burst animation, haptics and sound, including turbo gates.
The projector teaches the gold readiness ring, shows each racer's lap, counts
down remaining race time, and labels the 15-second finish window after a winner.
Final-lap callouts name the racer.

Lost or wrong-way drivers receive an arrow to their outstanding checkpoint and
a visible target ring. Far-off-road rescue returns just before that checkpoint,
facing along the road, without granting progress for a shortcut.

Focused validation: `npm run check` passes. `npm run test:client --
--configLoader runner test/client/kart-host.test.tsx
test/client/kart-controller.test.tsx test/client/kart-physics.test.tsx
test/client/kart-sound.test.tsx` passes 28 tests. Tests include world-sized
rendered contact, coincident/side/head-on separation, 30/60 Hz handling,
release traction, reverse, accepted-only boost feedback, recharge/lap status,
and an actual host-driven reverse/off-road/rescue journey that preserves its
outstanding checkpoint. The runner option avoids Vite writing config caches
through this worktree's external node_modules symlink.

Integrated projector/phone QA and independent review are managed by the main
implementation task. Automated checks do not establish physical thumb reach,
washed-out projector legibility, no-spoken onboarding, or mixed-skill handling
enjoyment; those remain human playtest questions.
