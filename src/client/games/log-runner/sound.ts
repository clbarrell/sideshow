import { audioBus, loadAudio } from "../../audio";

export type LogRunnerCue = "countdown" | "go" | "warning" | "jump" | "duck" | "splash" | "throw" | "fake" | "finish";

export interface LogRunnerAudioFrame {
  t: "logRunnerAudio";
  cue: LogRunnerCue;
}

const CUES: LogRunnerCue[] = ["countdown", "go", "warning", "jump", "duck", "splash", "throw", "fake", "finish"];

// Samples can be added after a room mix playtest. Empty in the grey-box build
// so the browser never requests placeholder paths or venue-network assets.
const SAMPLE_FILES: Partial<Record<LogRunnerCue, string>> = {};

export function isLogRunnerAudioFrame(value: unknown): value is LogRunnerAudioFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<LogRunnerAudioFrame>;
  return frame.t === "logRunnerAudio" && typeof frame.cue === "string" && CUES.includes(frame.cue as LogRunnerCue);
}

/** Optional local samples backed by a complete offline procedural mix. */
export class LogRunnerSound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private active = 0;
  private destroyed = false;

  constructor(private readonly surface: "host" | "phone") {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = surface === "host" ? 0.86 : 0.66;
    void Promise.allSettled(Object.values(SAMPLE_FILES).map((path) => loadAudio(path)));
  }

  play(cue: LogRunnerCue) {
    if (this.destroyed) return;
    if (cue === "finish") {
      this.stopSources();
      this.active = 0;
    } else if (this.active >= 3) return;
    this.active += 1;
    void this.playSample(cue)
      .catch(() => this.playFallback(cue))
      .finally(() => { this.active = Math.max(0, this.active - 1); });
  }

  destroy() {
    this.destroyed = true;
    this.stopSources();
    this.output.disconnect();
  }

  private stopSources() {
    for (const source of this.sources) {
      try { source.stop(); } catch { /* one-shots may already be stopped */ }
    }
    this.sources.clear();
  }

  private async playSample(cue: LogRunnerCue) {
    const path = SAMPLE_FILES[cue];
    if (!path) throw new Error("Procedural cue selected");
    const buffer = await loadAudio(path);
    if (this.destroyed) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = this.surface === "host" ? 0.24 : 0.16;
    source.connect(gain).connect(this.output);
    this.sources.add(source);
    source.start();
    await new Promise<void>((resolve) => {
      source.onended = () => {
        this.sources.delete(source);
        gain.disconnect();
        resolve();
      };
    });
  }

  private playFallback(cue: LogRunnerCue) {
    if (this.destroyed) return Promise.resolve();
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const settings: Record<LogRunnerCue, { from: number; to: number; duration: number; type: OscillatorType; gain: number }> = {
      countdown: { from: 410, to: 260, duration: 0.11, type: "triangle", gain: 0.08 },
      go: { from: 340, to: 820, duration: 0.28, type: "sine", gain: 0.11 },
      warning: { from: 170, to: 118, duration: 0.2, type: "triangle", gain: 0.075 },
      jump: { from: 360, to: 660, duration: 0.13, type: "sine", gain: 0.06 },
      duck: { from: 290, to: 145, duration: 0.15, type: "triangle", gain: 0.055 },
      splash: { from: 150, to: 42, duration: 0.42, type: "sine", gain: 0.12 },
      throw: { from: 230, to: 440, duration: 0.28, type: "triangle", gain: 0.08 },
      fake: { from: 720, to: 980, duration: 0.2, type: "sine", gain: 0.045 },
      finish: { from: 260, to: 620, duration: 0.65, type: "triangle", gain: 0.12 },
    };
    const setting = settings[cue];
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
    return new Promise<void>((resolve) => {
      oscillator.onended = () => {
        this.sources.delete(oscillator);
        gain.disconnect();
        resolve();
      };
    });
  }
}
