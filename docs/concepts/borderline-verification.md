# Borderline verification

## First-play clarity and narrated tutorial — 18 September 2026

**Implemented and independently reviewed; ready for another user playtest.** Mechanics are unchanged. Player-facing “Force” became **Strength cards**, with available/spent states and matching card silhouettes on the projector. Draft-driven phone instructions lead through mode, province, card and confirmation. **Confirm order** gets a stationary, nonflashing shadow pulse only when valid; reduced motion uses static emphasis. Orders remain explicitly confirmed, and **Confirmed** appears only after host acknowledgment. Editing preserves the last acknowledged order.

Five numbered lessons now last 14/17/15/16/18 seconds (80 total), followed by 25 seconds of practice. The projector and phones follow the host’s shared lesson index and display the spoken instructions as text. Five local commander-style narration MP3s play only on the host; they obey master mute, never overlap, skip too-late loads, tolerate failure, and stop on lesson/phase change or teardown. Scripts, voice settings, durations and hashes are in `borderline-narration-provenance.json`.

Evidence against the 18 September onboarding revision before integration with main:

- `npm run verify` exited 0: **29 room + 314 client tests (343 total)**, type checks and production builds. Independent focused checks passed (51 tests) with no high/medium source findings.
- `node /tmp/borderline-onboarding-qa.cjs` exited 0 against the built preview with ten independent phone contexts. All five authoritative steps appeared at their intended boundaries; each fit 375×667 without overflow.
- All five real narration buffers started in a running audio context, exactly once, in sequence, without overlap. Master mute persisted and reached gain 0. Narration failure, stale/deferred loading and teardown are covered by focused audio tests.
- A fully selected practice draft remained unsubmitted for 5.5 seconds. The highlighted button accepted a normal browser click, acknowledgement displayed Confirmed, edits preserved the old order until confirmation, and a real-round phone reload restored Confirmed.
- Practice lasted 25 seconds. All controls remained at least 48px high, with no phone overflow. Reduced motion changed the ready animation to `none` while preserving the emphasis.
- The first QA pass exposed a moving confirmation hit box; the final pulse animates shadow only. A clipped projector phase label and short-height tutorial alignment were also corrected before the passing rerun.
- Secret-presence checks passed: `.env` remains ignored and the API key is absent from nonignored files and built browser assets. The temporary verification browser was closed and its preview stopped; the user’s development server was left running.

Minimal visual evidence: `/tmp/borderline-onboarding-qa/host-tutorial.png` and `/tmp/borderline-onboarding-qa/phone-ready.png`. The final result summary is `/tmp/borderline-onboarding-qa/results.json`. No full campaign was repeated for this teaching/control-only revision; unchanged scoring/lifecycle retains the earlier campaign evidence and automated regressions. Human comprehension and room voice balance remain questions for the next playtest, not claims established by automation.


## Adaptive player counts — 18 September 2026

Borderline now supports **3–10 players**. The launch roster selects a fixed atlas: 3–4 players use 4×3 (12 provinces), 5–6 use 5×3 (15), 7–8 use 6×3 (18), and 9–10 use 6×4 (24). Phones use the same dimensions. Starting homes and two recovery entries are sampled for the exact count; the original ten-player atlas remains. Disconnects and late arrivals cannot resize the campaign.

- `npm run verify`: exit 0, **29 room + 309 client tests**, type checking and production builds. Subsequent test-only fairness assertions passed the 33-test host suite; no later production change within that adaptive-count check. The onboarding revision above followed.
- Every count 3–10 has tests for map dimensions, reciprocal adjacency, unique perimeter homes, valid adjacent recovery entries, deterministic restart, neutral expansion choices and nearby opponents. Eight- and nine-player starting positions were rotated to reduce the spread in neutral opening choices to one.
- `node /tmp/borderline-adaptive-qa.cjs 3 --full`: exit 0. Three separate phone contexts completed practice, all nine turns, standings and next game at the same room. Two-player launch was blocked. Reload restored the committed order. No runtime errors; 720p p95 frame interval 17.7ms over 16,538 samples.
- Three-player phone at 375×667: exactly 12 targets in four columns, no overflow, all actions at least 48px high. Screenshots: `/tmp/borderline-adaptive-3/host.png` and `/tmp/borderline-adaptive-3/phone.png`.
- Five-player built-app smoke: 15 provinces in a 5×3 grid, real orders/reveal and phone reload passed, no runtime errors or phone overflow; all actions ≥48px. `node /tmp/borderline-adaptive-qa.cjs 5` exited 0.
- Ten-player built-app smoke at 1920×1080: original 24-province 6×4 atlas, real orders/reveal and phone reload passed, no runtime errors or phone overflow; 48px minimum actions. `node /tmp/borderline-adaptive-qa.cjs 10` exited 0; p95 17.7ms over 2,822 frames (short run, not a full campaign).
- Independent source, design and real-screen review: **PASS**, no unresolved high/medium findings for adaptive support. Human balance, negotiation and no-spoken onboarding still need a group playtest.

