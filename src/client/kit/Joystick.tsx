import { useCallback, useRef, useState } from "react";

interface Props {
  /** Called on every change with values in -1..1. Up is +y. */
  onChange: (x: number, y: number) => void;
  label?: string;
}

/**
 * Part of the controller kit: the pieces every game picks from instead of
 * writing touch handling again. Anchors to wherever the thumb lands so the
 * stick is never somewhere the hand isn't.
 */
export function Joystick({ onChange, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);

  const radius = 78;

  const emit = useCallback(
    (px: number, py: number) => {
      let dx = px - origin.current.x;
      let dy = py - origin.current.y;
      const d = Math.hypot(dx, dy);
      if (d > radius) {
        dx = (dx / d) * radius;
        dy = (dy / d) * radius;
      }
      setKnob({ x: dx, y: dy });
      onChange(dx / radius, dy === 0 ? 0 : -dy / radius);
    },
    [onChange],
  );

  const down = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    origin.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    box.current!.setPointerCapture?.(e.pointerId);
    emit(e.clientX - r.left, e.clientY - r.top);
  };

  const move = (e: React.PointerEvent) => {
    if (!knob) return;
    const r = box.current!.getBoundingClientRect();
    emit(e.clientX - r.left, e.clientY - r.top);
  };

  const up = () => {
    setKnob(null);
    onChange(0, 0);
  };

  return (
    <div
      ref={box}
      className="stick"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
    >
      {knob ? (
        <>
          <span
            className="stick-base"
            style={{ left: origin.current.x, top: origin.current.y, width: radius * 2, height: radius * 2 }}
          />
          <span
            className="stick-knob"
            style={{ left: origin.current.x + knob.x, top: origin.current.y + knob.y }}
          />
        </>
      ) : (
        <span className="stick-hint">{label ?? "Touch and drag"}</span>
      )}
    </div>
  );
}
