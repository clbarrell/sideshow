# Party Shell

A projector-and-phones party game platform on Cloudflare. One Durable Object per
room, up to 10 phones, and a game registry designed so the fourth game costs a
weekend instead of a month.

Ships with one game: **Backyard Circuit**, a shared-camera driving race.

## Run it

```bash
npm install
npm run dev
```

Vite prints both a local and a network URL. Open the **network URL** on the
laptop so the room's QR code is reachable by phones on the same Wi-Fi. The one
dev server runs the React client, Worker and local Durable Objects together,
with hot reloads for both client and server code.

```bash
npm run preview       # production-like local build
npm run deploy        # type-check, build and deploy
```

Deploying needs the Workers Paid plan for Durable Objects.

## Deploy it

Run the one-time credential setup:

```bash
./scripts/setup-cloudflare-ci.sh
```

After that, every push to `main` runs the tests and deploys through GitHub
Actions. You can also run **Deploy to Cloudflare** manually from the Actions
tab. Keep `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub Secrets,
not in this repository or its `.env` file.

The first deployment with host keys intentionally ends rooms created by an
older version: those rooms have no credential that can be migrated securely,
so the projector must start a new party once.

## Build a game with Codex

This repository includes an autonomous party-game workflow. From a Codex task in
the saved `sideshow` project, including through ChatGPT mobile **Remote**, send:

```text
Use $engineering-manager to build [your game idea] all the way to PLAYTEST-READY.
Make the design calls yourself unless a genuine human decision is required.
```

The manager invokes the project game-design and verification skills, creates
appropriate image and ElevenLabs audio assets, and iterates through real
projector-and-phone QA. `PLAYTEST-READY` means the build has passed its technical
and production gates; a real group still has to confirm the fun hypothesis before
it can honestly be called `PLAY-READY`.

## How it fits together

```
phone ──ws──┐
phone ──ws──┼──►  Room (Durable Object)  ◄──ws──  projector
phone ──ws──┘     roster · scores · router        simulation · render
```

**The host runs the simulation, not the DO.** The Durable Object is authoritative
for the roster, the party scoreboard and which game is loaded — the things that
must survive a browser refresh. It routes `g` messages and never looks inside
them.

That split is the main design decision:

- the screen that matters has zero input-to-pixel latency
- you get the desktop's GPU for free
- a game module is a normal browser game plus an input adapter
- the DO bill is routing, not a 60fps physics loop

The DO is created wherever the *first* connection comes from, which is why the
host always creates the room before any phone joins.

## The party session

The room code is the party, not the game. `/h/ABCD` stays on the projector and
`/j/ABCD` stays on every phone for the whole night — launching a game never
changes either URL. Inside that one socket the phase cycles:

```
lobby ──launch──► playing ──game ends──► standings ──next game──► lobby
```

- **Standings** is home between games: the running leaderboard is the hero and
  the round that just finished is annotation on it (place, time, points gained).
  A strip along the bottom lists every round played and who won it.
- **`state.history`** keeps a `RoundRecord` per round, so per-game breakdowns
  and end-of-night summaries are already in the data.
- **Reset scores** wipes the leaderboard without disturbing the room — same
  code, same seats, new tournament.
- Everything persists in Durable Object storage, so a laptop refresh or a cold
  DO resumes the party where it left off. If the projector refreshes during a
  round, that round restarts from its original seed. An alarm sweeps rooms idle
  for 12 hours so codes get recycled.

Landing on `/` offers a new party or a resume of a party previously hosted by
that browser. A short room code is a public join locator, while a separate
device-held host key authorizes projector controls and survives refreshes.

## Identity lives on the device

Phones mint a `deviceKey` once and keep it. The DO maps key → player id, so the
same handset reclaims its name and score after a lock screen, a reload, a flat
battery, or a party picked back up the next evening. Names are typed once, ever.
The old seat and colour are restored when still available; otherwise the player
keeps their identity and takes the next free seat.

Seats are reclaimed after an absent player has been gone five minutes. Their
identity is retained separately, and if they return to a full room they wait on
the same screen until a seat becomes available automatically.

## Adding a game

Three files in `src/client/games/<id>/`:

| file | what it does |
| --- | --- |
| `manifest.ts` | name, player range, one line about the controls |
| `host.ts` | exports `createHost(ctx): GameHost` — tick, render, results |
| `controller.tsx` | the phone UI; calls `send(anything)` |

Then one line in `src/client/games/registry.ts`. Host and controller are
dynamically imported, so a new game doesn't grow the shell bundle — the build
output already splits them.

The `GameHost` interface is the whole contract:

```ts
onInput(playerId, d)   // an input frame from a phone, shape is yours
tick(dt)               // advance the sim
render(ctx, w, h)      // draw to the projector canvas
isOver() / results()   // hand places and points back to the shell
```

Pull controls from `src/client/kit/` rather than writing touch handling again.
`Joystick` is there; a button grid, tilt input, a draw canvas and text entry are
the obvious next ones.

## Things already handled

- **Reconnect and resume.** A device key is kept in `localStorage`; a locked
  phone or reloaded tab rejoins the same player id and score. Seats are held for
  five minutes after a drop, then released so a full room doesn't stay full.
  Returning players wait automatically rather than displacing someone.
- **Round recovery.** A phone reload restores the active controller. A
  projector reload restarts the active round from its original seed.
- **Wake lock** on the controller, re-requested when the tab becomes visible.
- **Input coalescing** at 20Hz on the phone, not one message per `pointermove`.
- **Party scoreboard** in `state.totals`, accumulating across rounds, so a night
  is a sequence of games with a running total.
- **Seat colour as the identity system** — the same hue is the lobby pill, the
  car on screen, and the phone's background.

## Known gaps

- No spectator role yet (trivial: a third `role` that only receives state).
- No audio. It belongs on the host only — phones stay silent apart from
  `navigator.vibrate`.
- iOS gyro needs an explicit permission tap, so no game should use tilt as its
  only input.
