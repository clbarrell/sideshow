# The Gun: reachable entry platforms

Tested local changes over `cd34695`, alongside the existing Marble edits.

Both side platforms move from y=600 to y=640, lowering them 40 world units.
The floor-to-side rise drops from 170 to 130; the side-to-centre rise is also
130. Both fit the existing approximately 136-unit normal jump. Side supply
markers move down by the same 40 units. Jump physics and controls are unchanged.

Regression tests use normal jump/movement input and simulation steps to prove
floor-to-side landings on both sides and the side-to-centre gap crossing.
The old 170-unit entry rise cannot pass the floor-to-side assertions.

Production preview command:
`npx vite preview --host 127.0.0.1 --port 5197 --strictPort`.
`curl -fsS -o /dev/null http://127.0.0.1:5197/` passed.
Two isolated 844×390 phone contexts joined, readied and launched from the lobby.
Actual joystick movement and Jump taps landed both fighters on their respective
side platforms (fighter centre y=608). The 1280×720 host used reduced motion.
Exit returned to the lobby; no browser page errors occurred.

Evidence: `/private/tmp/gun-platform-evidence/first-platforms-host.png` and
`/private/tmp/gun-platform-evidence/jump-controller-phone.png`.

Scope excludes unrelated full-round scoring, audio, network failure and load
campaigns: the change only moves existing mirrored geometry and matching supply
positions. Existing regression checks cover those unchanged systems. Subjective
room pacing and fighting balance still require human play, beyond this jump fix.

Final `npm run verify`: exit 0, 29 room tests + 221 client tests (250 total),
TypeScript and production build passed. `git diff --check`: exit 0.
Independent code and visual review: PASS WITH NOTES, no blocking findings.
Centre traversal is tested from the left; the right-hand route is structurally
mirrored. Browser contexts and preview server were closed after verification.
