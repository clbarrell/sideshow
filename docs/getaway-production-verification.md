# Getaway production verification

**Verdict: PLAYTEST-READY / HUMAN PLAYTEST NEEDED.** All objective gates pass; independent review has no unresolved high or medium finding.

This report records the original even-roster production pass. The subsequent [odd-roster verification](getaway-odd-roster-verification.md) extends support to every count from 4–10 and updates the latest full-suite total to 290 tests.

Local candidate verified on 12 September 2026, based on `cd34695` plus the uncommitted Getaway game, catalogue eligibility, host/controller audio controls, generated sound assets, tests and documentation. No deployment or merge is implied.

## Contract and evidence

The accepted loop is two crews collecting bags, protecting loaded teammates, intercepting opponents and banking at their own vans. It keeps one movement stick and one shove button, automatic pickup/banking, no elimination, a fixed symmetric courtyard and a final thirty-second vault closure. The human hypothesis is voluntary escorting.

Native Canvas/CSS crooks, vans, carry stacks and seat markers preserve crisp recolourable silhouettes. The eight locally generated ElevenLabs effects total 96,061 bytes. The cue sheet records the generation direction; no continuous music competes with conversation.

| Gate | Result | Evidence |
|---|---|---|
| Requirements and scope | PASS | Accepted rules, practice, runway, team scoring and supported even rosters implemented; no extra classes or gadgets. |
| Automated behavior and build | PASS | Coordinator and independent reviewer: `npm run verify` exit 0, 29 room + 253 client tests (282 total), production build. Independent `npm run check` and `git diff --check` exit 0. Focused game/audio/eligibility 36 tests, catalogue audio/volume 27, reconnect 17 pass. |
| Real host/controller journey | PASS | Integrated Vite/Worker/Durable Object preview on port 5177; real `/h/PH4F` and `/j/PH4F` routes through a local QA proxy. Full ten-seat launch, practice, play, vault closure, results and next-game cycles. Real pointer input collected five bags, returned around cover, banked five and cleared the phone carry display. Earlier four-seat end-to-end evidence is in the prototype report. |
| Game design | HUMAN PLAYTEST NEEDED | Independent critique finds the rules structurally coherent. Voluntary escorting, haul-size decisions, camping, mixed-skill fairness and final-rush energy require people. |
| UX and onboarding | PASS; human comprehension pending | Fixed collect/shove/bank practice and numbered-player runway render on the projector; phone gives load, protection, bank and closure feedback. Even-player eligibility is tested at the catalogue boundary. |
| Visual direction and assets | PASS | Masked toy crooks, crew shape/colour, individual seat numbers, visible bag stacks, distinct vans and sealed vault markers inspected at actual 1280×720 and 1920×1080. Host sound/volume/exit fit the reserved HUD space. |
| Animation and feedback | PASS | Production code and live runs cover countdown, load pickup, banking, vault shutter and results. The natural finish card was visibly readable; its brief particle burst was not captured live, so that detail relies on independent source review of the corrected ordering and bounded lifetime. Reduced-motion rendering preserves the same rules and timing while suppressing decorative motion. |
| Audio implementation | PASS; room mix pending | All eight MP3s successfully decoded by browser Web Audio. Live source peak three, below the five-voice cap. Missing sample URLs produce immediate oscillator fallback and do not block play. Automated tests cover voice priority, delayed decode, suspended contexts, mute and teardown. Actual loudspeaker/phone mix over conversation requires a group. |
| Accessibility and comfort | PASS; room-distance judgment pending | 844×390 controller fits controls and volume; 390×844 gives clear rotation guidance. Volume zero persists across reload/rotation; mute/unmute and restoring full volume work. Crew shape and seat numbers supplement colour. Reduced-motion preference is applied before game creation. |
| Reconnect and failure recovery | PASS | Real controller reload retains seat, crew, bank and volume. Preview restart/reconnect preserves the party. Deliberately unavailable host audio leaves collection, banking, closure and results functional. Reconnect suite 17/17; room routing suite 29/29. |
| Frame time and cleanup | PASS | Maximum roster measurements on the actual production canvas; no synthetic replacement renderer. |
| Independent review | PASS | Separate author and verifier. No unresolved high/medium or play-blocking finding; final design critique preserves the human questions. |
| Secret handling | PASS | Root checkout `.env` copied exactly at user request, mode 600 and ignored. Presence-only scans find no ElevenLabs key value/name in built client assets and no key value in the diff. Build-time server secrets remain in ignored server output. |

