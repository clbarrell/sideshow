import { useCallback, useEffect, useRef, useState } from "react";
import type { ControllerProps } from "../registry";
import { DriftLane } from "./DriftLane";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted, unlockAudio } from "../../audio";
import { isJoustAudioFrame, JoustSound } from "./sound";

export interface JoustInput {
  x: number;
  flap?: number;
}

const SEND_MS = 50;

export default function JoustController({ you, send, last, connected = true }: ControllerProps) {
  const input = useRef<JoustInput>({ x: 0 });
  const flapSequence = useRef(0);
  const dirty = useRef(true);
  const flapTimer = useRef<number>();
  const [flapping, setFlapping] = useState(false);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  const sound = useRef<JoustSound | null>(null);

  useEffect(() => {
    if (typeof AudioContext === "undefined") return;
    const next = new JoustSound("phone");
    sound.current = next;
    return () => {
      next.destroy();
      sound.current = null;
    };
  }, []);

  useEffect(() => subscribeAudioMuted(setAudioMutedState), []);

  useEffect(() => {
    if (!isJoustAudioFrame(last)) return;
    if (last.bump) sound.current?.bump();
    if (last.crack) sound.current?.crack();
    if (last.respawn) sound.current?.flap();
    if (last.egg) sound.current?.egg(last.egg);
  }, [last]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!connected || !dirty.current) return;
      dirty.current = false;
      send({ ...input.current });
      delete input.current.flap;
    }, SEND_MS);
    return () => window.clearInterval(id);
  }, [connected, send]);

  useEffect(() => {
    if (connected) {
      dirty.current = true;
      return;
    }
    input.current = { x: 0 };
    dirty.current = false;
    setFlapping(false);
  }, [connected]);

  useEffect(() => () => {
    if (flapTimer.current !== undefined) window.clearTimeout(flapTimer.current);
    if (input.current.x !== 0 || input.current.flap !== undefined) send({ x: 0 });
  }, [send]);

  const drift = useCallback((x: number) => {
    input.current.x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    dirty.current = true;
  }, []);

  const flap = () => {
    if (!connected) return;
    unlockAudio();
    sound.current?.flap();
    input.current.flap = ++flapSequence.current;
    dirty.current = true;
    setFlapping(true);
    try { navigator.vibrate?.(32); } catch { /* haptics are optional */ }
    if (flapTimer.current !== undefined) window.clearTimeout(flapTimer.current);
    flapTimer.current = window.setTimeout(() => {
      setFlapping(false);
      flapTimer.current = undefined;
    }, 150);
  };

  return (
    <main
      className="pad joust-controller"
      style={{ background: you.color }}
      data-seat={you.seat + 1}
      data-pattern={you.seat % 10}
    >
      <div className="joust-rotate" role="status">
        <span aria-hidden="true">↻</span>
        <strong>Turn to take wing</strong>
        <p>Use both thumbs in landscape.</p>
      </div>

      {!connected ? (
        <section className="joust-reconnecting" role="status" aria-live="polite">
          <span className="joust-reconnecting-mark" aria-hidden="true">{you.seat + 1}</span>
          <strong>Reconnecting…</strong>
          <p>Your bird and loose egg are safe. Keep this screen open.</p>
        </section>
      ) : (
        <div className="joust-controls">
          <section className="joust-stick-zone" aria-label="Drift control">
            <DriftLane onChange={drift} />
            <span>Drift</span>
          </section>

          <header className="joust-id-card">
            <span className="joust-seat-mark" aria-hidden="true">{you.seat + 1}</span>
            <div>
              <span className="joust-kicker">Featherweight {you.seat + 1}</span>
              <strong>{you.name}</strong>
              <p>Bump from above · touch rival eggs +1</p>
            </div>
            <button
              type="button"
              className="joust-sound-toggle"
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

          <button
            type="button"
            className={`joust-flap${flapping ? " is-flapping" : ""}`}
            aria-label="Flap upward"
            onPointerDown={(event) => {
              event.preventDefault();
              flap();
            }}
            onClick={(event) => {
              if (event.detail === 0) flap();
            }}
          >
            <span aria-hidden="true">▲</span>
            <strong>Flap</strong>
            <small>Tap</small>
          </button>
        </div>
      )}
    </main>
  );
}
