# Featherweight facing verification

PASS for the requested facing fix, tested 2026-09-12 on local uncommitted
changes above `4206cad`, including the earlier party-polish changes.

Birds now face their horizontal velocity after movement and collisions. An
8 px/s deadzone retains the last direction near rest. Edge respawns face into
the arena. Only the artwork is mirrored; seat badges and names remain readable.
Physics, phone controls, audio, and the game rules are unchanged by this fix.

| Check | Result |
| --- | --- |
| `npm run test:client -- test/client/joust-host.test.tsx` | Exit 0; 15 tests, including left/right/rest and both respawn directions. |
| `npm run verify` | Exit 0; complete room/client suites, TypeScript and production build. |
| `git diff --check` | Exit 0. |
| Production preview on port 5197; `curl -fsS -o /dev/null http://127.0.0.1:5197/` | Exit 0. |
| Real Chromium projector (1280×720), two separate phone contexts (844×390) | Created party, joined, readied, launched Featherweight, used real touch drags in both directions, finished the round, reached standings and returned to next-game lobby. Exit 0; no page errors. |
| Normal movement direction and readable identity | Second brief touch run captured left, retained-left after release, then right without an edge respawn. Canvas transform inspection confirmed mirrored left artwork and positive determinants for both seat digit and name. Exit 0; no page errors. |
| Independent read-only code/spec review | PASS; no high/medium findings. |

Visual evidence:

- [Left-facing bird](/private/tmp/joust-facing-evidence/left-host.png)
- [Right-facing bird](/private/tmp/joust-facing-evidence/right-host.png)
- [Landscape phone controller](/private/tmp/joust-facing-evidence/phone.png)

This is a narrow render/state change. Both movement directions, stationary
retention, collisions in code review, respawn in tests, and the real lifecycle
cover the affected risk. Broader network, asset-failure, audio-mix and repeated
maximum-player load runs were not repeated because those paths are unchanged.
Subjective multiplayer fun and room audio still require human group playtesting;
this verification makes no new claims about them.

Both browser runs closed their contexts. The retained preview process was
stopped; the final reachability command returned exit 7 (connection refused).
Temporary browser scripts were removed; screenshots remain at the linked paths.
Nothing was deployed.
