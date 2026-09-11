# The Gun: thinner landscape header

Tested local changes over `cd34695`, preserving earlier Marble and platform edits.
The unarmed readout is now `HOLD` / `+1/s`, with a non-wrapping value and smaller
landscape readout type. Other header content and input behavior are unchanged.

`npm run verify`: exit 0; 29 room + 221 client tests (250), typecheck and build pass.
`git diff --check`: exit 0. Production preview used
`npx vite preview --host 127.0.0.1 --port 5197 --strictPort`.

Real Chromium phone measurements (CSS pixels):

| Landscape viewport | Header before | Header after | Controls after |
| --- | ---: | ---: | ---: |
| 844×390 | 106.4 | 56 | 316 |
| 667×375 | 89.7 | 56 | 301 |
| 568×320 | 52.3 | 46 | 259 |

Two isolated phone contexts joined/readied/launched the real app. Verified Jump,
Shove, mute, gun pickup, Fire, reload readout, phone reload retaining identity,
portrait rotation prompt, and exit to lobby. Loaded/reloading states retained the
same compact heights; no document overflow or browser page errors. The smallest
sound target remained 48×46px. A maximum-length player name stayed readable.

Evidence: `/private/tmp/gun-header-evidence/unarmed-844.png` and
`/private/tmp/gun-header-evidence/reload-568.png`. Independent source review passes.
No simulation, scoring, networking or audio changes warrant new full-round/load
campaigns. Existing tests cover their unchanged contracts. This is a bounded UI
readability pass; subjective grip/comfort still benefits from physical phones.

Browser contexts and preview process were closed after verification.
Independent final visual review: PASS for compact unarmed and reloading layouts.
