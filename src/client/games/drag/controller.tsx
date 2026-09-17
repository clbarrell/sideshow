import { useCallback, useEffect, useRef, useState } from "react";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted, unlockAudio } from "../../audio";
import { Joystick } from "../../kit/Joystick";
import type { ControllerProps } from "../registry";
import { isDragPhoneFrame, type DragInput, type DragPhoneFrame, type DragPhoneFrames } from "./host";
import { DragSound, isDragAudioFrame } from "./sound";
import "./controller.css";

const SEND_HZ = 20;
let actionSequence = 0;

function freshSequence() {
  actionSequence = (actionSequence + 1) % 1000;
  return Date.now() * 1000 + actionSequence;
}

export default function DragController({ you, send, connected, last }: ControllerProps) {
  const input = useRef<DragInput>({ x: 0, y: 0 });
  const dirty = useRef(false);
  const sound = useRef<DragSound | null>(null);
  const [frame, setFrame] = useState<DragPhoneFrame | null>(null);
  const [moving, setMoving] = useState(false);
  const [lungePending, setLungePending] = useState(false);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);

  useEffect(() => {
    if (typeof AudioContext === "undefined") return;
    const instance = new DragSound("phone");
    sound.current = instance;
    return () => {
      instance.destroy();
      sound.current = null;
    };
  }, []);

  useEffect(() => subscribeAudioMuted(setAudioMutedState), []);

  useEffect(() => {
    let own: DragPhoneFrame | undefined;
    if (isDragPhoneFrame(last)) own = last;
    else if (last && typeof last === "object" && !Array.isArray(last)) {
      const batch = last as Partial<DragPhoneFrames>;
      if (batch.t === "dragStates" && batch.frames && typeof batch.frames === "object") own = batch.frames[you.id];
    }
    if (own && isDragPhoneFrame(own)) {
      setFrame(own);
      if (own.cooldown > 0 || own.lungeReady) setLungePending(false);
      for (const cue of own.cues ?? []) {
        sound.current?.play(cue);
        try {
          if (cue === "warning") navigator.vibrate?.([45, 30, 45]);
          else if (cue === "burst") navigator.vibrate?.([65, 30, 80]);
          else if (cue === "respawn") navigator.vibrate?.([20, 25, 35]);
          else if (cue === "eat") navigator.vibrate?.(15);
          else if (cue === "go") navigator.vibrate?.([20, 25, 55]);
        } catch { /* Haptics are optional. */ }
      }
    }
    if (!isDragAudioFrame(last)) return;
    sound.current?.play(last.cue);
    try {
      if (last.cue === "warning") navigator.vibrate?.([45, 30, 45]);
      else if (last.cue === "burst") navigator.vibrate?.([65, 30, 80]);
      else if (last.cue === "respawn") navigator.vibrate?.([20, 25, 35]);
      else if (last.cue === "lunge") navigator.vibrate?.(42);
      else if (last.cue === "eat") navigator.vibrate?.(15);
      else if (last.cue === "go") navigator.vibrate?.([20, 25, 55]);
    } catch {
      // Haptics are optional and absent on several common browsers.
    }
  }, [last, you.id]);

  useEffect(() => {
    send({ t: "sync" });
  }, [send]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      send({ x: input.current.x, y: input.current.y });
    }, 1000 / SEND_HZ);
    return () => window.clearInterval(timer);
  }, [send]);

  const neutralize = useCallback((updateUi = true) => {
    const active = Math.hypot(input.current.x, input.current.y) > 0;
    input.current = { x: 0, y: 0 };
    dirty.current = false;
    if (active) send({ x: 0, y: 0 });
    if (updateUi) setMoving(false);
  }, [send]);

  useEffect(() => {
    const onBlur = () => neutralize();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") neutralize();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      neutralize(false);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [neutralize]);

  useEffect(() => {
    if (!connected) neutralize();
  }, [connected, neutralize]);

  const onStick = useCallback((x: number, y: number) => {
    unlockAudio();
    const active = Math.hypot(x, y) > .08;
    const wasActive = Math.hypot(input.current.x, input.current.y) > .08;
    input.current.x = x;
    input.current.y = y;
    setMoving(active);
    if (wasActive && !active) {
      dirty.current = false;
      send({ x: 0, y: 0 });
    } else {
      dirty.current = true;
    }
  }, [send]);

  const canLunge = connected && !lungePending && (frame?.lungeReady ?? true) && frame?.phase !== "spectating" && frame?.phase !== "finish";
  const lunge = () => {
    if (!canLunge) return;
    unlockAudio();
    sound.current?.play("lunge");
    try { navigator.vibrate?.(42); } catch { /* Haptics are optional. */ }
    setLungePending(true);
    send({ x: input.current.x, y: input.current.y, lunge: freshSequence() });
  };

  const phaseLabel = !connected
    ? "RECONNECTING"
    : !frame || frame.phase === "practice"
      ? "PRACTICE"
      : frame?.phase === "countdown"
        ? "RESET"
        : frame?.phase === "reforming"
          ? "REFORMING"
          : frame?.phase === "spectating"
            ? "WATCH THIS HEAT"
            : frame?.phase === "finish"
              ? "HEAT COMPLETE"
              : "LIVE";
  const lungeText = canLunge ? "READY · TAP" : frame?.phase === "countdown" ? "WAIT FOR GO" : frame?.phase === "reforming" ? "REFORMING" : frame?.phase === "spectating" ? "NEXT GAME" : `${Math.max(1, Math.ceil(frame?.cooldown ?? 0))}s`;

  return (
    <main
      className={`pad drag-controller${!connected ? " is-disconnected" : ""}`}
      style={{ "--drag-seat": you.color } as React.CSSProperties}
      data-seat={you.seat + 1}
      data-pattern={you.seat}
    >
      <section className="drag-rotate" role="status">
        <span aria-hidden="true">↻</span>
        <strong>Turn sideways to pull</strong>
        <p>Grow on ink · larger blobs swallow smaller blobs</p>
      </section>

      <div className="drag-phone">
        <section className={`drag-stick-shell${moving ? " is-moving" : ""}`}>
          <Joystick label="Move your blob" onChange={onStick} />
          <span className="drag-control-caption">LEFT THUMB · STEER</span>
        </section>

        <section className="drag-readout" role="status" aria-live="polite">
          <header className="drag-id">
            <b>{you.seat + 1}</b>
            <div><span>INK BLOB</span><strong>{you.name}</strong></div>
          </header>
          <div className={`drag-phase drag-phase-${frame?.phase ?? "practice"}`}>
            <b>{phaseLabel}</b>
            <span>{frame?.status ?? "Practice · eat ink and chase smaller blobs"}</span>
          </div>
          <div className="drag-meter-row">
            <span><b>{frame?.score ?? 0}</b> PTS</span>
            <div className="drag-size-meter" aria-label={`Blob size ${Math.round((frame?.size ?? 1) * 10) / 10}`}>
              <i style={{ width: `${Math.max(9, Math.min(100, (((frame?.size ?? 1) - 1) / 2.25) * 91 + 9))}%` }} />
            </div>
            <span>{Math.ceil(frame?.remaining ?? 90)}s</span>
          </div>
          <button
            type="button"
            className="drag-sound"
            aria-label={audioMuted ? "Turn sound on" : "Turn sound off"}
            aria-pressed={!audioMuted}
            onClick={() => {
              unlockAudio();
              setAudioMuted(!audioMuted);
            }}
          >
            {audioMuted ? "🔇 SOUND OFF" : "🔊 SOUND ON"}
          </button>
        </section>

        <section className="drag-lunge-shell">
          <button
            type="button"
            className="drag-lunge"
            aria-label={canLunge ? "Lunge ready — press to burst forward" : "Lunge unavailable"}
            disabled={!canLunge}
            onPointerDown={(event) => {
              event.preventDefault();
              lunge();
            }}
            onClick={(event) => {
              if (event.detail === 0) lunge();
            }}
          >
            <span aria-hidden="true">➜</span>
            <strong>LUNGE</strong>
            <small>{lungeText}</small>
          </button>
          <span className="drag-control-caption">LUNGE · SPENDS GROWTH</span>
        </section>
      </div>

      {!connected && <div className="drag-reconnecting" role="alert">RECONNECTING…<small>Movement released</small></div>}
    </main>
  );
}
