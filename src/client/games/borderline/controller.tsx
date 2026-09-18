import "./controller.css";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted, unlockAudio } from "../../audio";
import type { ControllerProps } from "../registry";
import { isBorderlineFrame, type BorderlineFrame, type Force, type OrderMode } from "./protocol";
import { BorderlineSound } from "./sound";
import { BORDERLINE_TUTORIAL_STEPS } from "./tutorial";

const PHASE_ORDER: Record<BorderlineFrame["phase"], number> = {
  runway: 0, practice: 1, practiceReveal: 2, countdown: 3, planning: 4, reveal: 5, recap: 6, complete: 7, spectator: 8,
};

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
  const latestFrame = useRef<BorderlineFrame | null>(null);
  const lastCueId = useRef(0);
  const receivedFirstFrame = useRef(false);
  const recovering = useRef(true);
  const connectionEffectRan = useRef(false);
  const sound = useRef<BorderlineSound | null>(null);

  useEffect(() => subscribeAudioMuted(setAudioMutedState), []);
  useEffect(() => () => { sound.current?.destroy(); sound.current = null; }, []);

  useEffect(() => {
    if (!isBorderlineFrame(last)) return;
    const previous = latestFrame.current;
    const seededRestart = Boolean(previous && last.turn === 0 && last.phase === "runway" && previous.phase !== "runway");
    if (previous && !seededRestart && (last.turn < previous.turn || (last.turn === previous.turn && PHASE_ORDER[last.phase] < PHASE_ORDER[previous.phase]))) return;
    const turnChanged = Boolean(previous && previous.turn !== last.turn);
    const openedControls = last.phase === "planning" || last.phase === "practice";
    const justOpened = openedControls && previous?.phase !== last.phase;
    sequence.current = Math.max(sequence.current, last.inputSeq);

    if (seededRestart) {
      lastCueId.current = last.cue?.id ?? 0;
      receivedFirstFrame.current = true;
    } else if (!receivedFirstFrame.current) {
      lastCueId.current = last.cue?.id ?? 0;
      receivedFirstFrame.current = true;
    } else if (last.cue && last.cue.id > lastCueId.current) {
      lastCueId.current = last.cue.id;
      sound.current?.play("commit");
      try { navigator.vibrate?.([18, 30, 18]); } catch { /* Haptics are optional. */ }
    }
    if (seededRestart || turnChanged || justOpened || recovering.current) {
      if (last.committed && !seededRestart) {
        setDraft({ mode: last.committed.mode, target: last.committed.target, force: last.committed.force });
        setEditing(false);
      } else {
        setDraft(EMPTY_DRAFT);
        setEditing(true);
      }
      setPendingSeq(null);
    } else if (pendingSeq !== null && last.inputSeq >= pendingSeq) {
      setPendingSeq(null);
      setEditing(false);
    }
    latestFrame.current = last;
    recovering.current = false;
    setFrame(last);
  }, [last, pendingSeq]);

  useEffect(() => {
    setPendingSeq(null);
    if (connectionEffectRan.current) recovering.current = true;
    else connectionEffectRan.current = true;
    if (connected) send({ t: "sync" });
  }, [connected, send]);

  const controlsOpen = connected && (frame?.phase === "planning" || frame?.phase === "practice");
  const legalTargets = draft.mode === "invade" ? frame?.legalInvades ?? [] : draft.mode === "guard" ? frame?.legalGuards ?? [] : [];
  const canCommit = controlsOpen && editing && pendingSeq === null && draft.mode !== null && draft.target !== null && draft.force !== null
    && legalTargets.includes(draft.target) && Boolean(frame?.availableForces.includes(draft.force));
  const committed = frame?.committed ?? null;
  const shown = !editing && committed ? committed : draft;
  const provinces = useMemo(() => [...(frame?.provinces ?? [])].sort((a, b) => a.id - b.id), [frame?.provinces]);

  const wakeAudio = () => {
    unlockAudio();
    if (!sound.current && typeof AudioContext !== "undefined") {
      try { sound.current = new BorderlineSound("phone"); } catch { /* Optional audio cannot block an order. */ }
    }
  };

  const chooseMode = (mode: OrderMode) => {
    if (!controlsOpen || !editing) return;
    wakeAudio();
    const valid = mode === "invade" ? frame?.legalInvades ?? [] : frame?.legalGuards ?? [];
    setDraft((current) => ({ ...current, mode, target: current.target !== null && valid.includes(current.target) ? current.target : null }));
  };

  const commit = () => {
    if (!frame || !canCommit || draft.mode === null || draft.target === null || draft.force === null) return;
    wakeAudio();
    const seq = Math.max(sequence.current, frame.inputSeq) + 1;
    sequence.current = seq;
    setPendingSeq(seq);
    send({ t: "order", turn: frame.turn, seq, mode: draft.mode, target: draft.target, force: draft.force });
  };

  if (!frame) {
    return <main className="borderline-phone borderline-phone-loading"><strong>Opening the atlas…</strong><span>Find your name on the projector.</span></main>;
  }
  if (frame.phase === "spectator") {
    return <main className="borderline-phone borderline-phone-state"><FactionMark emblem={frame.emblem} /><h1>Campaign in progress</h1><p>You’ll receive a port in the next game.</p></main>;
  }
  if (frame.phase === "runway") {
    const tutorial = BORDERLINE_TUTORIAL_STEPS[frame.tutorialStep];
    const next = BORDERLINE_TUTORIAL_STEPS[frame.tutorialStep + 1];
    return (
      <main className="borderline-phone borderline-phone-state phase-runway" style={{ "--seat": you.color } as CSSProperties}>
        <PhoneHeader name={you.name} faction={frame.factionName} emblem={frame.emblem} muted={audioMuted} onAudio={() => { wakeAudio(); setAudioMuted(!audioMuted); }} />
        <section className="borderline-tutorial" aria-live="polite">
          <span>Step {frame.tutorialStep + 1} of {BORDERLINE_TUTORIAL_STEPS.length}</span>
          <h1>{tutorial.title}</h1>
          <p>{tutorial.narration}</p>
          <strong>{next ? `Next · ${next.title}` : "Next · Try a practice order"}</strong>
        </section>
      </main>
    );
  }
  if (frame.phase === "countdown" || frame.phase === "practiceReveal" || frame.phase === "reveal" || frame.phase === "recap" || frame.phase === "complete") {
    return (
      <main className={`borderline-phone borderline-phone-state phase-${frame.phase}`} style={{ "--seat": you.color } as CSSProperties}>
        <PhoneHeader name={you.name} faction={frame.factionName} emblem={frame.emblem} muted={audioMuted} onAudio={() => { wakeAudio(); setAudioMuted(!audioMuted); }} />
        <div className="borderline-look-up" aria-live="polite">
          <LookUpArrow />
          <h1>{stateTitle(frame)}</h1>
          <p>{frame.message}</p>
          {(frame.phase === "recap" || frame.phase === "complete" || frame.phase === "practiceReveal") && <strong className="borderline-outcome">{frame.outcome}</strong>}
          {(frame.phase === "recap" || frame.phase === "complete") && <span className="borderline-score">{frame.score} points</span>}
        </div>
      </main>
    );
  }

  return (
    <main className="borderline-phone" style={{ "--seat": you.color, "--province-cols": frame.columns, "--province-rows": frame.rows } as CSSProperties}>
      <PhoneHeader name={you.name} faction={frame.factionName} emblem={frame.emblem} muted={audioMuted} onAudio={() => { wakeAudio(); setAudioMuted(!audioMuted); }} />
      <section className="borderline-turnline">
        <div><strong>{frame.phase === "practice" ? "Practice · map resets" : `Turn ${frame.turn} / 9 · ${frame.score} pts`}</strong><span role="status" aria-live="polite">{orderGuidance(draft, editing, pendingSeq, committed)}</span></div>
        <time>{Math.ceil(frame.seconds)}</time>
      </section>

      {!connected && <p className="borderline-offline" role="status">Reconnecting · {committed ? "your confirmed order is safe" : "the fallback below will execute"}</p>}

      <section className="borderline-modes" aria-label="Order type">
        {(["invade", "guard"] as const).map((mode) => (
          <button key={mode} type="button" aria-pressed={shown.mode === mode} disabled={!controlsOpen || !editing} onClick={() => chooseMode(mode)}>
            <ModeIcon mode={mode} /><span>{mode === "invade" ? "Invade" : "Guard"}</span>
          </button>
        ))}
      </section>

      <section className="borderline-targets" aria-label="Province target">
        {provinces.map((item) => {
          const id = item.id;
          const isLegal = legalTargets.includes(id);
          const disabled = !controlsOpen || !editing || !draft.mode || !isLegal;
          return (
            <button
              key={id}
              type="button"
              className={shown.target === id ? "is-selected" : ""}
              aria-label={`Province ${id}, ${item?.ownerName ? `held by ${item.ownerName}` : "neutral"}${isLegal ? ", legal target" : ""}`}
              aria-pressed={shown.target === id}
              disabled={disabled}
              style={{ "--owner": item?.ownerColor ?? "#B8AD98" } as CSSProperties}
              onClick={() => { if (!disabled) { wakeAudio(); setDraft((current) => ({ ...current, target: id })); } }}
            >
              <span className="province-owner" aria-hidden="true">{item?.ownerEmblem ? <FactionMark emblem={item.ownerEmblem} /> : null}</span>
              <strong>{id}</strong>
            </button>
          );
        })}
      </section>

      <section className="borderline-forces" aria-label="Strength cards">
        {([1, 2, 3] as const).map((force) => {
          const available = frame.availableForces.includes(force);
          return (
            <button
              key={force}
              type="button"
              className={`${shown.force === force ? "is-selected" : ""}${available ? "" : " is-spent"}`}
              aria-pressed={shown.force === force}
              disabled={!controlsOpen || !editing || !available}
              aria-label={`Strength card ${force}, ${available ? "available" : "spent"}`}
              onClick={() => { wakeAudio(); setDraft((current) => ({ ...current, force })); }}
            >
              <span>Strength</span><strong>{force}</strong><small>{available ? "Available" : "Spent"}</small>
            </button>
          );
        })}
      </section>

      <section className="borderline-commit">
        <div className="borderline-order-readout" aria-live="polite">
          {shown.mode && shown.target && shown.force ? `${shown.mode.toUpperCase()} ${shown.target} · STRENGTH ${shown.force}` : "CHOOSE MODE · PROVINCE · STRENGTH"}
        </div>
        {!editing && committed ? (
          <div className="borderline-committed"><strong>Confirmed ✓</strong><button type="button" disabled={!controlsOpen} onClick={() => { setDraft({ mode: committed.mode, target: committed.target, force: committed.force }); setEditing(true); }}>Edit</button></div>
        ) : (
          <button className={`borderline-commit-button${canCommit ? " is-ready" : ""}`} type="button" disabled={!canCommit} onClick={commit}>{pendingSeq === null ? (committed ? "Confirm changes" : "Confirm order") : "Waiting for host…"}</button>
        )}
      </section>

      <footer>
        <span>{fallbackCopy(frame.fallback)}</span>
        <strong>{forceCycleCopy(frame.turn)}</strong>
      </footer>
    </main>
  );
}

