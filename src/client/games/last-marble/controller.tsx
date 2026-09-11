import { useCallback, useEffect, useRef, useState } from "react";
import { Joystick } from "../../kit/Joystick";
import type { ControllerProps } from "../registry";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted } from "../../audio";
import {
  isLastMarbleStatusFrame,
  type LastMarbleInput,
  type LastMarbleStatusFrame,
} from "./protocol";
import { LastMarbleSound } from "./sound";

const SEND_HZ = 20;
const GLYPHS = ["◆", "▲", "●", "✦", "■", "⬟", "✚", "★", "⬢", "✿"];

export default function LastMarbleController({ you, send, last }: ControllerProps) {
  const input = useRef<LastMarbleInput>({ x: 0, y: 0 });
  const dirty = useRef(true);
  const sound = useRef<LastMarbleSound | null>(null);
  const audioUnlocked = useRef(false);
  const previousPhase = useRef<LastMarbleStatusFrame["phase"] | null>(null);
  const syncSent = useRef(false);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  const status = isLastMarbleStatusFrame(last) ? last : null;
  const interactive = status?.interactive === true;

  useEffect(() => {
    if (typeof AudioContext === "undefined") return;
    const instance = new LastMarbleSound("phone");
    sound.current = instance;
    return () => {
      instance.destroy();
      sound.current = null;
    };
  }, []);

  useEffect(() => subscribeAudioMuted(setAudioMutedState), []);

  useEffect(() => {
    if (syncSent.current) return;
    syncSent.current = true;
    send({ t: "sync" });
  }, [send]);

  const neutralize = useCallback((forceSend = false) => {
    const moving = input.current.x !== 0 || input.current.y !== 0;
    input.current = { x: 0, y: 0 };
    dirty.current = false;
    if (moving || forceSend) send({ x: 0, y: 0 } satisfies LastMarbleInput);
  }, [send]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      send({ ...input.current });
    }, 1000 / SEND_HZ);
    return () => window.clearInterval(timer);
  }, [send]);

  useEffect(() => {
    const onBlur = () => neutralize(true);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") neutralize(true);
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      neutralize();
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [neutralize]);

  useEffect(() => {
    if (!interactive) neutralize();
  }, [interactive, neutralize]);

  useEffect(() => {
    if (!isLastMarbleStatusFrame(last) || last.impact === undefined) return;
    sound.current?.impact(last.impact);
    try {
      navigator.vibrate?.(Math.round(20 + last.impact * 30));
    } catch {
      // Haptics are best-effort and may be blocked by the device or browser.
    }
  }, [last]);

  useEffect(() => {
    if (!status) return;
    if (previousPhase.current !== null && previousPhase.current !== "out" && status.phase === "out") {
      sound.current?.fall();
      try {
        navigator.vibrate?.([35, 20, 55]);
      } catch {
        // Haptics are optional feedback.
      }
    }
    if (
      (previousPhase.current === "runway" || previousPhase.current === "intermission")
      && status.phase === "playing"
    ) {
      try {
        navigator.vibrate?.([20, 25, 45]);
      } catch {
        // Haptics are optional feedback.
      }
    }
    previousPhase.current = status.phase;
  }, [status]);

  const onStick = useCallback((x: number, y: number) => {
    if (!audioUnlocked.current) {
      audioUnlocked.current = true;
      sound.current?.unlock();
    }
    input.current = { x, y };
    dirty.current = true;
  }, []);

  return (
    <div className="pad last-marble-controller" style={{ background: you.color }}>
      <header className="last-marble-phone-head">
        <div className="last-marble-phone-row">
          <p className="last-marble-phone-seat">
            <span aria-hidden="true">{GLYPHS[you.seat] ?? "●"}</span>
            Marble {you.seat + 1}
          </p>
          <button
            type="button"
            className="last-marble-sound-toggle"
            aria-pressed={!audioMuted}
            onClick={() => {
              sound.current?.unlock();
              setAudioMuted(!audioMuted);
            }}
          >
            <span aria-hidden="true">{audioMuted ? "🔇" : "🔊"}</span>
            {audioMuted ? "Sound off" : "Sound on"}
          </button>
        </div>
        <p className="pad-name">{you.name}</p>
        <p className="last-marble-phone-heat">Highest total wins · Heat {status?.heat ?? 1} of 5</p>
      </header>

      {interactive ? (
        <section className="last-marble-stick" aria-label="Move your marble">
          <Joystick onChange={onStick} label="DRAG TO RAM" />
          <p>{status?.phase === "intermission" ? `SET YOUR THUMB · GO IN ${status.nextHeatIn ?? 4}` : status?.phase === "runway" ? "SET YOUR THUMB · WAIT FOR GO" : "Build momentum. Ram rivals. Stay on the tiles."}</p>
        </section>
      ) : (
        <PhoneState status={status} />
      )}
    </div>
  );
}

function PhoneState({ status }: { status: LastMarbleStatusFrame | null }) {
  let title = "LOOK UP";
  let message = "The arena is loading on the big screen.";

  if (status?.phase === "out") {
    title = "OUT THIS HEAT";
    message = status.message ?? "Watch the finish — the next heat starts soon.";
  } else if (status?.phase === "intermission") {
    title = "HEAT OVER";
    message = status.message ?? "Next heat in four seconds.";
  } else if (status?.phase === "complete") {
    title = "MATCH OVER";
    message = "Look up for the final standings.";
  } else if (status?.phase === "spectating") {
    title = "MATCH IN PROGRESS";
    message = "You’ll play when the next game starts. Watch the chaos!";
  }

  return (
    <section className="last-marble-phone-state" role="status" aria-live="polite">
      <span aria-hidden="true">◎</span>
      <strong>{title}</strong>
      <p>{message}</p>
      {status?.phase === "out" && status.nextHeatIn !== undefined && <p>{status.heat < 5 ? "Next heat" : "Results"} in at most {status.nextHeatIn}s</p>}
    </section>
  );
}
