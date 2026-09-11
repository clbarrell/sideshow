import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import "./host-menu.css";
import { GAMES, GAME_LIST, type GameHost } from "./games/registry";
import { hostToken, rememberHostedParty } from "./identity";
import { leaderboard, MAX_PARTY_NAME_LENGTH, type Player, type RoomState } from "../shared/protocol";
import { useRoom } from "./useRoom";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted, unlockAudio } from "./audio";

export function HostApp({ code }: { code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameHost | null>(null);
  const rafRef = useRef(0);
  const playerIdsRef = useRef(new Set<string>());
  const playerConnectionsRef = useRef(new Map<string, boolean>());
  const [loading, setLoading] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  const gameMenuRef = useRef<HTMLDivElement>(null);
  const gameMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeAudioMuted(setAudioMutedState), []);

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
    const state = roomRef.current.state;
    const players = state?.players ?? [];
    const activeRound = state?.phase === "playing" ? state.activeRound : null;
    const participantIds = activeRound?.gameId === gameId && activeRound.seed === seed
      ? activeRound.participantIds
      : undefined;
    // Old persisted rounds have no snapshot, so retaining the historical
    // all-current-players behavior is the only backward-compatible fallback.
    const participants = participantIds
      ? players.filter((player) => participantIds.includes(player.id))
      : players;
    const latePlayers = participantIds
      ? players.filter((player) => !participantIds.includes(player.id))
      : [];
    const game = createHost({
      players: participants,
      seed,
      width: canvas.width,
      height: canvas.height,
      send: (d, to) => roomRef.current.sendGame(d, to),
    });
    gameRef.current = game;
    // A game decides what a mid-round arrival means. Last Marble keeps these
    // room members as spectators; Backyard Circuit preserves its existing
    // behavior of putting them on the track.
    for (const player of latePlayers) game.onJoin?.(player);
    playerIdsRef.current = new Set(players.map((player) => player.id));
    playerConnectionsRef.current = new Map(players.map((player) => [player.id, player.connected]));
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
        game.destroy?.();
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
    playerConnectionsRef.current = new Map();
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
      playerConnectionsRef.current = new Map();
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
    const previousConnections = playerConnectionsRef.current;
    for (const player of players) {
      if (!previous.has(player.id)) game.onJoin?.(player);
      if (previousConnections.get(player.id) !== player.connected) {
        game.onConnectionChange?.(player.id, player.connected);
      }
    }
    for (const id of previous) {
      if (!next.has(id)) game.onLeave?.(id);
    }
    playerIdsRef.current = next;
    playerConnectionsRef.current = new Map(players.map((player) => [player.id, player.connected]));
  }, [activeRound?.gameId, activeRound?.seed, room.state?.players]);

  const phase = room.state?.phase ?? "lobby";

  const closeJoinCode = useCallback(() => {
    setJoinCodeOpen(false);
    gameMenuButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (phase === "playing") return;
    setGameMenuOpen(false);
    setJoinCodeOpen(false);
    setConfirmingExit(false);
  }, [phase]);

  useEffect(() => {
    if (!gameMenuOpen) return;
    const firstItem = gameMenuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']");
    firstItem?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!gameMenuRef.current?.contains(event.target as Node)) setGameMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setGameMenuOpen(false);
      gameMenuButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [gameMenuOpen]);

  useEffect(() => {
    if (!joinCodeOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeJoinCode();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeJoinCode, joinCodeOpen]);

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
          <div className="host-game-controls">
            <button
              type="button"
              className="sound-toggle is-playing"
              aria-pressed={!audioMuted}
              onClick={() => {
                unlockAudio();
                setAudioMuted(!audioMuted);
              }}
            >
              <span aria-hidden="true">{audioMuted ? "🔇" : "🔊"}</span>
              {audioMuted ? "Sound off" : "Sound on"}
            </button>
            <div className="host-game-menu" ref={gameMenuRef}>
              <button
                ref={gameMenuButtonRef}
                type="button"
                className="host-game-menu-trigger"
                aria-label="Game menu"
                aria-haspopup="menu"
                aria-controls="host-game-menu-list"
                aria-expanded={gameMenuOpen}
                onClick={() => setGameMenuOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>
              {gameMenuOpen && (
                <div id="host-game-menu-list" className="host-game-menu-list" role="menu" aria-label="Game options">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setGameMenuOpen(false);
                      setConfirmingExit(false);
                      setJoinCodeOpen(true);
                    }}
                  >
                    Show join code
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    disabled={!room.connected}
                    onClick={() => {
                      setGameMenuOpen(false);
                      setJoinCodeOpen(false);
                      setConfirmingExit(true);
                    }}
                  >
                    Exit game
                  </button>
                </div>
              )}
            </div>
          </div>
          {joinCodeOpen && <PlayingJoinCode code={code} onClose={closeJoinCode} />}
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
          ) : null}
        </>
      )}
      {phase === "standings" && room.state && <Standings room={room} state={room.state} />}
      {phase === "lobby" && <Lobby room={room} code={code} state={room.state} />}
      {loading && <p className="loading">Loading game…</p>}
    </main>
  );
}

