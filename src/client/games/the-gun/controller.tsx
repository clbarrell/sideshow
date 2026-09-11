import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted, unlockAudio } from "../../audio";
import { Joystick } from "../../kit/Joystick";
import type { ControllerProps } from "../registry";
import { theGunStatusForPlayer, type TheGunInput, type TheGunStatusFrame } from "./protocol";
import { TheGunSound, type TheGunCue } from "./sound";

const SEND_HZ = 20;
const GLYPHS = ["◆", "▲", "●", "✦", "■", "⬟", "✚", "★", "⬢", "✿"];

export default function TheGunController({ you, send, last, connected = true }: ControllerProps) {
  const input = useRef<TheGunInput>({ x: 0 });
  const dirty = useRef(false);
  // A wall-clock prefix survives a full reload and remains below MAX_SAFE_INTEGER.
  // It lets the host retain replay protection without swallowing the first tap.
  const actionSequence = useRef(Math.floor(Date.now() * 1000));
  const sound = useRef<TheGunSound | null>(null);
  const feedbackTimers = useRef<number[]>([]);
  const [jumping, setJumping] = useState(false);
  const [acting, setActing] = useState(false);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  const incoming = theGunStatusForPlayer(last, you.id);
  const [remembered, setRemembered] = useState<TheGunStatusFrame | null>(null);
  const status = incoming ?? remembered;
  useEffect(() => { if (incoming) setRemembered(incoming); }, [incoming]);
  const interactive = connected && status?.interactive === true;

  useEffect(() => {
    if (typeof AudioContext === "undefined") return;
    const next = new TheGunSound("phone");
    sound.current = next;
    return () => {
      next.destroy();
      sound.current = null;
    };
  }, []);

  useEffect(() => subscribeAudioMuted(setAudioMutedState), []);

  useEffect(() => {
    const cues = status?.cues ?? (status?.cue ? [status.cue] : []);
    for (const cue of cues) {
      sound.current?.play(cue);
      hapticFor(cue);
    }
  }, [status]);

  const neutralize = useCallback((forceSend = false, updateUi = true) => {
    const wasActive = input.current.x !== 0
      || input.current.jump !== undefined
      || input.current.action !== undefined;
    input.current = { x: 0 };
    dirty.current = false;
    if (updateUi) {
      setJumping(false);
      setActing(false);
    }
    if (wasActive || forceSend) send({ x: 0 } satisfies TheGunInput);
  }, [send]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!connected || !dirty.current) return;
      dirty.current = false;
      send({ ...input.current });
      delete input.current.jump;
      delete input.current.action;
    }, 1000 / SEND_HZ);
    return () => window.clearInterval(timer);
  }, [connected, send]);

  useEffect(() => {
    if (connected) {
      input.current = { x: 0 };
      dirty.current = false;
      send({ x: 0, sync: true } satisfies TheGunInput);
    } else {
      neutralize(true);
    }
  }, [connected, neutralize, send]);

  useEffect(() => {
    const onBlur = () => neutralize(true);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") neutralize(true);
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      neutralize(false, false);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [neutralize]);

  useEffect(() => {
    if (!interactive) neutralize();
  }, [interactive, neutralize]);

  useEffect(() => () => {
    feedbackTimers.current.forEach((timer) => window.clearTimeout(timer));
    feedbackTimers.current = [];
  }, []);

  const pulse = (setter: (value: boolean) => void) => {
    setter(true);
    const timer = window.setTimeout(() => {
      setter(false);
      feedbackTimers.current = feedbackTimers.current.filter((candidate) => candidate !== timer);
    }, 150);
    feedbackTimers.current.push(timer);
  };

  const move = useCallback((nextX: number) => {
    if (!interactive) return;
    unlockAudio();
    const x = Number.isFinite(nextX) ? Math.max(-1, Math.min(1, nextX)) : 0;
    const stopped = input.current.x !== 0 && x === 0;
    input.current.x = x;
    const hasDiscreteAction = input.current.jump !== undefined || input.current.action !== undefined;
    if (stopped && !hasDiscreteAction) {
      dirty.current = false;
      send({ x: 0 } satisfies TheGunInput);
    } else {
      dirty.current = true;
    }
  }, [interactive, send]);

  const jump = () => {
    if (!interactive) return;
    unlockAudio();
    input.current.jump = ++actionSequence.current;
    dirty.current = true;
    pulse(setJumping);
    try { navigator.vibrate?.(26); } catch { /* Haptics are optional. */ }
  };

  const act = () => {
    if (!interactive) return;
    unlockAudio();
    input.current.action = ++actionSequence.current;
    dirty.current = true;
    pulse(setActing);
    // Press animation acknowledges the finger; only host cues confirm an action.
  };

  const armed = status?.armed === true;
  const loaded = status?.loaded === true;
  const phase = status?.phase ?? "runway";
  const respawning = (status?.respawn ?? 0) > 0;
  const actionLabel = armed ? "Fire" : "Shove";
  const actionHint = status?.actionState === "protected" ? "PROTECTED — MOVE / JUMP"
    : status?.actionState === "cooldown" ? "RECOVERING"
    : status?.actionState === "get-ready" ? "WAIT FOR GO"
    : armed ? (loaded ? "SHOOT TO SURVIVE" : "RELOADING") : "FACE THEM · SHOVE";
  const stateLabel = armed ? (loaded ? "LOADED" : "RELOADING") : "HOLD";
  const stateValue = armed
    ? (loaded ? "1 SHOT" : Math.max(0, status?.reload ?? 0).toFixed(1))
    : "+1/s";
  const unavailable = !connected || phase === "spectating" || phase === "results" || phase === "over" || respawning;

  return (
    <main
      className={`pad the-gun-controller${!connected ? " is-disconnected" : ""}${armed ? " is-armed" : ""}`}
      style={{ "--the-gun-seat": you.color } as CSSProperties}
      data-seat={you.seat + 1}
      data-pattern={you.seat % 10}
    >
      <div className="the-gun-rotate" role="status">
        <span aria-hidden="true">↻</span>
        <strong>Turn sideways to fight</strong>
        <p>Move left. Jump and {actionLabel.toLowerCase()} right.</p>
      </div>

      {!connected ? (
        <PhoneState icon="⌁" title="Reconnecting…" message="Your fighter is safe. Keep this screen open." />
      ) : (
        <div className="the-gun-phone">
          <header className="the-gun-phone-head">
            <div className="the-gun-id">
              <b aria-hidden="true">{you.seat + 1}</b>
              <span aria-hidden="true">{GLYPHS[you.seat % GLYPHS.length]}</span>
              <div><small>Fighter {you.seat + 1}</small><strong>{you.name}</strong></div>
            </div>
            <div className={`the-gun-readout${armed ? " is-hot" : ""}`}>
              <small>{stateLabel}</small>
              <strong>{stateValue}</strong>
            </div>
            <div className="the-gun-phone-status" aria-live="polite">
              <strong>{phase === "live" ? `${Math.ceil(status?.remaining ?? 120)}s` : phase === "runway" ? "GET READY" : "ROUND OVER"}</strong>
              <span>{status?.status ?? "Find your fighter on the big screen"}</span>
            </div>
            <button
              type="button"
              className="the-gun-sound"
              aria-label={audioMuted ? "Turn sound on" : "Turn sound off"}
              aria-pressed={!audioMuted}
              onClick={() => {
                unlockAudio();
                setAudioMuted(!audioMuted);
              }}
            >
              <span aria-hidden="true">{audioMuted ? "🔇" : "🔊"}</span>
              {audioMuted ? "Off" : "On"}
            </button>
          </header>

          {unavailable ? (
            respawning ? (
              <PhoneState icon="×" title="DOWN" message={`Respawning in ${(status?.respawn ?? 0).toFixed(1)} · look up`} compact />
            ) : phase === "spectating" ? (
              <PhoneState icon="◎" title="SPECTATING" message="This round is underway. You’re in for the next game." compact />
            ) : (
              <PhoneState icon="↑" title="LOOK UP" message="The result is landing on the big screen." compact />
            )
          ) : (
            <div className="the-gun-controls">
              <section className="the-gun-stick-zone" aria-label="Movement control">
                <Joystick label="Move left or right" onChange={move} />
                <strong>MOVE</strong>
                <span>Left thumb</span>
              </section>

              <section className="the-gun-actions" aria-label="Fight controls">
                <button
                  type="button"
                  className={`the-gun-action the-gun-jump${jumping ? " is-active" : ""}`}
                  aria-label="Jump"
                  disabled={!interactive}
                  onPointerDown={(event) => { event.preventDefault(); jump(); }}
                  onClick={(event) => { if (event.detail === 0) jump(); }}
                >
                  <span aria-hidden="true">↑</span><strong>JUMP</strong><small>GET HEIGHT</small>
                </button>
                <button
                  type="button"
                  className={`the-gun-action the-gun-context${acting ? " is-active" : ""}${armed ? " is-fire" : ""}`}
                  aria-label={actionLabel}
                  disabled={!interactive}
                  onPointerDown={(event) => { event.preventDefault(); act(); }}
                  onClick={(event) => { if (event.detail === 0) act(); }}
                >
                  <span aria-hidden="true">{armed ? (loaded ? "⌁" : "·") : "»"}</span>
                  <strong>{actionLabel.toUpperCase()}</strong>
                  <small>{actionHint}</small>
                </button>
              </section>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function PhoneState({ icon, title, message, compact = false }: { icon: string; title: string; message: string; compact?: boolean }) {
  return (
    <section className={`the-gun-phone-state${compact ? " is-compact" : ""}`} role="status" aria-live="polite">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{message}</p>
    </section>
  );
}

function hapticFor(cue: TheGunCue) {
  try {
    if (cue === "shot") navigator.vibrate?.([20, 12, 55]);
    else if (cue === "death") navigator.vibrate?.([55, 25, 90]);
    else if (cue === "drop" || cue === "pickup") navigator.vibrate?.([25, 18, 38]);
    else if (cue === "shove") navigator.vibrate?.(36);
    else if (cue === "respawn" || cue === "go") navigator.vibrate?.([16, 18, 28]);
    else if (cue === "empty") navigator.vibrate?.(14);
  } catch {
    // Vibration is best-effort and is unavailable on some mobile browsers.
  }
}
