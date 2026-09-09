import { type ComponentType, useEffect, useState } from "react";
import { GAMES, type ControllerProps } from "./games/registry";
import { savedName, saveName } from "./identity";
import { leaderboard } from "../shared/protocol";
import { useRoom } from "./useRoom";

/**
 * The phone opens `/j/CODE` once and stays there all night. It never navigates
 * between games — the controller component is swapped in and out underneath a
 * socket that stays open.
 */
export function ControllerApp({ code }: { code: string }) {
  const [name, setName] = useState(savedName);
  const [entered, setEntered] = useState(() => Boolean(savedName()));
  const [Pad, setPad] = useState<ComponentType<ControllerProps> | null>(null);
  const [last, setLast] = useState<unknown>(null);

  const room = useRoom({
    code: entered ? code : "",
    role: "controller",
    name: entered ? name : undefined,
    onGame: (_from, d) => setLast(d),
  });

  const activeRound = room.state?.phase === "playing" ? room.state.activeRound : null;

  // The active-round descriptor comes with a welcome too, so a reload gets
  // the same controls as a phone that saw the original launch broadcast.
  useEffect(() => {
    let cancelled = false;
    setLast(null);
    setPad(null);
    if (!activeRound) return;

    const entry = GAMES[activeRound.gameId];
    if (!entry) return;
    void entry.loadController().then((mod) => {
      if (!cancelled) setPad(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [activeRound?.gameId, activeRound?.seed]);

  // Phones sleep, sockets die, seats get lost. Hold the screen on.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const ask = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        /* unsupported or denied — not fatal */
      }
    };
    void ask();
    const onVis = () => {
      if (document.visibilityState === "visible") void ask();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, []);

  if (room.error) return <Card>{room.error}</Card>;

  if (!entered) {
    const join = () => {
      const trimmed = name.trim();
      if (!trimmed) return;
      saveName(trimmed);
      setName(trimmed);
      setEntered(true);
    };

    return (
      <main className="name-entry">
        <form
          className="name-entry-card"
          onSubmit={(event) => {
            event.preventDefault();
            join();
          }}
        >
          <div className="name-entry-room" aria-label={`Party code ${code}`}>
            <span>Joining party</span>
            <strong>{code}</strong>
          </div>

          <div className="name-entry-copy">
            <h1>Pick your name</h1>
            <p>This is how everyone will spot you on the big screen.</p>
          </div>

          <label className="field name-entry-field">
            <span>Your name</span>
            <input
              value={name}
              maxLength={12}
              autoFocus
              autoComplete="nickname"
              enterKeyHint="done"
              onChange={(event) => setName(event.target.value)}
              placeholder="Nick"
            />
          </label>

          <button
            type="submit"
            className="pad-button name-entry-submit"
            aria-label={`Join party ${code}`}
            disabled={!name.trim()}
          >
            Join the party
          </button>
        </form>
      </main>
    );
  }

  if (room.waiting) {
    return (
      <Card>
        <p>{room.waiting}</p>
        <p>Keep this phone open — your player and score will return automatically.</p>
      </Card>
    );
  }

  if (!room.you || !room.state) return <Card>Connecting…</Card>;

  const { state, you } = room;

  if (state.phase === "playing" && activeRound && Pad) {
    return <Pad key={`${activeRound.gameId}:${activeRound.seed}`} you={you} send={room.sendGame} last={last} />;
  }

  const me = state.players.find((p) => p.id === you.id);
  const mine = leaderboard(state).find((r) => r.player.id === you.id);
  const played = state.history.length;

  return (
    <div className="pad pad-wait" style={{ background: you.color }}>
      <div>
        <p className="pad-party-name">
          <span>{state.partyName || "Party"}</span>
          <span>Code {code}</span>
        </p>
        <p className="pad-name">{you.name}</p>
        <p className="pad-note">
          {state.phase === "standings"
            ? "Round over. Look up."
            : state.phase === "playing"
              ? "Loading controls…"
              : "You're in. Watch the big screen."}
        </p>
      </div>

      {played > 0 && mine && (
        <div className="pad-score">
          <span className="pad-score-place">{ordinal(mine.place)}</span>
          <span className="pad-score-pts">
            {mine.points} {mine.points === 1 ? "point" : "points"}
          </span>
          <span className="pad-score-sub">
            after {played} {played === 1 ? "round" : "rounds"}
          </span>
        </div>
      )}

      <button
        className={`pad-button ready-button${me?.ready ? " is-on" : ""}`}
        aria-pressed={Boolean(me?.ready)}
        onClick={() => room.send({ t: "ready", ready: !me?.ready })}
      >
        <strong>{me?.ready ? "✓ You're ready" : "Ready up"}</strong>
        <span>{me?.ready ? "Tap to change your mind" : "Tell the host you're good to go"}</span>
      </button>
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}