function PlayingJoinCode({ code, onClose }: { code: string; onClose: () => void }) {
  const qr = useRef<HTMLCanvasElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const join = `${window.location.origin}/j/${code}`;

  useEffect(() => {
    if (!qr.current) return;
    void QRCode.toCanvas(qr.current, join, {
      width: 300,
      margin: 1,
      color: { dark: "#0E2226", light: "#F6EFE2" },
    });
  }, [join]);

  return (
    <div className="playing-join-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="playing-join-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="playing-join-title"
        aria-describedby="playing-join-description"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          event.preventDefault();
          closeButton.current?.focus();
        }}
      >
        <button ref={closeButton} type="button" className="playing-join-close" aria-label="Close join code" autoFocus onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <h2 id="playing-join-title">Join the party</h2>
        <p id="playing-join-description">Scan with a phone to join this party.</p>
        <canvas ref={qr} className="playing-join-qr" aria-label={`QR code to join party ${code}`} />
        <div className="playing-join-code" aria-label={`Party code ${code}`}>
          {code.split("").map((character, index) => <span key={`${character}-${index}`}>{character}</span>)}
        </div>
        <p className="playing-join-url">{join.replace(/^https?:\/\//, "")}</p>
      </section>
    </div>
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
  const [partyName, setPartyName] = useState(state?.partyName ?? "");
  const [editingPartyName, setEditingPartyName] = useState(false);
  const [pendingPartyName, setPendingPartyName] = useState<string | null>(null);

  useEffect(() => setPartyName(state?.partyName ?? ""), [state?.partyName]);

  useEffect(() => {
    if (pendingPartyName !== null && state?.partyName === pendingPartyName) {
      setPendingPartyName(null);
      setEditingPartyName(false);
    }
  }, [pendingPartyName, state?.partyName]);

  useEffect(() => {
    if (!room.connected) setPendingPartyName(null);
  }, [room.connected]);

  useEffect(() => {
    if (qr.current) {
      void QRCode.toCanvas(qr.current, join, {
        width: 260,
        margin: 1,
        color: { dark: "#183D33", light: "#FFF8E9" },
      });
    }
  }, [join]);

  const game = picked ? GAMES[picked]?.manifest : null;
  const enough = game ? players.length >= game.minPlayers : false;
  const round = (state?.round ?? 0) + 1;
  const connectedCount = players.filter((player) => player.connected).length;
  const readyCount = players.filter((player) => player.connected && player.ready).length;
  const awayCount = players.length - connectedCount;
  const rankedPlayers = state ? leaderboard(state) : [];

  const savePartyName = () => {
    const next = partyName.replace(/\s+/g, " ").trim().slice(0, MAX_PARTY_NAME_LENGTH);
    setPartyName(next);
    if (next !== (state?.partyName ?? "")) {
      setPendingPartyName(next);
      room.send({ t: "setPartyName", name: next });
    } else if (next) {
      setEditingPartyName(false);
    }
  };

  return (
    <div className="lobby">
      <header className="lobby-brand">
        <a className="lobby-brand__mark" href="/" aria-label="Sideshow home">
          Sideshow <i aria-hidden="true" />
        </a>
        <p>Game night, on the big screen</p>
        <span>{state && state.round > 0 ? `Round ${round}` : "The clubhouse is open"}</span>
      </header>
      <div className="lobby-join">
        {state?.partyName && !editingPartyName ? (
          <div className="party-name-display">
            <span>Party name</span>
            <div>
              <h1>{state.partyName}</h1>
              <button type="button" onClick={() => setEditingPartyName(true)}>Edit</button>
            </div>
          </div>
        ) : (
          <form
            className="party-name-form"
            onSubmit={(event) => {
              event.preventDefault();
              savePartyName();
            }}
          >
            <label htmlFor="party-name">Party name</label>
            <div>
              <input
                id="party-name"
                value={partyName}
                maxLength={MAX_PARTY_NAME_LENGTH}
                placeholder="Brendan's birthday"
                onChange={(event) => setPartyName(event.target.value)}
              />
              <button type="submit" disabled={pendingPartyName !== null}>
                {pendingPartyName !== null ? "Saving…" : "Save"}
              </button>
              {state?.partyName && (
                <button
                  type="button"
                  className="party-name-cancel"
                  disabled={pendingPartyName !== null}
                  onClick={() => {
                    setPartyName(state.partyName);
                    setEditingPartyName(false);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
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
        <div className="seats-block">
          <div className="seats-head">
            <h2>{state && state.history.length > 0 ? "Party leaderboard" : "Players"}</h2>
            {players.length > 0 && (
              <span className="ready-summary" aria-live="polite">
                {readyCount}/{connectedCount} here ready
                {awayCount > 0 && ` · ${awayCount} away`}
              </span>
            )}
          </div>
          <ul className="seats" role="list" aria-label="Players">
            {players.length === 0 && <li className="seats-empty" role="listitem">No one yet. Scan the code.</li>}
            {rankedPlayers.map(({ player: p, points, place }) => {
              const isRanked = Boolean(state?.history.length);
              return (
                <li
                  key={p.id}
                  role="listitem"
                  className={`seat${p.ready && p.connected ? " is-ready" : ""}${p.connected ? "" : " is-away"}`}
                  style={{ background: p.color }}
                >
                  {isRanked && <span className="seat-rank">{place}</span>}
                  <span className="seat-name">{p.name}</span>
                  {isRanked && <b className="seat-points">{points}</b>}
                  {!p.connected ? (
                    <span className="seat-away">Away</span>
                  ) : p.ready ? (
                    <span className="seat-ready" aria-label="Ready">✓</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="game-browser">
          <div className="game-browser-head">
            <h2>Choose a <em>game</em></h2>
            <span>{GAME_LIST.length} {GAME_LIST.length === 1 ? "game" : "games"}</span>
          </div>
          <ul className="game-shelf" aria-label="Games">
            {GAME_LIST.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className={`game${picked === g.id ? " is-picked" : ""}`}
                  aria-pressed={picked === g.id}
                  onClick={() => room.send({ t: "pick", gameId: g.id })}
                >
                  <span className="game-name">{g.name}</span>
                  <span className="game-players">{g.minPlayers}–{g.maxPlayers} players</span>
                </button>
              </li>
            ))}
          </ul>
          <div className={`game-preview${game ? " has-game" : ""}`}>
            {game ? (
              <>
                <div>
                  <h3>{game.name}</h3>
                  <p>{game.tagline}</p>
                </div>
                <p className="game-preview-controls">{game.controls}</p>
              </>
            ) : (
              <p>Pick a game to preview it.</p>
            )}
          </div>
        </div>

        <button
          className="start"
          disabled={!enough}
          onClick={() => {
            unlockAudio();
            room.send({ t: "launch" });
          }}
        >
          <span>{!game
            ? "Pick a game"
            : !enough
              ? `Need ${game.minPlayers} ${game.minPlayers === 1 ? "player" : "players"}`
              : `Start round ${round}`}</span>
          <RoundArrow />
        </button>
      </div>
    </div>
  );
}

function RoundArrow() {
  return (
    <svg className="start-arrow" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M10 24h25" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3.5" />
      <path d="m25 14 10 10-10 10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" />
    </svg>
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
  const leaders = board.filter(({ place }) => place === 1);
  const lastRound = state.history[state.history.length - 1];
  const gained = new Map(lastRound?.results.map((r) => [r.id, r]) ?? []);
  const top = board[0]?.points || 1;

  return (
    <div className="standings">
      <header className="standings-head">
        <div>
          {state.partyName && <span className="standings-party-name">{state.partyName}</span>}
          <h2>Party standings</h2>
          <p>
            After {state.history.length} {state.history.length === 1 ? "round" : "rounds"}
            {lastRound ? ` · just played ${lastRound.gameName}` : ""}
          </p>
        </div>
        {leaders[0] && (
          <div className="leader-callout" style={{ borderColor: leaders.length === 1 ? leaders[0].player.color : "#F6EFE2" }}>
            <span>★ {leaders.length === 1 ? "Current leader" : "Tied leaders"}</span>
            <strong style={{ color: leaders.length === 1 ? leaders[0].player.color : "#F6EFE2" }}>
              {leaders.length === 1 ? leaders[0].player.name : `${leaders.length} players tied`}
            </strong>
            <b>{leaders[0].points} pts{leaders.length > 1 ? " each" : ""}</b>
          </div>
        )}
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
    <section className="round-history" aria-label="Round history">
      <h3>Round history</h3>
      <div className="strip">
        {state.history.map((h) => {
          const winners = h.results.filter((r) => r.place === 1).map((result) => byId.get(result.id)).filter((player): player is Player => Boolean(player));
          return (
            <span key={h.round} className="strip-round">
              <b>R{h.round}</b>
              <span>{h.gameName}</span>
              {winners.length > 0 && (
                <i style={{ color: winners.length === 1 ? winners[0].color : undefined }}>
                  {winners.map((player) => player.name).join(" + ")}
                </i>
              )}
            </span>
          );
        })}
      </div>
    </section>
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
