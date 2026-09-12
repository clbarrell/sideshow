import "./controller.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted } from "../../audio";
import type { ControllerProps } from "../registry";
import { isBorderlineFrame, type BorderlineFrame } from "./protocol";
import type { BorderlineOrder, Force, OrderMode } from "./rules";
import { PROVINCES } from "./rules";
import { createBorderlineSound, type BorderlineSound } from "./sound";

interface Draft {
  mode: OrderMode | null;
  target: number | null;
  force: Force | null;
}

const EMPTY_DRAFT: Draft = { mode: null, target: null, force: null };

export default function BorderlineController({ you, send, last, connected = true }: ControllerProps) {
  const [frame, setFrame] = useState<BorderlineFrame | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState(true);
  const [pendingSeq, setPendingSeq] = useState<number | null>(null);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  const sequence = useRef(0);
  const currentSession = useRef<string | null>(null);
  const syncedSession = useRef<string | null>(null);
  const sound = useRef<BorderlineSound | null>(null);

  useEffect(() => {
    const instance = createBorderlineSound("phone");
    if (!instance) return;
    sound.current = instance;
    return () => {
      instance.destroy();
      sound.current = null;
    };
  }, []);

  useEffect(() => subscribeAudioMuted(setAudioMutedState), []);

  useEffect(() => {
    if (connected) send({ t: "sync" });
  }, [connected, send]);

  // A fresh projector announces loading. Re-syncing here also recovers a host
  // refresh while the controller component remains mounted.
  useEffect(() => {
    if (!connected || !isBorderlineFrame(last) || last.phase !== "loading" || syncedSession.current === last.session) return;
    syncedSession.current = last.session;
    send({ t: "sync" });
  }, [connected, last, send]);

  useEffect(() => {
    if (!isBorderlineFrame(last)) return;
    const previous = frame;
    const restarted = currentSession.current !== null && currentSession.current !== last.session;
    const enteringInput = isInputPhase(last.phase) && (!previous || restarted || !isInputPhase(previous.phase) || previous.turn !== last.turn);
    const practiceReset = last.phase === "countdown" && previous?.phase === "practiceReveal";
    sequence.current = restarted ? last.inputSeq : Math.max(sequence.current, last.inputSeq);
    currentSession.current = last.session;
    setFrame(last);

    if (enteringInput || last.phase === "loading" || restarted || practiceReset) {
      setDraft(last.committed ? { ...last.committed } : EMPTY_DRAFT);
      setEditing(last.committed === null);
      setPendingSeq(null);
      return;
    }

    if (pendingSeq !== null && last.inputSeq >= pendingSeq) {
      setPendingSeq(null);
      setDraft(last.committed ? { ...last.committed } : EMPTY_DRAFT);
      setEditing(last.committed === null);
      sound.current?.play("commit");
      try { navigator.vibrate?.(35); } catch { /* Haptics are optional. */ }
    } else if (!editing && pendingSeq === null && last.committed) {
      setDraft({ ...last.committed });
    }
  }, [editing, frame, last, pendingSeq]);

  const style = { "--borderline-seat": you.color } as CSSProperties;
  if (!connected) {
    return (
      <main className="borderline-phone is-disconnected" style={style}>
        <section className="borderline-phone-state" role="status">
          <strong>RECONNECTING…</strong>
          <p>Your last acknowledged order is still safe.</p>
        </section>
      </main>
    );
  }

  if (frame?.phase === "spectator") {
    return (
      <main className="borderline-phone" style={style}>
        <PhoneHeader frame={frame} you={you} audioMuted={audioMuted} onSound={() => setAudioMuted(!audioMuted)} />
        <section className="borderline-phone-state" role="status">
          <strong>CAMPAIGN IN PROGRESS</strong>
          <p>Borderline launches with a fixed ten-player roster. You’re in the next game.</p>
        </section>
      </main>
    );
  }

  const interactive = Boolean(frame && isInputPhase(frame.phase));
  const committed = frame?.committed ?? null;
  const showingControls = !frame || ["loading", "teach", "practice", "countdown", "planning"].includes(frame.phase);
  const selectedSummary = orderSummary(draft);
  const canCommit = Boolean(
    frame
    && interactive
    && editing
    && pendingSeq === null
    && draft.mode
    && draft.target
    && draft.force
    && frame.legal[draft.mode].includes(draft.target)
    && frame.forces.includes(draft.force),
  );

  const chooseMode = (mode: OrderMode) => {
    sound.current?.unlock();
    setDraft((current) => ({
      ...current,
      mode,
      target: current.target && frame?.legal[mode].includes(current.target) ? current.target : null,
    }));
  };

  const commit = () => {
    if (!canCommit || !frame || !draft.mode || !draft.target || !draft.force) return;
    sound.current?.unlock();
    const seq = sequence.current + 1;
    sequence.current = seq;
    setPendingSeq(seq);
    send({ t: "order", turn: frame.turn, seq, mode: draft.mode, target: draft.target, force: draft.force });
  };

  return (
    <main className="borderline-phone" style={style}>
      <PhoneHeader frame={frame} you={you} audioMuted={audioMuted} onSound={() => {
        sound.current?.unlock();
        setAudioMuted(!audioMuted);
      }} />

      {showingControls ? (
        <>
          <section className="borderline-status" aria-live="polite">
            <strong>{phoneTitle(frame)}</strong>
            <span>{frame?.message ?? "Loading the campaign map…"}</span>
          </section>

          <div className="borderline-modes" role="group" aria-label="Order type">
            {(["invade", "guard"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={draft.mode === mode}
                disabled={!interactive || !editing}
                onClick={() => chooseMode(mode)}
              >
                {mode === "invade" ? "INVADE" : "GUARD"}
              </button>
            ))}
          </div>

          <section className="borderline-targets" aria-label="Choose a province">
            {PROVINCES.map((name, index) => {
              const province = index + 1;
              const legal = Boolean(frame && draft.mode && frame.legal[draft.mode].includes(province));
              const owner = frame?.players.find((player) => player.id === frame.provinceOwners[index]);
              const ownership = owner ? `${owner.name} ${owner.emblem}` : "Neutral";
              return (
                <button
                  key={province}
                  type="button"
                  className={draft.target === province ? "is-selected" : ""}
                  aria-label={`Province ${province}, ${name}, ${ownership}${legal ? ", available" : ", unavailable"}`}
                  aria-pressed={draft.target === province}
                  disabled={!interactive || !editing || !draft.mode || !legal}
                  onClick={() => setDraft((current) => ({ ...current, target: province }))}
                >
                  <b>{province}</b>
                  <small style={owner ? { background: owner.color } : undefined}>{owner?.emblem ?? "·"}</small>
                </button>
              );
            })}
          </section>

          <div className="borderline-forces" role="group" aria-label="Choose force">
            {([1, 2, 3] as const).map((force) => {
              const available = frame?.forces.includes(force) ?? false;
              return (
                <button
                  key={force}
                  type="button"
                  className={`${draft.force === force ? "is-selected" : ""}${available ? "" : " is-used"}`}
                  aria-label={`Force ${force}${available ? " available" : " used"}`}
                  aria-pressed={draft.force === force}
                  disabled={!interactive || !editing || !available}
                  onClick={() => setDraft((current) => ({ ...current, force }))}
                >
                  FORCE {force}
                </button>
              );
            })}
          </div>

          <section className="borderline-commit-zone">
            {committed && !editing ? (
              <>
                <strong>✓ COMMITTED</strong>
                <span>{formatOrder(committed)}</span>
                <button type="button" className="borderline-edit" disabled={!interactive} onClick={() => setEditing(true)}>Edit order</button>
              </>
            ) : (
              <>
                <span className="borderline-order-preview">{selectedSummary}</span>
                <button type="button" className="borderline-commit" disabled={!canCommit} onClick={commit}>
                  {pendingSeq === null ? (committed ? "COMMIT EDIT" : "COMMIT ORDER") : "SENDING…"}
                </button>
              </>
            )}
          </section>

          <p className="borderline-token-rule">
            Use each force once. All three return after turn {nextRefillTurn(frame?.turn ?? 1)}.
          </p>
          {frame && interactive && <p className="borderline-fallback">No order: {formatEffectiveOrder(frame.fallback)}</p>}
        </>
      ) : (
        <section className={`borderline-phone-state phase-${frame?.phase ?? "loading"}`} role="status" aria-live="polite">
          <span className="borderline-look" aria-hidden="true">↑</span>
          <strong>{frame?.phase === "recap" ? outcomeTitle(frame.outcome) : frame?.phase === "complete" ? "CAMPAIGN OVER" : "LOOK UP"}</strong>
          <p>{frame?.message ?? "All orders reveal together."}</p>
          {frame?.phase === "recap" && frame.outcome && <p className="borderline-own-outcome">Your order: {outcomeCopy(frame.outcome)}</p>}
        </section>
      )}
    </main>
  );
}

