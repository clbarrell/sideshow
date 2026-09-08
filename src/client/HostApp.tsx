import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { GAMES, GAME_LIST, type GameHost } from "./games/registry";
import { hostToken, rememberHostedParty } from "./identity";
import { leaderboard, type Player, type RoomState } from "../shared/protocol";
import { useRoom } from "./useRoom";

export function HostApp({ code }: { code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameHost | null>(null);
  const rafRef = useRef(0);
  const playerIdsRef = useRef(new Set<string>());
  const [loading, setLoading] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);

  const room = useRoom({
    code,
    role: "host",
    hostToken: hostToken(code) ?? undefined,
    onGame: (from, d) => gameRef.current?.onInput(from, d),
  });

  const roomRef = useRef(room);
  roomRef.current = room;

  // Only a successful authenticated welcome makes this a resumable host. A
  // guessed or mistyped /h/CODE URL must not replace the last real party.
  useEffect(() => {
    if (room.state) rememberHostedParty(code);
  }, [code, room.state]);

  const sessionRef = useRef(0);

  const start = useCallback(async (gameId: string, seed: number, session: number) => {
    const entry = GAMES[gameId];
    if (!entry) return;
    setLoading(true);
    const { createHost } = await entry.loadHost();
    if (session !== sessionRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    fit(canvas);
    const g = canvas.getContext("2d")!;

    gameRef.current?.destroy?.();
    const players = roomRef.current.state?.players ?? [];
    const game = createHost({
      players,
      seed,
      width: canvas.width,
      height: canvas.height,
      send: (d, to) => roomRef.current.sendGame(d, to),
    });
    gameRef.current = game;
    playerIdsRef.current = new Set(players.map((player) => player.id));
    setLoading(false);

    let last = performance.now();
    const loop = (now: number) => {
      if (session !== sessionRef.current || gameRef.current !== game) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      fit(canvas);
      game.tick(dt);
      game.render(g, canvas.width, canvas.height);

      if (game.isOver()) {
        roomRef.current.send({
          t: "roundOver",
          results: game.results(),
          gameName: entry.manifest.name,
        });
        gameRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const activeRound = room.state?.phase === "playing" ? room.state.activeRound : null;

  // Effects run after the playing canvas commits. A welcome can therefore
  // recreate the deterministic round after a projector refresh without racing
  // an absent canvas or a stale loader from the previous round.
  useEffect(() => {
    const session = ++sessionRef.current;
    cancelAnimationFrame(rafRef.current);
    gameRef.current?.destroy?.();
    gameRef.current = null;
    playerIdsRef.current = new Set();
    if (!activeRound) {
      setLoading(false);
      setConfirmingExit(false);
      return;
    }
    void start(activeRound.gameId, activeRound.seed, session);
    return () => {
      if (session !== sessionRef.current) return;
      sessionRef.current += 1;
      cancelAnimationFrame(rafRef.current);
      gameRef.current?.destroy?.();
      gameRef.current = null;
      playerIdsRef.current = new Set();
    };
  }, [activeRound?.gameId, activeRound?.seed, start]);

  // Connection status can flicker during a phone reconnect; only actual seat
  // membership changes alter the running game's roster.
  useEffect(() => {
    const game = gameRef.current;
    const players = room.state?.players;
    if (!activeRound || !game || !players) return;

    const previous = playerIdsRef.current;
    const next = new Set(players.map((player) => player.id));
    for (const player of players) {
      if (!previous.has(player.id)) game.onJoin?.(player);
    }
    for (const id of previous) {
      if (!next.has(id)) game.onLeave?.(id);
    }
    playerIdsRef.current = next;
  }, [activeRound?.gameId, activeRound?.seed, room.state?.players]);

  const phase = room.state?.phase ?? "lobby";

  if (room.error) {
    return (
      <main className="host">
        <div className="card">
          <p>{room.error}</p>
          <button className="pad-button" onClick={() => window.location.assign("/")}>Start a new party</button>
        </div>
      </main>
    );
  }

  return (
    <main className="host">
      {phase === "playing" && (
        <>
          <canvas ref={canvasRef} className="stage" />
          {confirmingExit ? (
            <div className="exit-confirm" role="dialog" aria-labelledby="exit-title" aria-describedby="exit-description">
              <p id="exit-title">Exit this game?</p>
              <span id="exit-description">This round won’t count.</span>
              <div>
                <button autoFocus onClick={() => setConfirmingExit(false)}>Keep playing</button>
                <button
                  className="is-danger"
                  disabled={!room.connected}
                  onClick={() => {
                    setConfirmingExit(false);
                    room.send({ t: "backToLobby" });
                  }}
                >
                  Exit game
                </button>
              </div>
            </div>
          ) : (
            <button className="exit-game" disabled={!room.connected} onClick={() => setConfirmingExit(true)}>
              Exit game
            </button>
          )}
        </>
      )}
      {phase === "standings" && room.state && <Standings room={room} state={room.state} />}
      {phase === "lobby" && <Lobby room={room} code={code} state={room.state} />}
      {loading && <p className="loading">Loading game…</p>}
    </main>
  );
}

/* ---------------- lobby ---------------- */

function Lobby({
  room,
  code,
  state,
}: {
  room: ReturnType<typeof useRoom>;
  code: string;
  state: RoomState | null;
}) {
  const qr = useRef<HTMLCanvasElement>(null);
  const join = `${window.location.origin}/j/${code}`;
  const players = state?.players ?? [];
  const picked = state?.gameId ?? null;

  useEffect(() => {
    if (qr.current) {
      void QRCode.toCanvas(qr.current, join, {
        width: 260,
        margin: 1,
        color: { dark: "#0E2226", light: "#F6EFE2" },
      });
    }
  }, [join]);

  const game = picked ? GAMES[picked]?.manifest : null;
  const enough = game ? players.length >= game.minPlayers : false;
  const round = (state?.round ?? 0) + 1;

  return (
    <div className="lobby">
      <div className="lobby-join">
        <p className="lobby-lede">
          {state && state.round > 0
            ? "Same code all night. Phones stay open."
            : "Everyone open this on their phone"}
        </p>
        <p className="lobby-url">{join.replace(/^https?:\/\//, "")}</p>
        <div className="code">
          {code.split("").map((ch, i) => (
            <span key={i} className="code-tile">
              {ch}
            </span>
          ))}
        </div>
        <canvas ref={qr} className="qr" />
      </div>

      <div className="lobby-right">
        <div className="seats">
          {players.length === 0 && <p className="seats-empty">No one yet. Scan the code.</p>}
          {players.map((p) => (
            <span key={p.id} className={`seat${p.connected ? "" : " is-away"}`} style={{ background: p.color }}>
              {p.name}
              {state && state.round > 0 && <b className="seat-tick">{state.totals[p.id] ?? 0}</b>}
            </span>
          ))}
        </div>

        <div className="picker">
          {GAME_LIST.map((g) => (
            <button
              key={g.id}
              className={`game${picked === g.id ? " is-picked" : ""}`}
              onClick={() => room.send({ t: "pick", gameId: g.id })}
            >
              <span className="game-name">{g.name}</span>
              <span className="game-tag">{g.tagline}</span>
              <span className="game-ctrl">{g.controls}</span>
            </button>
          ))}
        </div>

        <button className="start" disabled={!enough} onClick={() => room.send({ t: "launch" })}>
          {!game
            ? "Pick a game"
            : !enough
              ? `Need ${game.minPlayers} players`
              : `Start round ${round}`}
        </button>
      </div>
    </div>
  );
}

/* ---------------- between rounds ---------------- */

/**
 * The party view. This is home between games, not a per-game results screen:
 * the running leaderboard is the hero and the round that just finished is the
 * annotation on it.
 */
function Standings({ room, state }: { room: ReturnType<typeof useRoom>; state: RoomState }) {
  const board = leaderboard(state);
  const lastRound = state.history[state.history.length - 1];
  const gained = new Map(lastRound?.results.map((r) => [r.id, r]) ?? []);
  const top = board[0]?.points || 1;

  return (
    <div className="standings">
      <header className="standings-head">
        <h2>Party standings</h2>
        <p>
          After {state.history.length} {state.history.length === 1 ? "round" : "rounds"}
          {lastRound ? ` · just played ${lastRound.gameName}` : ""}
        </p>
      </header>

      <ol className="board">
        {board.map(({ player, points, place }) => {
          const r = gained.get(player.id);
          return (
            <li key={player.id} className={place === 1 ? "is-lead" : ""}>
              <span className="place">{place}</span>
              <span className="who" style={{ color: player.color }}>
                {player.name}
              </span>
              <span className="bar">
                <i style={{ width: `${(points / top) * 100}%`, background: player.color }} />
              </span>
              <span className="detail">{r ? `${ordinal(r.place)} · ${r.detail ?? ""}` : "sat out"}</span>
              <span className="gain">{r ? `+${r.score}` : ""}</span>
              <span className="pts">{points}</span>
            </li>
          );
        })}
      </ol>

      <RoundStrip state={state} />

      <div className="standings-actions">
        <button className="start" onClick={() => room.send({ t: "backToLobby" })}>
          Pick the next game
        </button>
        <button className="ghost" onClick={() => room.send({ t: "resetParty" })}>
          Reset scores
        </button>
      </div>
    </div>
  );
}

/** Every round tonight, so people can argue about round two. */
function RoundStrip({ state }: { state: RoomState }) {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  if (state.history.length === 0) return null;
  return (
    <div className="strip">
      {state.history.map((h) => {
        const winner = h.results.find((r) => r.place === 1);
        const p = winner ? byId.get(winner.id) : undefined;
        return (
          <span key={h.round} className="strip-round">
            <b>{h.round}</b> {h.gameName}
            {p && (
              <i style={{ color: p.color }}>
                {" "}
                {p.name}
              </i>
            )}
          </span>
        );
      })}
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fit(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

export type { Player };
