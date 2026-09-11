import { useCallback, useEffect, useRef, useState } from "react";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted, unlockAudio } from "../../audio";
import { Joystick } from "../../kit/Joystick";
import type { ControllerProps } from "../registry";
import type { SplitInput, SplitPhoneFrame } from "./host";
import { isSplitAudioFrame, SplitSound } from "./sound";

const SEND_HZ = 20;
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function isSplitPhoneFrame(value: unknown): value is SplitPhoneFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<SplitPhoneFrame>;
  return frame.t === "splitState"
    && (frame.role === "survivor" || frame.role === "edge")
    && typeof frame.status === "string";
}

export default function SplitController({ you, send, last }: ControllerProps) {
  const input = useRef<SplitInput>({ x: 0, y: 0 });
  const dirty = useRef(true);
  const sound = useRef<SplitSound | null>(null);
  const [frame, setFrame] = useState<SplitPhoneFrame | null>(null);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof AudioContext === "undefined") return;
    const splitSound = new SplitSound("phone");
    sound.current = splitSound;
    return () => {
      splitSound.destroy();
      sound.current = null;
    };
  }, []);

  useEffect(() => subscribeAudioMuted(setAudioMutedState), []);

  useEffect(() => {
    if (isSplitPhoneFrame(last)) setFrame(last);
    if (!isSplitAudioFrame(last)) return;
    sound.current?.play(last.cue);
    try {
      if (last.cue === "cut" || last.cue === "ko") navigator.vibrate?.([45, 25, 70]);
      else if (last.cue === "push") navigator.vibrate?.(35);
      else if (last.cue === "go") navigator.vibrate?.([20, 25, 20]);
    } catch {
      // Vibration is optional and often unavailable on iOS.
    }
  }, [last]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      send({ ...input.current });
    }, 1000 / SEND_HZ);
    return () => window.clearInterval(timer);
  }, [send]);

  const neutralize = useCallback(() => {
    const wasActive = Math.hypot(input.current.x, input.current.y) > 0;
    input.current = { x: 0, y: 0 };
    dirty.current = false;
    setActive(false);
    if (wasActive) send({ x: 0, y: 0 });
  }, [send]);

  useEffect(() => {
    const onBlur = () => neutralize();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") neutralize();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      neutralize();
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [neutralize]);

  const onStick = useCallback((x: number, y: number) => {
    unlockAudio();
    const wasActive = Math.hypot(input.current.x, input.current.y) > 0.08;
    const isActive = Math.hypot(x, y) > 0.08;
    input.current = { x, y };
    setActive(isActive);
    if (wasActive && !isActive) {
      dirty.current = false;
      send({ x: 0, y: 0 });
    } else {
      dirty.current = true;
    }
  }, [send]);

  const role = frame?.role ?? "survivor";
  const phaseLabel = frame?.phase === "grace"
    ? `Cuts locked · ${Math.ceil(frame.grace)}s`
    : frame?.phase === "cut"
      ? `Cut in ${Math.max(1, Math.ceil(frame.cut ?? 0))}`
      : frame?.phase === "result"
        ? "Heat complete"
        : `${Math.ceil(frame?.remaining ?? 55)}s left`;

  return (
    <div className={`pad split-controller split-role-${role}`} style={{ "--seat": you.color } as React.CSSProperties}>
      <div className="split-rotate" role="status">
        <span aria-hidden="true">↻</span>
        <strong>Turn phone upright</strong>
        <p>Split uses one thumbstick in portrait.</p>
      </div>
      <header className="split-phone-head">
        <div>
          <span className="split-phone-kicker">{role === "survivor" ? "Inside the frame" : "You are the edge · KOs +2"}</span>
          <p className="split-phone-name"><b>{you.seat + 1}</b>{you.name}</p>
        </div>
        <button
          type="button"
          className="split-audio-toggle"
          aria-label={audioMuted ? "Turn sound on" : "Turn sound off"}
          aria-pressed={!audioMuted}
          onClick={() => {
            unlockAudio();
            setAudioMuted(!audioMuted);
          }}
        >
          <span aria-hidden="true">{audioMuted ? "🔇" : "🔊"}</span>
        </button>
      </header>

      <section className={`split-phone-status split-phase-${frame?.phase ?? "grace"}`} aria-live="polite">
        <strong>{phaseLabel} · {frame?.score ?? 0} pts</strong>
        <span>{frame?.status ?? "Move now · cuts unlock after the grace"}</span>
      </section>

      {role === "edge" && (
        <div className="split-compass" aria-label={`Frame target ${frame?.target ?? "E"}`}>
          {DIRECTIONS.map((direction) => (
            <span key={direction} className={frame?.target === direction ? "is-target" : ""}>{direction}</span>
          ))}
          <b>{frame?.queued ? "QUEUED" : frame?.cooldown && frame.cooldown > 0 ? Math.ceil(frame.cooldown) : "READY"}</b>
        </div>
      )}

      <div className={`split-stick-wrap${active ? " is-active" : ""}`}>
        <Joystick
          label={role === "survivor" ? "DRAG TO MOVE" : "AIM · PUSH HARD"}
          onChange={onStick}
        />
      </div>

      <footer className="split-phone-foot">
        {role === "survivor"
          ? "Stay linked · dodge striped rifts · alive +1 / 8s · finish +3"
          : "Choose an edge · release · push hard again"}
      </footer>
    </div>
  );
}
