# Borderline verification

Verified 12 September 2026 on branch `codex/borderline-prototype`, based on `eb102281088cca3616b4067a7becd02b19286f0c`.

## Verdict

**VERIFICATION BLOCKED — not PLAYTEST-READY.**

The integrated ten-player prototype has no unresolved high- or medium-severity implementation finding. Its deterministic rules, map invariants, host/controller protocol, lifecycle, production build and independent code/spec review pass. This cloud environment cannot run the mandatory real projector/controller surface or maximum-player performance trace, so PLAYTEST-READY cannot honestly be awarded here. PLAY-READY additionally requires genuine mixed-experience group play.

## Automated evidence

```text
npm run test:client -- test/client/borderline-host.test.tsx test/client/borderline-controller.test.tsx
# 32/32 Borderline tests passed

npm run verify
# room 29/29; client 295/295; TypeScript and both production builds passed

git diff --check
# exit 0
```

The focused tests cover all approved combat examples, insertion-order independence, simultaneous swaps, start-of-turn legality, map/port fairness, zero-land recovery, force reuse/refill, stale/late/duplicate input, owner-only acknowledgements, edit and reconnect sequencing, deadline fallback, tied scoring, seeded host restart, stable controller targets, synchronized teaching, score/finale staging, audio failure safety and ten-name 1920×1080 render assertions.

Independent review found no server/shared-protocol change, architecture migration, private-order broadcast, remote runtime asset, secret-like assignment or broken concept-image reference.

## Real-surface blocker

The standard `verify-sideshow` preview command failed before binding because Node could not enumerate interfaces:

```text
SystemError [ERR_SYSTEM_ERROR]: uv_interface_addresses returned Unknown system error 1
```

Disabling the optional inspector probe in a temporary QA-only configuration allowed Vite to print its URL, but the app remained isolated from other execution contexts; `curl http://127.0.0.1:5173/` returned connection refused. Starting the same integrated Vite/Worker/Durable Object stack inside the shared browser container failed with:

```text
Error: listen EPERM: operation not permitted 127.0.0.1
```

No browser journey, screenshot, audio audition or frame-time pass is claimed. Temporary QA files, processes and browser tabs were cleaned up.

## Required next technical gate

In an environment where Vite and the browser share a bindable network namespace, run:

- lobby → cold launch → teaching → practice → nine turns → standings → next game;
- ten independent controller contexts, including missing input and one disconnect/reconnect;
- host refresh and seeded restart;
- muted and reduced-motion runs;
- minimum supported phone viewport plus 1280×720 and 1920×1080 projector inspection;
- maximum-player p95 frame time, long tasks and repeated-cycle resource growth.

After those pass, a real group must test deliberate Guard usage, force-order variation, landless recovery agency, bargaining attention, collision adaptation, leader contestability, second-order independence, battle explanation and five-minute pacing.