function PhoneHeader({
  frame,
  you,
  audioMuted,
  onSound,
}: {
  frame: BorderlineFrame | null;
  you: ControllerProps["you"];
  audioMuted: boolean;
  onSound: () => void;
}) {
  const me = frame?.players.find((player) => player.id === you.id);
  return (
    <header className="borderline-phone-head">
      <span className="borderline-phone-emblem" aria-hidden="true">{me?.emblem ?? "◆"}</span>
      <div>
        <strong>{you.name}</strong>
        <small>{frame?.turn ? `TURN ${frame.turn}/9` : "PRACTICE"} · {me?.score ?? 0} BANKED</small>
      </div>
      <button type="button" aria-label={audioMuted ? "Turn sound on" : "Turn sound off"} aria-pressed={!audioMuted} onClick={onSound}>
        {audioMuted ? "🔇" : "🔊"}
      </button>
    </header>
  );
}

function isInputPhase(phase: BorderlineFrame["phase"]) {
  return phase === "practice" || phase === "planning";
}

function phoneTitle(frame: BorderlineFrame | null) {
  if (!frame || frame.phase === "loading") return "MAP LOADING";
  if (frame.phase === "teach") return "LEARN THE BORDER";
  if (frame.phase === "practice") return `PRACTICE · ${Math.ceil(frame.seconds)}s`;
  if (frame.phase === "countdown") return `REAL CAMPAIGN IN ${Math.max(1, Math.ceil(frame.seconds))}`;
  if (frame.phase === "planning") return `SECRET ORDER · ${Math.ceil(frame.seconds)}s`;
  return "LOOK UP";
}

