import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { audioVolume, isAudioMuted, setAudioMuted, setAudioVolume, subscribeAudioMuted, subscribeAudioVolume, unlockAudio } from "../../audio";
import { Joystick } from "../../kit/Joystick";
import type { ControllerProps } from "../registry";
import { getawayFrameForPlayer, type GetawayCue, type GetawayInput, type GetawayPhoneFrame } from "./protocol";
import { GetawaySound } from "./sound";
import "./controller.css";

const SEND_HZ = 15;

function formatPartyNumber(value: number) {
  return value.toLocaleString("en", { maximumFractionDigits: 2 });
}

export default function GetawayController({ you, send, last, connected = true }: ControllerProps) {
  const input = useRef<GetawayInput>({ x: 0, y: 0, shove: false });
  const dirty = useRef(false);
  const answeredSyncToken = useRef("");
  const releaseTimer = useRef<number | null>(null);
  const sound = useRef<GetawaySound | null>(null);
  const incoming = getawayFrameForPlayer(last, you.id);
  const [remembered, setRemembered] = useState<GetawayPhoneFrame | null>(null);
  const [held, setHeld] = useState(false);
  const [muted, setMutedState] = useState(isAudioMuted);
  const [volume, setVolumeState] = useState(audioVolume);
  useEffect(() => { if (incoming) setRemembered(incoming); }, [incoming]);
  const frame = incoming ?? remembered;
  const interactive = connected && frame?.interactive === true;

  useEffect(() => {
    if (typeof AudioContext === "undefined") return;
    const next = new GetawaySound("phone");
    sound.current = next;
    return () => {
      next.destroy();
      sound.current = null;
    };
  }, []);

  useEffect(() => subscribeAudioMuted(setMutedState), []);
  useEffect(() => subscribeAudioVolume(setVolumeState), []);

  const neutralize = useCallback((force = false) => {
    const wasActive = Math.hypot(input.current.x, input.current.y) > 0.01 || input.current.shove === true;
    input.current = { x: 0, y: 0, shove: false };
    dirty.current = false;
    setHeld(false);
    if ((wasActive || force) && connected) send({ x: 0, y: 0, shove: false } satisfies GetawayInput);
  }, [connected, send]);

  useEffect(() => {
    if (connected) {
      input.current = { x: 0, y: 0, shove: false };
      dirty.current = false;
      send({ x: 0, y: 0, shove: false, sync: true } satisfies GetawayInput);
    } else {
      neutralize(false);
    }
  }, [connected, neutralize, send]);

  // A projector refresh recreates the host while phones stay mounted. The new
  // host broadcasts a fresh token; each surviving controller answers once.
  useEffect(() => {
    if (!connected || !frame?.syncToken || answeredSyncToken.current === frame.syncToken) return;
    answeredSyncToken.current = frame.syncToken;
    send({ x: 0, y: 0, shove: false, sync: true } satisfies GetawayInput);
  }, [connected, frame?.syncToken, send]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!connected || !interactive) return;
      const active = Math.hypot(input.current.x, input.current.y) > 0.02 || input.current.shove === true;
      if (!dirty.current && !active) return;
      dirty.current = false;
      send({ ...input.current });
    }, 1000 / SEND_HZ);
    return () => window.clearInterval(timer);
  }, [connected, interactive, send]);

  useEffect(() => {
    const onBlur = () => neutralize(true);
    const onVisibility = () => { if (document.visibilityState !== "visible") neutralize(true); };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      neutralize(false);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current);
    };
  }, [neutralize]);

  useEffect(() => {
    if (!interactive) neutralize();
  }, [interactive, neutralize]);

  useEffect(() => {
    if (!frame?.cue) return;
    sound.current?.play(frame.cue);
    hapticFor(frame.cue);
  }, [frame?.cue]);

  const move = useCallback((x: number, y: number) => {
    if (!interactive) return;
    unlockAudio();
    const wasMoving = Math.hypot(input.current.x, input.current.y) > 0.02;
    const magnitude = Math.hypot(x, y);
    input.current.x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    input.current.y = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
    if (wasMoving && magnitude <= 0.02 && input.current.shove !== true) {
      dirty.current = false;
      send({ ...input.current });
    } else {
      dirty.current = true;
    }
  }, [interactive, send]);

  const setShove = useCallback((next: boolean) => {
    if (!interactive && next) return;
    if (next) unlockAudio();
    input.current.shove = next;
    dirty.current = true;
    setHeld(next);
    send({ ...input.current });
  }, [interactive, send]);

  const keyboardShove = () => {
    if (!interactive) return;
    setShove(true);
    if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(() => setShove(false), 180);
  };

  const phaseLabel = !frame ? "Connecting to game…"
    : frame.phase === "practice" ? `Practice · ${Math.ceil(frame.remaining)}s`
    : frame?.phase === "runway" ? `Starts in ${Math.max(1, Math.ceil(frame.remaining))}`
    : frame?.phase === "live" ? `${Math.ceil(frame.remaining)}s left`
    : frame?.phase === "invalid" ? "Roster blocked"
    : frame?.phase === "spectating" ? "Watching this round"
    : "Round complete";
  const crewClass = frame?.crew === "Cobalt" ? "crew-cobalt" : "crew-crimson";
  const shoveLabel = frame?.protected ? "PROTECTED"
    : frame?.shoveReady ? "READY · HOLD TO REPEAT"
    : `RECOVERING ${Math.max(0, frame?.shoveCooldown ?? 0).toFixed(1)}s`;

  return (
    <main
      className={`pad getaway-controller ${crewClass}${!connected ? " is-disconnected" : ""}`}
      style={{ "--seat": you.color } as CSSProperties}
    >
      <div className="getaway-rotate" role="status">
        <span aria-hidden="true">↻</span>
        <strong>Turn your phone sideways</strong>
        <p>Move left. Hold SHOVE with your right thumb.</p>
      </div>
      <header className="getaway-head">
        <div className="getaway-id">
          <b>{you.seat + 1}</b>
          <span><small>{frame?.crew ? `${frame.crew} ${frame.crewShape}` : "Getaway"}</small><strong>{you.name}</strong></span>
        </div>
        <div className="getaway-score">
          <small>Points</small>
          <strong>{formatPartyNumber(frame?.crewPoints ?? 0)}</strong>
          <em>{frame?.crewBanked ?? 0} bags{(frame?.crewMultiplier ?? 1) > 1 ? ` · ×${formatPartyNumber(frame!.crewMultiplier)} smaller crew` : ""}</em>
        </div>
        <div className="getaway-bags" aria-label={`${frame?.bags ?? 0} of 5 bags carried`}>
          {Array.from({ length: 5 }, (_, index) => <i key={index} className={index < (frame?.bags ?? 0) ? "" : "is-empty"} />)}
        </div>
        <div className="getaway-audio">
          <button
            type="button"
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            aria-pressed={!muted}
            onClick={() => { unlockAudio(); setAudioMuted(!muted); }}
          >{muted ? "🔇" : "🔊"}</button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            aria-label="Game volume"
            onChange={(event) => { unlockAudio(); setAudioVolume(Number(event.currentTarget.value)); }}
          />
        </div>
      </header>

      <section className="getaway-status" role="status" aria-live="polite">
        <strong>{connected ? phaseLabel : "RECONNECTING…"}</strong>
        <span>{connected ? frame?.status ?? "Loading your controls…" : "Movement stopped immediately"}</span>
      </section>

      <section className="getaway-controls" aria-label="Getaway controls">
        <div className="getaway-stick-zone">
          <Joystick label="MOVE" onChange={move} />
          <strong>LEFT THUMB · MOVE</strong>
        </div>
        <div className="getaway-action-zone">
          <button
            type="button"
            className={`getaway-shove${held ? " is-held" : ""}`}
            aria-label="Shove"
            aria-pressed={held}
            disabled={!interactive}
            onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); setShove(true); }}
            onPointerUp={(event) => { event.preventDefault(); setShove(false); }}
            onPointerCancel={() => setShove(false)}
            onLostPointerCapture={() => setShove(false)}
            onClick={(event) => { if (event.detail === 0) keyboardShove(); }}
          >
            <strong>SHOVE</strong>
            <span>{shoveLabel}</span>
          </button>
        </div>
      </section>
    </main>
  );
}

function hapticFor(cue: GetawayCue) {
  try {
    if (cue === "spill") navigator.vibrate?.([42, 20, 58]);
    else if (cue === "deposit") navigator.vibrate?.([18, 24, 18, 24, 45]);
    else if (cue === "protected") navigator.vibrate?.(32);
    else if (cue === "vault") navigator.vibrate?.([55, 35, 55]);
    else if (cue === "pickup") navigator.vibrate?.(18);
    else if (cue === "go") navigator.vibrate?.([18, 18, 40]);
    else if (cue === "shove") navigator.vibrate?.(24);
  } catch {
    // Haptics are an optional reinforcement; every cue is visible on screen.
  }
}
