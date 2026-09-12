import { audioBus } from "../../audio";

export type WarCue = "ready" | "countdown" | "go" | "arrow" | "thrust" | "block" | "hit" | "banner" | "respawn" | "victory";

export interface WarAudioFrame { t: "warAudio"; cue: WarCue }
const CUES = new Set<WarCue>(["ready", "countdown", "go", "arrow", "thrust", "block", "hit", "banner", "respawn", "victory"]);

export function isWarCue(value: unknown): value is WarCue { return typeof value === "string" && CUES.has(value as WarCue); }
export function isWarAudioFrame(value: unknown): value is WarAudioFrame {
  return !!value && typeof value === "object" && !Array.isArray(value) && (value as WarAudioFrame).t === "warAudio" && isWarCue((value as WarAudioFrame).cue);
}

export class WarSound {
  private context: AudioContext;
  private output: GainNode;
  private sources = new Set<OscillatorNode>();
  private active = 0;
  private destroyed = false;

  constructor(private surface: "host" | "phone") {
    const bus = audioBus(); this.context = bus.context; this.output = bus.gain;
  }

  play(cue: WarCue) {
    if (this.destroyed || this.active >= 3) return;
    const settings: Record<WarCue, [number, number, number, OscillatorType]> = {
      ready: [390, 610, .08, "sine"], countdown: [170, 125, .1, "triangle"], go: [330, 760, .28, "sawtooth"],
      arrow: [520, 180, .14, "triangle"], thrust: [145, 72, .12, "square"], block: [1250, 620, .18, "sine"],
      hit: [150, 48, .2, "sawtooth"], banner: [440, 660, .26, "triangle"], respawn: [280, 720, .2, "sine"], victory: [330, 990, .55, "triangle"],
    };
    const [from, to, duration, type] = settings[cue];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator(); const gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(from, now); oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(this.surface === "host" ? .075 : .052, now + .012); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(this.output); this.sources.add(oscillator); this.active++;
    oscillator.onended = () => { this.sources.delete(oscillator); this.active--; gain.disconnect(); };
    oscillator.start(now); oscillator.stop(now + duration + .02);
  }

  destroy() { this.destroyed = true; for (const source of this.sources) { try { source.stop(); } catch { /* ended */ } } this.sources.clear(); }
}
