import { audioBus } from "../../audio";

export type TheGunCue =
  | "countdown"
  | "go"
  | "warning"
  | "drop"
  | "pickup"
  | "shot"
  | "reload"
  | "empty"
  | "shove"
  | "death"
  | "respawn"
  | "finish";

interface CueSetting {
  from: number;
  to: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

const SETTINGS: Record<TheGunCue, CueSetting> = {
  countdown: { from: 590, to: 380, duration: 0.11, type: "triangle", gain: 0.075 },
  go: { from: 330, to: 820, duration: 0.34, type: "triangle", gain: 0.11 },
  warning: { from: 740, to: 510, duration: 0.25, type: "square", gain: 0.055 },
  drop: { from: 150, to: 42, duration: 0.44, type: "triangle", gain: 0.12 },
  pickup: { from: 240, to: 690, duration: 0.38, type: "sawtooth", gain: 0.075 },
  shot: { from: 210, to: 48, duration: 0.26, type: "square", gain: 0.095 },
  reload: { from: 470, to: 710, duration: 0.22, type: "triangle", gain: 0.065 },
  empty: { from: 190, to: 125, duration: 0.09, type: "square", gain: 0.045 },
  shove: { from: 135, to: 62, duration: 0.19, type: "triangle", gain: 0.075 },
  death: { from: 260, to: 55, duration: 0.43, type: "sawtooth", gain: 0.085 },
  respawn: { from: 310, to: 770, duration: 0.27, type: "sine", gain: 0.07 },
  finish: { from: 250, to: 620, duration: 0.72, type: "triangle", gain: 0.11 },
};

const MAX_VOICES = 4;

/** A complete offline mix with bounded voices and no venue-network dependency. */
export class TheGunSound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly sources = new Set<OscillatorNode>();
  private destroyed = false;

  constructor(private readonly surface: "host" | "phone") {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = surface === "host" ? 0.88 : 0.66;
  }

  play(cue: TheGunCue) {
    if (this.destroyed || !Object.hasOwn(SETTINGS, cue)) return;

    // The finish sting owns the mix. Other bursts remain bounded so a ten-phone
    // pile-up cannot grow audio nodes without limit.
    if (cue === "finish") this.stopSources();
    else if (this.sources.size >= MAX_VOICES) return;

    const setting = SETTINGS[cue];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const level = setting.gain * (this.surface === "host" ? 1 : 0.82);

    oscillator.type = setting.type;
    oscillator.frequency.setValueAtTime(setting.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(setting.to, now + setting.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + setting.duration);
    oscillator.connect(gain).connect(this.output);
    this.sources.add(oscillator);
    oscillator.start(now);
    oscillator.stop(now + setting.duration + 0.02);
    oscillator.onended = () => {
      this.sources.delete(oscillator);
      gain.disconnect();
    };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopSources();
    this.output.disconnect();
  }

  private stopSources() {
    for (const source of this.sources) {
      try { source.stop(); } catch { /* A short cue may already have ended. */ }
    }
    this.sources.clear();
  }
}