function orderSummary(draft: Draft) {
  if (!draft.mode || !draft.target || !draft.force) return "MODE · PROVINCE · FORCE";
  return `${draft.mode.toUpperCase()} ${draft.target} · FORCE ${draft.force}`;
}

function formatOrder(order: BorderlineOrder) {
  return `${order.mode.toUpperCase()} ${order.target} · FORCE ${order.force}`;
}

function formatEffectiveOrder(order: BorderlineFrame["fallback"]) {
  return order.mode === "pass" ? `spend FORCE ${order.force} and pass (you own no land)` : `${formatOrder(order)} (lowest owned province)`;
}

function nextRefillTurn(turn: number) {
  if (turn <= 3) return 3;
  if (turn <= 6) return 6;
  return 9;
}

function outcomeTitle(outcome?: BorderlineFrame["outcome"]) {
  if (outcome === "captured") return "BORDER TAKEN";
  if (outcome === "held" || outcome === "quiet") return "BORDER HELD";
  if (outcome === "lost") return "BORDER LOST";
  if (outcome === "tied") return "TOP FORCE TIED";
  if (outcome === "passed") return "NO LAND · FORCE SPENT";
  return "ORDER BLOCKED";
}

function outcomeCopy(outcome: NonNullable<BorderlineFrame["outcome"]>) {
  const copy: Record<typeof outcome, string> = {
    captured: "captured its target",
    held: "held the guarded province",
    lost: "the guarded province fell",
    quiet: "guarded a quiet border",
    tied: "tied for strongest; the flag stayed",
    defended: "did not beat the defense",
    outmatched: "was beaten by a stronger invasion",
    passed: "spent its force without invading",
  };
  return copy[outcome];
}
