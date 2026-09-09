import { useEffect, useRef, useState } from "react";
import { Joystick } from "../../kit/Joystick";
import type { ControllerProps } from "../registry";
import type { KartInput } from "./host";

const SEND_HZ = 20;

export default function KartController({ you, send }: ControllerProps) {
  const input = useRef<KartInput>({ s: 0, t: 0, b: false });
  const dirty = useRef(true);
  const boostFeedbackTimer = useRef<number>();
  const [boosting, setBoosting] = useState(false);

  // Coalesce to a fixed rate. Sending a frame per pointermove event floods
  // the socket and buys nothing — the sim runs on the host at 60fps anyway.
  useEffect(() => {
    const id = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      send({ ...input.current });
      input.current.b = false;
    }, 1000 / SEND_HZ);
    return () => clearInterval(id);
  }, [send]);

  useEffect(
    () => () => {
      if (boostFeedbackTimer.current !== undefined) {
        window.clearTimeout(boostFeedbackTimer.current);
      }
    },
    [],
  );

  const stick = (x: number, y: number) => {
    input.current.s = x;
    input.current.t = y;
    dirty.current = true;
  };

  const boost = () => {
    input.current.b = true;
    dirty.current = true;
    setBoosting(true);

    try {
      navigator.vibrate?.([25, 18, 35]);
    } catch {
      // Haptics are optional and can be blocked by the browser or device.
    }

    if (boostFeedbackTimer.current !== undefined) {
      window.clearTimeout(boostFeedbackTimer.current);
    }
    boostFeedbackTimer.current = window.setTimeout(() => {
      setBoosting(false);
      boostFeedbackTimer.current = undefined;
    }, 220);
  };

  return (
    <div className="pad kart-controller" style={{ background: you.color }}>
      <header className="kart-controller-head">
        <span className="kart-controller-kicker">Your kart</span>
        <p className="pad-name kart-controller-name">{you.name}</p>
        <p className="kart-controller-instructions">Drag to steer · Tap boost for speed</p>
      </header>

      <section className="kart-steering" aria-label="Steering control">
        <div className="kart-control-label" aria-hidden="true">
          <strong>Steer</strong>
          <span>Press + drag</span>
        </div>
        <Joystick onChange={stick} label="PRESS + DRAG" />
      </section>

      <button
        type="button"
        className={`pad-button kart-boost${boosting ? " is-on" : ""}`}
        aria-label="Boost — tap for a burst of speed"
        onClick={boost}
      >
        <span className="kart-boost-label">Boost</span>
        <span className="kart-boost-hint">Tap for a burst</span>
      </button>
    </div>
  );
}
