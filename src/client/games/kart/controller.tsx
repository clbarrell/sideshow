import { useEffect, useRef, useState } from "react";
import { Joystick } from "../../kit/Joystick";
import type { ControllerProps } from "../registry";
import type { KartInput } from "./host";

const SEND_HZ = 20;

export default function KartController({ you, send }: ControllerProps) {
  const input = useRef<KartInput>({ s: 0, t: 0, b: false });
  const dirty = useRef(true);
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

  const stick = (x: number, y: number) => {
    input.current.s = x;
    input.current.t = y;
    dirty.current = true;
  };

  const boost = () => {
    input.current.b = true;
    dirty.current = true;
    setBoosting(true);
    navigator.vibrate?.(35);
    setTimeout(() => setBoosting(false), 220);
  };

  return (
    <div className="pad" style={{ background: you.color }}>
      <p className="pad-name">{you.name}</p>
      <Joystick onChange={stick} label="Drag to drive" />
      <button className={`pad-button${boosting ? " is-on" : ""}`} onPointerDown={boost}>
        Boost
      </button>
    </div>
  );
}
