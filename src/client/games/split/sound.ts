import { audioBus, loadAudio } from "../../audio";

export type SplitCue = "countdown" | "go" | "cut" | "push" | "ko";

export interface SplitAudioFrame {
  t: "splitAudio";
  cue: SplitCue;
}

const FILES: Record<SplitCue, string> = {
  countdown: "/audio/split/countdown.mp3",
  go: "/audio/split/go.mp3",
  cut: "/audio/split/cut.mp3",
  push: "/audio/split/push.mp3",
  ko: "/audio/split/ko.mp3",
};

export function isSplitAudioFrame(value: unknown): value is SplitAudioFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<SplitAudioFrame>;
  return frame.t === "splitAudio" && typeof frame.cue === "string" && Object.hasOwn(FILES, frame.cue);
}

/** Optional local samples with an intentional, offline procedural fallback. */
export class SplitSound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private active = 0;
  private destroyed = false;

  constructor(private readonly surface: "host" | "phone") {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = surface === "host" ? 0.9 : 0.7;
    void Promise.allSettled(Object.values(FILES).map((path) => loadAudio(path)));
  }

  play(cue: SplitCue) {
    if (this.destroyed || this.active >= 3) return;
    this.active += 1;
    void this.playSample(cue)
      .catch(() => this.playFallback(cue))
      .finally(() => {
        this.active = Math.max(0, this.active - 1);
      });
  }

  destroy() {
    this.destroyed = true;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // A one-shot may already have ended.
      }
    }
    this.sources.clear();
    this.output.disconnect();
  }

  private async playSample(cue: SplitCue) {
    const buffer = await loadAudio(FILES[cue]);
    if (this.destroyed) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = this.surface === "host" ? 0.25 : 0.18;
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

  private playFallback(cue: SplitCue) {
    if (this.destroyed) return Promise.resolve();
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const settings: Record<SplitCue, { from: number; to: number; duration: number; type: OscillatorType; gain: number }> = {
      countdown: { from: 520, to: 360, duration: 0.11, type: "sine", gain: 0.1 },
      go: { from: 420, to: 880, duration: 0.28, type: "sine", gain: 0.12 },
      cut: { from: 190, to: 58, duration: 0.38, type: "square", gain: 0.1 },
      push: { from: 145, to: 80, duration: 0.24, type: "triangle", gain: 0.1 },
      ko: { from: 120, to: 42, duration: 0.3, type: "sine", gain: 0.13 },
    };
    const s = settings[cue];
    oscillator.type = s.type;
    oscillator.frequency.setValueAtTime(s.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(s.to, now + s.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(s.gain, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + s.duration);
    oscillator.connect(gain).connect(this.output);
    this.sources.add(oscillator);
    oscillator.start(now);
    oscillator.stop(now + s.duration + 0.02);
    return new Promise<void>((resolve) => {
      oscillator.onended = () => {
        this.sources.delete(oscillator);
        gain.disconnect();
        resolve();
      };
    });
  }
}
