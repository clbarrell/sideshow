import "./clarity.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ControllerProps } from "../registry";
import { isCutAndShutFrame, type CutAndShutFrame } from "./protocol";

type PendingTurn = { round: number; seq: number; rotation: number };

const PHASE_ORDER: Record<CutAndShutFrame["phase"], number> = {
  runway: 0,
  fold: 1,
  planning: 2,
  march: 3,
  recap: 4,
  complete: 5,
  spectator: 6,
};

export default function CutAndShutController({ you, send, last, connected = true }: ControllerProps) {
  const [frame, setFrame] = useState<CutAndShutFrame | null>(null);
  const [rotation, setRotation] = useState<number | null>(null);
  const pending = useRef<PendingTurn | null>(null);
  const sequence = useRef(0);
  const previousRound = useRef<number | null>(null);
  const previousPhase = useRef<CutAndShutFrame["phase"] | null>(null);

  useEffect(() => {
    if (!isCutAndShutFrame(last)) return;
    const previousFrame = frame;
    if (previousFrame && (last.round < previousFrame.round
      || (last.round === previousFrame.round && PHASE_ORDER[last.phase] < PHASE_ORDER[previousFrame.phase]))) return;
    const phaseChanged = previousPhase.current !== null && previousPhase.current !== last.phase;
    const roundChanged = previousRound.current !== null && previousRound.current !== last.round;
    const nextRoadRotation = last.road?.rotation ?? null;
    const localPending = pending.current;

    if (phaseChanged || roundChanged) {
      pending.current = null;
      setRotation(nextRoadRotation);
    } else if (!localPending || last.inputSeq >= localPending.seq) {
      pending.current = null;
      setRotation(nextRoadRotation);
    }

    sequence.current = Math.max(sequence.current, last.inputSeq);
    previousRound.current = last.round;
    previousPhase.current = last.phase;
    setFrame(last);
  }, [last]);

  useEffect(() => {
    pending.current = null;
    setRotation(frame?.road?.rotation ?? null);
    if (connected) send({ t: "sync" });
  }, [connected, send]);

  const road = frame?.road ?? null;
  const canTurn = connected && frame?.phase === "planning" && road !== null;
  const shownRotation = rotation ?? road?.rotation ?? 0;
  const safeCouriers = frame?.safeCouriers ?? 0;

  const turnRoad = () => {
    if (!frame || !road || !canTurn) return;
    const distinctRotations = road.shape === "straight" ? 2 : 4;
    const nextRotation = (shownRotation + 1) % distinctRotations;
    const seq = Math.max(sequence.current, frame.inputSeq) + 1;
    sequence.current = seq;
    pending.current = { round: frame.round, seq, rotation: nextRotation };
    setRotation(nextRotation);
    send({ t: "rotate", round: frame.round, seq, rotation: nextRotation });
    try { navigator.vibrate?.(18); } catch { /* Haptics are optional. */ }
  };

  return (
    <main className={`pad cut-phone cut-phase-${frame?.phase ?? "runway"}`} style={{ "--seat": you.color } as CSSProperties}>
      <header className="cut-phone-head">
        <span className="cut-player-colour" style={{ backgroundColor: you.color }} aria-hidden="true" />
        <strong>{you.name}</strong>
        <span className="cut-round">{frame ? `${frame.round}/${frame.rounds}` : "—"}</span>
      </header>

      {!connected ? (
        <PhoneState title="Reconnecting…" detail="Your road will catch up." />
      ) : frame?.phase === "spectator" ? (
        <PhoneState title="Watching this round" detail="You’ll get a road next game." />
      ) : (
        <>
          <section className="cut-phone-copy" aria-live="polite">
            <h1>{phaseTitle(frame?.phase)}</h1>
            <p>{phaseDetail(frame, safeCouriers)}</p>
          </section>

          {road ? (
            <section className="cut-road-control" aria-label={`${you.name}'s road`}>
              <RoadPreview shape={road.shape} rotation={shownRotation} />
              <p>{road.shape === "straight" ? "Straight road" : "Bend road"}</p>
              <button type="button" aria-label="Turn road" disabled={!canTurn} onClick={turnRoad}>
                Turn road
              </button>
            </section>
          ) : (
            <PhoneState title="Look up" detail="Your road is on the projector." compact />
          )}

          {frame?.phase !== "planning" && frame?.phase !== "runway" && frame?.phase !== "fold" && <LookUpMark />}
        </>
      )}
    </main>
  );
}

function phaseTitle(phase: CutAndShutFrame["phase"] | undefined) {
  if (phase === "planning") return "Turn your road";
  if (phase === "march") return "Look up";
  if (phase === "recap") return "Round complete";
  if (phase === "complete") return "Final route";
  if (phase === "fold") return "The city is folding";
  return "Find your road";
}

function phaseDetail(frame: CutAndShutFrame | null, safeCouriers: number) {
  if (!frame) return "Find your name on the projector.";
  if (frame.phase === "planning") return "Turn it, then look up.";
  if (frame.phase === "march") return `${safeCouriers} of 6 couriers are on the road.`;
  if (frame.phase === "recap") return `${frame.survivors} of 6 couriers stayed on the road.`;
  if (frame.phase === "complete") return `${frame.teamScore} team points.`;
  if (frame.phase === "fold") return "The next route is taking shape.";
  return "Find your name on the projector.";
}

function PhoneState({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <section className={`cut-phone-state${compact ? " is-compact" : ""}`} role="status" aria-live="polite">
      <LookUpMark />
      <strong>{title}</strong>
      <p>{detail}</p>
    </section>
  );
}

function LookUpMark() {
  return (
    <svg className="cut-look-up-mark" viewBox="0 0 72 50" aria-hidden="true">
      <path d="M36 46V8M18 25 36 7l18 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="7" />
    </svg>
  );
}

function RoadPreview({ shape, rotation }: { shape: "straight" | "bend"; rotation: number }) {
  const arms = shape === "straight"
    ? [1, 3].map((direction) => (direction + rotation) % 4)
    : [0, 1].map((direction) => (direction + rotation) % 4);
  const points = [[76, 24], [76, 76], [24, 76], [24, 24]] as const;

  return (
    <svg className="cut-road-preview" data-rotation={rotation} viewBox="0 0 100 100" role="img" aria-label={`${shape} road orientation`}>
      <path d="m50 4 46 46-46 46L4 50Z" fill="var(--cut-paper)" stroke="var(--cut-ink)" strokeLinejoin="round" strokeWidth="4" />
      {arms.map((direction) => {
        const [x, y] = points[direction];
        return <path key={direction} d={`M50 50 L${x} ${y}`} fill="none" stroke="var(--cut-ink)" strokeLinecap="round" strokeWidth="17" />;
      })}
      {arms.map((direction) => {
        const [x, y] = points[direction];
        return <path key={`road-${direction}`} d={`M50 50 L${x} ${y}`} fill="none" stroke="var(--seat)" strokeLinecap="round" strokeWidth="9" />;
      })}
      <circle cx="50" cy="50" r="7" fill="var(--seat)" stroke="var(--cut-ink)" strokeWidth="3" />
    </svg>
  );
}
