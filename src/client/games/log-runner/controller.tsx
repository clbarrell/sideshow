import { useEffect, useRef, useState } from "react";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted, unlockAudio } from "../../audio";
import type { ControllerProps } from "../registry";
import { isLogRunnerStatusFrame, type LogRunnerStatusFrame } from "./protocol";
import { isLogRunnerAudioFrame, LogRunnerSound } from "./sound";

export default function LogRunnerController({ you, send, last, connected = true }: ControllerProps) {
  const [frame, setFrame] = useState<LogRunnerStatusFrame | null>(null);
  const [ducking, setDucking] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [throwing, setThrowing] = useState(false);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  // A wall-clock prefix survives a full phone reload while remaining a safe
  // integer. The host can therefore keep strict replay protection without
  // swallowing the first actions from a reconnected controller.
  const actionSequence = useRef(Math.floor(Date.now() * 1000));
  const feedbackTimers = useRef<number[]>([]);
  const sound = useRef<LogRunnerSound | null>(null);

  useEffect(() => {
    if (typeof AudioContext === "undefined") return;
    const next = new LogRunnerSound("phone");
    sound.current = next;
    return () => {
      next.destroy();
      sound.current = null;
    };
  }, []);

  useEffect(() => subscribeAudioMuted(setAudioMutedState), []);

  useEffect(() => {
    if (isLogRunnerStatusFrame(last)) setFrame(last);
    if (!isLogRunnerAudioFrame(last)) return;
    sound.current?.play(last.cue);
    try {
      if (last.cue === "splash") navigator.vibrate?.([55, 30, 90]);
      else if (last.cue === "go") navigator.vibrate?.([18, 22, 18]);
      else if (last.cue === "throw") navigator.vibrate?.(38);
    } catch { /* vibration is optional */ }
  }, [last]);

  useEffect(() => {
    if (connected) send({ t: "sync" });
  }, [connected, send]);

  useEffect(() => {
    return () => {
      feedbackTimers.current.forEach((timer) => window.clearTimeout(timer));
      feedbackTimers.current = [];
    };
  }, []);

  const pulse = (setter: (value: boolean) => void) => {
    setter(true);
    const timer = window.setTimeout(() => {
      setter(false);
      feedbackTimers.current = feedbackTimers.current.filter((candidate) => candidate !== timer);
    }, 160);
    feedbackTimers.current.push(timer);
  };

  const jump = () => {
    if (!connected || frame?.interactive === false) return;
    unlockAudio();
    sound.current?.play("jump");
    send({ jump: ++actionSequence.current });
    pulse(setJumping);
    try { navigator.vibrate?.(28); } catch { /* optional */ }
  };

  const duck = () => {
    if (!connected || frame?.interactive === false) return;
    unlockAudio();
    sound.current?.play("duck");
    send({ duck: ++actionSequence.current });
    pulse(setDucking);
    try { navigator.vibrate?.(20); } catch { /* optional */ }
  };

  const throwBranch = () => {
    if (!connected || frame?.interactive === false || (frame?.cooldown ?? 0) > 0 || frame?.queued) return;
    unlockAudio();
    sound.current?.play("throw");
    send({ branch: ++actionSequence.current });
    pulse(setThrowing);
    try { navigator.vibrate?.([22, 18, 35]); } catch { /* optional */ }
  };

  const role = frame?.role ?? "runner";
  const phase = frame?.phase ?? "runway";
  const status = frame?.status ?? "Find your number · LOW jumps · HIGH ducks";
  const controlsDisabled = !connected || frame?.interactive === false;

  return (
    <main
      className={`pad log-runner-controller log-runner-role-${role}`}
      style={{ "--seat": you.color } as React.CSSProperties}
      data-seat={you.seat + 1}
      data-pattern={you.seat % 10}
    >
      <div className="log-runner-rotate" role="status">
        <span aria-hidden="true">↻</span>
        <strong>Turn sideways to run</strong>
        <p>One action under each thumb.</p>
      </div>

      {!connected ? (
        <section className="log-runner-reconnecting" role="status" aria-live="polite">
          <span aria-hidden="true">{you.seat + 1}</span>
          <strong>Reconnecting…</strong>
          <p>Your place on the river is being held.</p>
        </section>
      ) : (
        <div className="log-runner-phone">
          <header className="log-runner-phone-head">
            <div className="log-runner-phone-id">
              <b>{you.seat + 1}</b>
              <div><span>{role === "runner" ? "On the log" : "On the bank"}</span><strong>{you.name}</strong></div>
            </div>
            <div className="log-runner-phone-state">
              <strong>{phase === "live" ? `${Math.ceil(frame?.remaining ?? 90)}s` : phase === "runway" ? "GET READY" : "HEAT COMPLETE"}</strong>
              <span aria-live="polite">{status}</span>
            </div>
            <button
              type="button"
              className="log-runner-sound"
              aria-label={audioMuted ? "Turn sound on" : "Turn sound off"}
              aria-pressed={!audioMuted}
              onClick={() => {
                unlockAudio();
                setAudioMuted(!audioMuted);
              }}
            >
              <span aria-hidden="true">{audioMuted ? "🔇" : "🔊"}</span>
              {audioMuted ? "Sound off" : "Sound on"}
            </button>
          </header>

          {role === "runner" ? (
            <section className="log-runner-actions" aria-label="Runner controls">
              <button
                type="button"
                className={`log-runner-action log-runner-jump${jumping ? " is-active" : ""}`}
                aria-label="Jump over low obstacles"
                disabled={controlsDisabled}
                onPointerDown={(event) => { event.preventDefault(); jump(); }}
                onClick={(event) => { if (event.detail === 0) jump(); }}
              >
                <span aria-hidden="true">↑</span><strong>JUMP</strong><small>LOW ROOTS</small>
              </button>
              <button
                type="button"
                className={`log-runner-action log-runner-duck${ducking ? " is-active" : ""}`}
                aria-label="Duck under high obstacles"
                disabled={controlsDisabled}
                onPointerDown={(event) => { event.preventDefault(); duck(); }}
                onClick={(event) => { if (event.detail === 0) duck(); }}
              >
                <span aria-hidden="true">↓</span><strong>DUCK</strong><small>HIGH BRANCHES</small>
              </button>
            </section>
          ) : (
            <section className="log-runner-bank-controls" aria-label="Bank controls">
              <button
                type="button"
                className={`log-runner-throw${throwing ? " is-active" : ""}`}
                aria-label="Throw branch"
                disabled={controlsDisabled || (frame?.cooldown ?? 0) > 0 || Boolean(frame?.queued)}
                onPointerDown={(event) => { event.preventDefault(); throwBranch(); }}
                onClick={(event) => { if (event.detail === 0) throwBranch(); }}
              >
                <span aria-hidden="true">{frame?.queued ? "↝" : (frame?.cooldown ?? 0) > 0 ? Math.ceil(frame?.cooldown ?? 0) : "➚"}</span>
                <strong>{frame?.queued ? "QUEUED" : (frame?.cooldown ?? 0) > 0 ? "COOLING" : "THROW BRANCH"}</strong>
                <small>Fair gap · everyone sees it</small>
              </button>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