## Performance method

The browser's outer viewport remained 1280×720 despite its viewport capability. A temporary QA page therefore embedded the unchanged real app route at the requested dimensions. The 1920×1080 iframe displayed scaled down, but its actual canvas was 3840×2160 at DPR 2; the 1280×720 canvas was 2560×1440. Phone origins 5181–5190 isolated local storage identities. These are ten browser controllers on one computer, not ten physical devices or a human stress playtest.

A temporary pre-app instrument counted animation-frame intervals, synchronous callback cost, long tasks, live timers, global listeners and started/ended audio sources. It excluded its own reporting timer. Frame intervals represent scheduling plus rendering; callback cost is not a GPU timing measurement. Runs used ten connected seats and selected real pointer actions, not ten simultaneous human action streams.

| Complete cycle | Frames | Frame median / p95 | Callback p95 / max | Long tasks | Live sources peak |
|---|---:|---:|---:|---:|---:|
| 1920×1080 production pass | 10,965 | 16.7 / 17.5 ms | 0.9 / 7.0 ms | 0 | Initial counter invalid; excluded |
| 1920×1080 final build | 11,008 | 16.7 / 17.6 ms | 0.8 / 10.7 ms | 0 | 3 |
| 1280×720 reduced motion, missing audio | 10,966 | 16.7 / 17.6 ms | 0.7 / 5.0 ms | 0 | 3 |
| 1280×720 consecutive normal-motion cycle | 10,951 | 16.7 / 17.5 ms | 0.8 / 1.9 ms | 0 | 3 |

Both 1080p cycles returned to zero animation frames, timeouts, intervals and audio voices after standings, with fourteen global listeners. The final-build source counter wraps both oscillator and buffer-source starts; its predecessor missed subclass overrides and is not used as audio evidence. The QA reduced-motion toggle was changed near the end of the second cycle, but the renderer samples that preference at creation, so that cycle is correctly treated as normal motion.

The two 720p cycles ran consecutively without reloading the projector. Both ended with fourteen global listeners and zero RAFs, timeouts, intervals, audio voices and motion listeners: no measured growth between rounds. The five-bank result awarded +5 to all five Crimson teammates and +0 to the other crew; standings and next-game launch worked.

A separate 844×390 phone sample covered 3,983 frames (about 66 seconds spanning lobby, practice and live play), including 130 real joystick drags. Frame-interval p95 was 17.6 ms, maximum 17.8 ms, with no long tasks. The controller scheduled no app RAF callbacks, so callback rendering cost is N/A, not a claim of zero rendering work. Physical phone performance remains part of the group playtest.

Host and phone error-log queries returned no unexpected runtime errors. Eight deliberately unavailable host sample paths exercised handled audio-load failure; these were injected 404s, not production asset omissions. The fallback game completed normally.

## Evidence and cleanup

Final screenshots: `/tmp/getaway-production-qa/projector-game.png` and `/tmp/getaway-production-qa/controller-landscape.png`. The phone image shows the five-bank state after reconnect; the projector image shows the final production layout in a subsequent short QA round. These are separate observed states, not a synchronized capture.

The final short controller-measurement round was exited through the normal confirmation UI and returned to the lobby without counting. All eleven temporary browser tabs were closed, viewport overrides reset, preview/proxy processes stopped and non-evidence scratch files removed. Only screenshots remain in the temporary evidence directory.

## Human handoff

Use [the group playtest](getaway-playtest.md) with four people, then ten. Do not assign escorts or explain the strategy before the first match. Observe no-spoken comprehension, voluntary help, five-bag dominance, camping, final-thirty-second plans, mixed-skill agency, room-distance readability and audio over shouting.

Run `npm run dev`, open the projector, join an even roster of 4–10 phones and select **Getaway**.
