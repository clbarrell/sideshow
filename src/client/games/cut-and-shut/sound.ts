import { audioBus } from "../../audio";

export type CutAndShutCue = "offer" | "stitch" | "fold" | "step" | "fail" | "result";

const SETTINGS: Record<CutAndShutCue, { from: number; to: number; duration: number; type: OscillatorType; gain: number }> = {
  offer: { from: 680, to: 470, duration: 0.12, type: "triangle", gain: 0.055 },
  stitch: { from: 430, to: 720, duration: 0.22, type: "square", gain: 0.075 },
  fold: { from: 180, to: 54, duration: 0.48, type: "sawtooth", gain: 0.07 },
  step: { from: 920, to: 610, duration: 0.08, type: "square", gain: 0.05 },
  fail: { from: 130, to: 42, duration: 0.28, type: "sine", gain: 0.08 },
  result: { from: 330, to: 660, duration: 0.45, type: "triangle", gain: 0.075 },
};

/** Offline, bounded Web Audio cues. No asset or network failure can block play. */
export class CutAndShutSound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly sources = new Set<OscillatorNode>();
  private destroyed = false;

  constructor() {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = 0.8;
  }

  play(cue: CutAndShutCue) {
    if (this.destroyed) return;
    if (cue === "fold") {
      for (const source of this.sources) {
        try { source.stop(); } catch { /* The cue may already have ended. */ }
      }
      this.sources.clear();
    } else if (this.sources.size >= 4) return;
    const setting = SETTINGS[cue];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = setting.type;
    oscillator.frequency.setValueAtTime(setting.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(setting.to, now + setting.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(setting.gain, now + 0.012);
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
    this.destroyed = true;
    for (const source of this.sources) {
      try { source.stop(); } catch { /* The cue may already have ended. */ }
    }
    this.sources.clear();
    this.output.disconnect();
  }
}
