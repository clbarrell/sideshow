import { useEffect, useRef, useState } from "react";
import type { ControllerProps } from "../registry";
import type { KartInput } from "./host";

const SEND_HZ = 20;

export default function KartController({ you, send }: ControllerProps) {
  const input = useRef<KartInput>({ s: 0, t: 0, b: false });
  const dirty = useRef(true);
  const boostFeedbackTimer = useRef<number>();
  const [boosting, setBoosting] = useState(false);
  const held = useRef({
    left: new Set<number>(),
    right: new Set<number>(),
    forward: new Set<number>(),
    reverse: new Set<number>(),
  });
  const [pressed, setPressed] = useState({ left: false, right: false, forward: false, reverse: false });

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

  const updateAxes = () => {
    input.current.s = Number(held.current.right.size > 0) - Number(held.current.left.size > 0);
    input.current.t = Number(held.current.forward.size > 0) - Number(held.current.reverse.size > 0);
    dirty.current = true;
    setPressed({
      left: held.current.left.size > 0,
      right: held.current.right.size > 0,
      forward: held.current.forward.size > 0,
      reverse: held.current.reverse.size > 0,
    });
  };

  const press = (control: keyof typeof held.current, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    held.current[control].add(event.pointerId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateAxes();
  };

  const release = (control: keyof typeof held.current, pointerId: number) => {
    if (!held.current[control].delete(pointerId)) return;
    updateAxes();
  };

  useEffect(() => {
    const clearHeld = (updateUi: boolean) => {
      const hadHeldInput = Object.values(held.current).some((pointers) => pointers.size > 0);
      for (const pointers of Object.values(held.current)) pointers.clear();
      input.current = { s: 0, t: 0, b: false };
      dirty.current = false;
      if (hadHeldInput) send({ s: 0, t: 0, b: false });
      if (updateUi) setPressed({ left: false, right: false, forward: false, reverse: false });
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") clearHeld(true);
    };
    const onBlur = () => clearHeld(true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearHeld(false);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [send]);

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
      <div className="kart-rotate" role="status">
        <span aria-hidden="true">↻</span>
        <strong>Rotate to race</strong>
        <p>Turn your phone sideways for steering, pedals, and boost.</p>
      </div>
      <div className="kart-controls">
        <section className="kart-control-group kart-steering-buttons" aria-label="Steering">
          <span className="kart-group-label">Steer</span>
          <div>
            <button
              type="button"
              className={`kart-hold${pressed.left ? " is-held" : ""}`}
              aria-label="Steer left"
              onPointerDown={(event) => press("left", event)}
              onPointerUp={(event) => release("left", event.pointerId)}
              onPointerCancel={(event) => release("left", event.pointerId)}
              onLostPointerCapture={(event) => release("left", event.pointerId)}
            >
              <span aria-hidden="true">←</span>
              <strong>Left</strong>
            </button>
            <button
              type="button"
              className={`kart-hold${pressed.right ? " is-held" : ""}`}
              aria-label="Steer right"
              onPointerDown={(event) => press("right", event)}
              onPointerUp={(event) => release("right", event.pointerId)}
              onPointerCancel={(event) => release("right", event.pointerId)}
              onLostPointerCapture={(event) => release("right", event.pointerId)}
            >
              <span aria-hidden="true">→</span>
              <strong>Right</strong>
            </button>
          </div>
        </section>

        <header className="kart-controller-head">
          <span className="kart-controller-kicker">Kart {you.seat + 1}</span>
          <p className="pad-name kart-controller-name">{you.name}</p>
          <p className="kart-controller-instructions">
            Left thumb steers<br />Right thumb drives<br />Boost anytime
          </p>
        </header>

        <section className="kart-control-group kart-drive-buttons" aria-label="Drive">
          <span className="kart-group-label">Drive</span>
          <div>
            <button
              type="button"
              className={`kart-hold kart-forward${pressed.forward ? " is-held" : ""}`}
              aria-label="Drive forward"
              onPointerDown={(event) => press("forward", event)}
              onPointerUp={(event) => release("forward", event.pointerId)}
              onPointerCancel={(event) => release("forward", event.pointerId)}
              onLostPointerCapture={(event) => release("forward", event.pointerId)}
            >
              <span aria-hidden="true">↑</span>
              <strong>Go</strong>
            </button>
            <button
              type="button"
              className={`kart-hold kart-reverse${pressed.reverse ? " is-held" : ""}`}
              aria-label="Reverse"
              onPointerDown={(event) => press("reverse", event)}
              onPointerUp={(event) => release("reverse", event.pointerId)}
              onPointerCancel={(event) => release("reverse", event.pointerId)}
              onLostPointerCapture={(event) => release("reverse", event.pointerId)}
            >
              <span aria-hidden="true">↓</span>
              <strong>Reverse</strong>
            </button>
            <button
              type="button"
              className={`kart-boost${boosting ? " is-on" : ""}`}
              aria-label="Boost — tap for a burst of speed"
              onClick={boost}
            >
              <span className="kart-boost-label">Boost</span>
              <span className="kart-boost-hint">Tap</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