The prior evidence below describes the original ten-player build. Its old preview-approval blocker does not apply to the successful adaptive three-player run above. A final isolated full ten-player 1080p performance check remains outside this adaptive-count verification; no broader PLAY-READY claim is made.

## Original ten-player build — 12 September 2026

12 September 2026. **Implemented locally; visual acceptance PASS; final integrated recheck pending. HUMAN PLAYTEST NEEDED.**

Base: `e65bdeb89767c5753fd2e1fe6007581447aa3922`, with the uncommitted Borderline module, registry, tests, assets, and ten-player standings CSS fix. Final source/test digest (sorted paths and bytes, including registry/styles): `56952992329e2896484bc4eca4e25f022d3eb4f7e336745e4e604a557dee55a2`.

## Evidence

| Gate | Result and scope |
| --- | --- |
| Rules and implementation | Simultaneous nine-turn campaign; Invade/Guard, stable 24-province grid, force 1/2/3, commit/edit, deterministic collision and fallback rules, landless port recovery, private acknowledgements, practice and shared GO. Independent code/spec review found no remaining high/medium issue. |
| Repository checks | `npm run verify` exited 0: 29 room + 298 client tests and production builds. After the final renderer draw-order adjustment, `npm run build` and `npm run test:client -- test/client/borderline-host.test.tsx test/client/borderline-controller.test.tsx test/client/borderline-sound.test.tsx` exited 0 (35 focused tests). Room/protocol code did not change in that final adjustment. |
| Real game lifecycle | `node /tmp/borderline-browser-qa.cjs --out=/tmp/borderline-qa-final` exited 0. Two full campaigns, ten distinct phone contexts, real clicks, standings, and next game in the same room. No runtime errors. This precedes the last renderer material pass and standings CSS fix. |
| Recovery | Nine-player launch blocked. Phone reload restored the accepted order and visible Committed state. Host reload restarted all ten phones. Closing/reopening one phone after 11 seconds recovered identity and active game. Missing input used the documented fallback. Automated tests cover late spectators and teardown. Network jitter was not separately injected. |
| Phone usability | 375×667 and 390×844: no overflow; every action at least 48px high; numbered targets at least 55.8px wide. Identity uses emblems as well as color. |
| Assets, audio and comfort | `node /tmp/borderline-supplemental.cjs` exited 0. Reduced-motion host had a stable sampled canvas; master mute persisted across reload and kept a real cue at gain 0. Unmute restored gain 1. Blocking both textures and four audio assets still allowed all ten controllers to play and commit. No unexpected errors. All four MP3s decoded; local font loaded. |
| Visual quality | Two independent reviewers accepted the final renderer captures against the concept. Earlier failures drove organic shared boundaries, layered paper coasts, textured ribbons, stamped badges, clear coastal labels, and larger ten-seat footer type/tokens. Final captures are renderer fixtures, not a fresh integrated browser run. |
| Standings | Shared CSS overlap fixed. Exact ten-player Standings DOM using rebuilt production CSS fits 1920×1080 and 1280×720. At 1080p the last row ends at 920.25, history starts 934.25, and actions end 1056.25. At 720p history is intentionally hidden and actions end 704. Independent review passed. |
| Performance | Prior integrated run: 720p p95 18.5ms over 16,370 frames. 1080p initial p95 18.7ms, full-cycle p95 33.7ms while supplemental browser rooms also ran; this does not establish the 20ms target under isolated load. Final renderer fixture p95 0.5ms measures drawing cost only, not integrated frame cadence. Final isolated 1080p check remains pending. Font count stayed at one; source review found bounded caches/audio and teardown. |
| Secret handling | Root `.env` copied byte-for-byte, remains ignored. Presence-only scan found no ElevenLabs key in nonignored repository files or built client output. Asset prompts, licenses, sizes and hashes are recorded alongside this document. |

## Minimal visual handoff

- Final material direction: `/tmp/borderline-atlas-reveal.png` and `/tmp/borderline-material-planning-720.png` (renderer fixtures).
- Actual phone: `/tmp/borderline-qa-final/phone-375.png`.
- Corrected standings: `/tmp/borderline-standings-fix/standings-1920x1080.png`.

The full runtime result summaries remain in `/tmp/borderline-qa-final/results.json` and `/tmp/borderline-supplemental/results.json`. Test browser contexts were closed and the owned preview server was stopped.

## Remaining gates

Automatic approval review timed out on restarting the local preview and its one retry. The sandboxed alternative failed with bind EPERM. Consequently the last integrated visual/performance recheck could not run; no full PLAYTEST-READY claim is made yet. Re-run the built app with ten phones, inspect the final material renderer and standings, and measure isolated 1080p frame cadence.

A mixed-experience ten-person group must still establish no-spoken onboarding, useful Guard decisions, enjoyable collision/landless recovery, manageable leader advantage and kingmaking, and whether negotiation remains focused on the projector. Room audio balance also requires real speakers and people. No automated run demonstrates social fun.

Run locally with `npm run dev`, open the host, join ten phones, and select **Borderline**. At the time of this original 12 September check, nothing had been deployed or merged.
