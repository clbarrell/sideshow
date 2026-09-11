import { useCallback, useEffect, useRef, useState } from "react";
import "./drift-lane.css";

/** A relative horizontal stick: vertical thumb motion never changes thrust. */
export function DriftLane({ onChange }: { onChange: (x: number) => void }) {
  const pointer = useRef<number | null>(null);
  const origin = useRef(0);
  const [value, setValue] = useState(0);
  const reset = useCallback(() => {
    pointer.current = null;
    setValue(0);
    onChange(0);
  }, [onChange]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState !== "visible") reset(); };
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      reset();
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [reset]);
  return <div
    className="stick joust-drift-lane"
    role="application"
    aria-label="Drift left or right"
    tabIndex={0}
    onPointerDown={(event) => {
      if (pointer.current !== null) return;
      event.preventDefault();
      pointer.current = event.pointerId;
      origin.current = event.clientX;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setValue(0);
      onChange(0);
    }}
    onPointerMove={(event) => {
      if (pointer.current !== event.pointerId) return;
      const next = Math.max(-1, Math.min(1, (event.clientX - origin.current) / 78));
      setValue(next);
      onChange(next);
    }}
    onPointerUp={(event) => { if (pointer.current === event.pointerId) reset(); }}
    onPointerCancel={(event) => { if (pointer.current === event.pointerId) reset(); }}
    onLostPointerCapture={(event) => { if (pointer.current === event.pointerId) reset(); }}
    onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next = event.key === "ArrowLeft" ? -1 : 1;
      setValue(next); onChange(next);
    }}
    onKeyUp={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") reset(); }}
    onBlur={reset}
  >
    <span className="joust-drift-track" aria-hidden="true"><b>◀</b><i style={{ transform: `translateX(${value * 65}px)` }}>↔</i><b>▶</b></span>
    <span className="joust-drift-hint">Slide left or right</span>
  </div>;
}