function PhoneHeader({ name, faction, emblem, muted, onAudio }: { name: string; faction: string; emblem: string; muted: boolean; onAudio: () => void }) {
  return (
    <header className="borderline-phone-head">
      <FactionMark emblem={emblem} />
      <div><strong>{name}</strong><span>{faction}</span></div>
      <button type="button" aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted} onClick={onAudio}><SoundIcon muted={muted} /><span>{muted ? "Off" : "On"}</span></button>
    </header>
  );
}

function stateTitle(frame: BorderlineFrame) {
  if (frame.phase === "countdown") return Math.ceil(frame.seconds) > 0 ? String(Math.ceil(frame.seconds)) : "Go";
  if (frame.phase === "practiceReveal" || frame.phase === "reveal") return "Look up";
  if (frame.phase === "recap") return `Turn ${frame.turn} scored`;
  return "Campaign complete";
}

function fallbackCopy(fallback: BorderlineFrame["fallback"]) {
  return fallback.mode === "pass" ? `No order: pass and spend Strength ${fallback.force}` : `No order: Guard ${fallback.target} with Strength ${fallback.force}`;
}

function forceCycleCopy(turn: number) {
  if (turn < 3) return "Use each Strength card once. All return after turn 3.";
  if (turn < 6) return "Use each Strength card once. All return after turn 6.";
  return "Use each Strength card once in this final cycle.";
}

