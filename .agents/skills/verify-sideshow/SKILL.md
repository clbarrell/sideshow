---
name: verify-sideshow
description: Drive Sideshow's real local projector-and-phone surface. Use for reproducible browser QA of a harness or game change, or when another verification workflow needs live lifecycle evidence.
---

# Verify Sideshow

Use the integrated Vite, Worker, and Durable Object app. Read [the journey map](features/user-journeys.md), then exercise every affected journey and only the prerequisite steps needed to reach it.

## Launch

1. From the repository root, run `npm run verify` so the checked production bundle exists in `dist`.
2. Serve that bundle with `npx vite preview --host 127.0.0.1 --port 5173 --strictPort` in a persistent terminal and retain its session ID.
3. If `5173` is occupied, choose one explicit free port and substitute that base URL throughout the run. Stop only a server started by this run.

Launch is complete when the preview process stays running and prints its local URL.

## Doctor

1. Run `curl -fsS -o /dev/null http://127.0.0.1:5173/` (using the chosen port). A zero exit proves the browser entrypoint is reachable.
2. Open the base URL in a browser and require the visible `Sideshow` heading. The create-party drive below proves the Worker and room path.

Doctor is complete when the reachability command exits zero and the start screen renders.

## Drive

- Use one projector tab at `1280×720` and one phone surface near `390×844`; switch the phone to landscape for a game that asks for it.
- Use a distinct browser context or profile for each controller. Controllers in one origin profile share `party.deviceKey` and therefore represent one player.
- Drive by visible role, accessible name, or the stable selectors in the journey map. Keep `/h/CODE` and `/j/CODE` unchanged across phases.
- Prefer one player unless the affected manifest or behavior requires more. Let the real game finish when standings are under test; Backyard Circuit has a 90-second round limit.
- Reload the actual route for reconnect checks. Preserve its local storage so identity, host authority, score, and active-round recovery are genuinely exercised.

Drive is complete when each selected journey's observable result appears on the real host and/or controller surface. Report `INCONCLUSIVE` when a required surface cannot be driven.

## Evidence

Keep the proof bundle deliberately small:

- Record each required command and its exit status.
- Capture one final screenshot for a single-surface claim. For a cross-surface claim, capture at most one host screenshot and one phone screenshot. Add another only when a distinct affected state cannot fit in that proof.
- Name screenshots by journey and surface, store them in a temporary verification directory, and report their absolute paths with the tested revision or concise dirty-state description.
- Use console or network inspection only to diagnose a failure. The handoff evidence contains screenshots and command status, not videos, recordings, traces, logs, or decision journals.

Evidence is complete when every live claim points to the smallest screenshot set that makes it visible.

## Cleanup

Close test tabs and contexts, stop the retained preview-server session, and remove non-evidence scratch files created by the run. Leave the reported screenshot directory available through handoff.

Cleanup is complete when the run's server no longer responds and no test browser context remains open.
