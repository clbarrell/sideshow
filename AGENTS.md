# Sideshow working agreement

Sideshow is a shared-screen party platform: one projector hosts the simulation and up to ten phones act as controllers. A change is finished when it works through the real host/controller journey and feels ready to play at a party, not when it merely compiles.

- For an end-to-end game or harness build, use `$engineering-manager` and continue until its `PLAY-READY` gate passes or a genuine human decision is required.
- For game concepts and mechanic changes, use `$party-game-design` before implementation and again after playable QA.
- For release claims, use `$party-game-verification`; record commands and real-surface evidence.
- Generate raster concept art and game assets with `$imagegen` when appropriate. Generate committed, build-time audio with `$sound-effects` and `$music`; keep `ELEVENLABS_API_KEY` server/local only.
- Read `.agents/references/production-quality.md` for any player-visible or player-audible work.
- Preserve the architecture in `README.md`: the host owns simulation/rendering, the Durable Object owns durable party state and routing, and game payloads remain opaque to the shell.
- Prefer existing controls and dependencies. Add the smallest public-seam test that proves changed behavior, then run `npm run check` and `npm run build` plus relevant real-browser QA.