function orderGuidance(draft: Draft, editing: boolean, pendingSeq: number | null, committed: BorderlineFrame["committed"]) {
  if (pendingSeq !== null) return committed ? "Sending changes · your confirmed order stays safe" : "Sending · wait for Confirmed";
  if (!editing && committed) return "Confirmed · your order is safe";
  if (draft.mode === null) return "1 · Choose Invade or Guard";
  if (draft.target === null) return "2 · Tap a highlighted province";
  if (draft.force === null) return "3 · Choose an available Strength card";
  return committed ? "4 · Review changes, then confirm again" : "4 · Review, then tap Confirm order";
}

function ModeIcon({ mode }: { mode: OrderMode }) {
  return mode === "invade" ? (
    <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 22 22 4m-8 0h8v8M5 13l10 10" /></svg>
  ) : (
    <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 3 23 7v7c0 6-4 9-9 11-5-2-9-5-9-11V7l9-4Z" /></svg>
  );
}

function LookUpArrow() {
  return <svg viewBox="0 0 72 52" aria-hidden="true"><path d="M36 48V8M17 27 36 7l19 20" /></svg>;
}

function SoundIcon({ muted }: { muted: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h4l5-4v12l-5-4H4v-4Z" />{muted ? <path d="m17 9 4 6m0-6-4 6" /> : <path d="M17 9c2 2 2 4 0 6" />}</svg>;
}

function FactionMark({ emblem }: { emblem: string }) {
  if (emblem === "star") return <svg className="faction-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="m16 2 4 9 10 1-8 7 3 10-9-5-9 5 3-10-8-7 10-1 4-9Z" /></svg>;
  if (emblem === "moon") return <svg className="faction-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M25 24A13 13 0 1 1 16 3a11 11 0 0 0 9 21Z" /></svg>;
  if (emblem === "pine") return <svg className="faction-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 12 25H4L16 3Z" /></svg>;
  if (emblem === "crown") return <svg className="faction-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="m3 9 8 6 5-11 5 11 8-6-3 18H6L3 9Z" /></svg>;
  if (emblem === "shield") return <svg className="faction-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 5h22v10c0 7-5 12-11 15C10 27 5 22 5 15V5Z" /></svg>;
  if (emblem === "cross") return <svg className="faction-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M12 3h8v9h9v8h-9v9h-8v-9H3v-4h9V3Z" /></svg>;
  if (emblem === "sun") return <svg className="faction-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="8" /><path d="M16 1v6m0 18v6M1 16h6m18 0h6M5 5l4 4m14 14 4 4M27 5l-4 4M9 23l-4 4" /></svg>;
  if (emblem === "bloom") return <svg className="faction-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="8" r="7" /><circle cx="24" cy="15" r="7" /><circle cx="21" cy="24" r="7" /><circle cx="11" cy="24" r="7" /><circle cx="8" cy="15" r="7" /></svg>;
  if (emblem === "bolt") return <svg className="faction-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M19 2 5 18h10l-2 12 14-18H17l2-10Z" /></svg>;
  return <svg className="faction-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="m16 2 13 14-13 14L3 16 16 2Z" /></svg>;
}
