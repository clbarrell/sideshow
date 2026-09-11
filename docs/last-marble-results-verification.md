# Last Marble result readability

Scope: the uncommitted result/identity changes on top of `403ddb2`.

The heat result now contains only the outcome and next-heat countdown on a solid
background. It lasts eight seconds (previously four). The final winner banner
lasts five seconds (previously 1.8), and the result detail records the match total
without the scoring equation (the shell hides detail at ten players). Tied matches use a bounded headline; names remain
in standings. Player glyphs and stripe/dot/triangle patterns are removed from
marbles, labels, the HUD and phones. Colour, plain names and outlined seat numbers
retain player identity. The phone status validator accepts the longer maximum
wait, and countdown audio stays aligned to the final three seconds.

## Automated evidence

- New/updated host and phone checks failed against the original implementation
  in five relevant cases, then passed after the changes (32 focused tests).
- `npm run verify`: exit 0; 29 room tests, 219 client tests, TypeScript and
  production build passed. The Cloudflare test runtime required local listen
  permissions beyond the default sandbox.
- `git diff --check`: exit 0.
- Independent code/spec review: no unresolved high or medium findings. The
  review caught the long tied-name banner, which was shortened before the final
  build.

## Real surfaces

Production preview: `npx vite preview --host 127.0.0.1 --port 5197 --strictPort`.
`curl -fsS -o /dev/null http://127.0.0.1:5197/`: exit 0.

Evidence directory: `/private/tmp/marble-simplify-evidence/`.

Ten isolated 390×844 Chromium phone contexts joined, readied and launched the
built game. The run exercised live joystick input, phone reload retaining the
same identity, all five heats, final results, and return to the lobby with the
same host route and roster. No browser console or page errors. A repeat cycle
confirmed the same result timing. The first full-match run's QA assertion used
visible text for a detail intentionally hidden by the ten-player compact
standings; the corrected assertion checked its DOM text and the repeat journey
passed through next-game selection.

Observed result pauses were 7.8–8.0 seconds from phone status receipt; final
banners were 4.8 seconds from receipt (host timing is exactly 8 / 5 seconds,
covered by the focused tests). Projector captures were inspected at 1280×720 and
1920×1080. Independent visual review found names and outlined seat numbers
readable for all ten colours, and clear result hierarchy on both projector sizes.

Retained screenshots:

- `marble-players-host.png`: ten plain player identities in live play.
- `marble-player-phone.png`: matching name and seat with no decorative glyph.
- `marble-heat-over-host.png`: winner plus eight-second countdown.
- `marble-match-over-host.png`: final winner banner.

**PASS for the requested readability change.** Requirements, automated checks,
real surfaces, result timing, accessibility/contrast and independent review pass.
Physics, score calculation, connectivity authority, assets and audio mixing are
unchanged and covered by regression tests; a new network-failure campaign,
asset/audio generation, and performance benchmark are not warranted for removing
rendered decoration and lengthening these existing pauses. No new animations or
motion were introduced. Human room play remains the test of subjective pacing,
which this automated run cannot establish.

Test browser contexts and the preview server were closed after verification.
