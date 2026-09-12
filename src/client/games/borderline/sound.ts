import { audioBus, isAudioMuted } from "../../audio";

export type BorderlineCue = "commit" | "lock" | "capture" | "hold" | "score" | "go";
export type BorderlineSurface = "host" | "phone";

const CUES: Record<BorderlineCue, { from: number; to: number; duration: number; gain: number; type: OscillatorType }> = {
  commit: { from: 430, to: 610, duration: 0.08, gain: 0.035, type: "triangle" },
  lock: { from: 510, to: 350, duration: 0.12, gain: 0.05, type: "square" },
  capture: { from: 190, to: 520, duration: 0.18, gain: 0.06, type: "sawtooth" },
  hold: { from: 260, to: 180, duration: 0.16, gain: 0.05, type: "triangle" },
  score: { from: 520, to: 760, duration: 0.13, gain: 0.045, type: "sine" },
  go: { from: 330, to: 880, duration: 0.24, gain: 0.065, type: "triangle" },
};

/** Bounded, asset-free paper-click cues; every cue duplicates visible feedback. */
export class BorderlineSound {
  private context: AudioContext;
  private output: GainNode;
  private voices = new Set<OscillatorNode>();
  private destroyed = false;

  constructor(surface: BorderlineSurface) {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = surface === "host" ? 0.8 : 0.55;
  }

  unlock() {
    try {
      if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    } catch {
      // A partially implemented mobile AudioContext must not block controls.
    }
  }

  play(name: BorderlineCue) {
    if (this.destroyed || isAudioMuted() || this.voices.size >= 3) return;
    const cue = CUES[name];
    try {
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = cue.type;
      oscillator.frequency.setValueAtTime(cue.from, now);
      oscillator.frequency.exponentialRampToValueAtTime(cue.to, now + cue.duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(cue.gain, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + cue.duration);
      oscillator.connect(gain).connect(this.output);
      this.voices.add(oscillator);
      oscillator.onended = () => {
        this.voices.delete(oscillator);
        gain.disconnect();
      };
      oscillator.start(now);
      oscillator.stop(now + cue.duration + 0.02);
    } catch {
      // Audio is optional; visual and haptic feedback remain authoritative.
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const voice of this.voices) {
      try { voice.stop(); } catch { /* The short voice may already be finished. */ }
    }
    this.voices.clear();
    try { this.output.disconnect(); } catch { /* Partial WebAudio teardown is non-fatal. */ }
  }
}

/** Audio construction is optional: blocked or partial WebAudio cannot stop play. */
export function createBorderlineSound(surface: BorderlineSurface): BorderlineSound | null {
  if (typeof AudioContext === "undefined") return null;
  try {
    return new BorderlineSound(surface);
  } catch {
    return null;
  }
}
