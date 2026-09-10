import { audioBus, loadAudio, unlockAudio } from "../../audio";

const CUES = {
  countdown: "/audio/last-marble/countdown-tick.mp3",
  go: "/audio/last-marble/go-snap.mp3",
  crack: "/audio/last-marble/plate-crack.mp3",
  impact: "/audio/last-marble/marble-clack.mp3",
  fall: "/audio/last-marble/fall-pop.mp3",
  win: "/audio/last-marble/win-sting.mp3",
} as const;

type Cue = keyof typeof CUES;

export class LastMarbleSound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly active = new Map<Cue, number>();
  private destroyed = false;

  constructor(private readonly surface: "host" | "phone") {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = 1;
    void Promise.all(Object.values(CUES).map((path) => loadAudio(path))).catch(() => undefined);
  }

  unlock() {
    unlockAudio();
  }

  countdown() {
    this.play("countdown", 0.23, 1);
  }

  go() {
    this.play("go", 0.28, 1);
  }

  crack() {
    this.play("crack", 0.3, 1);
  }

  impact(intensity = 1) {
    const scaled = 0.72 + clamp(intensity, 0, 1) * 0.28;
    this.play("impact", (this.surface === "phone" ? 0.34 : 0.26) * scaled, this.surface === "phone" ? 1 : 3, 0.9 + 0.22 * scaled);
  }

  fall() {
    this.play("fall", this.surface === "phone" ? 0.34 : 0.27, this.surface === "phone" ? 1 : 2);
  }

  win(isMatch = false) {
    this.play("win", 0.3, 1, isMatch ? 1 : 1.08);
  }

  destroy() {
    this.destroyed = true;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
    }
    this.sources.clear();
    this.active.clear();
    this.output.disconnect();
  }

  private async play(cue: Cue, gainValue: number, maxVoices: number, playbackRate = 1) {
    if (this.destroyed || (this.active.get(cue) ?? 0) >= maxVoices) return;
    this.active.set(cue, (this.active.get(cue) ?? 0) + 1);
    try {
      const buffer = await loadAudio(CUES[cue]);
      if (this.destroyed) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;
      gain.gain.value = gainValue;
      source.connect(gain).connect(this.output);
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        this.active.set(cue, Math.max(0, (this.active.get(cue) ?? 1) - 1));
        gain.disconnect();
      };
      source.start();
    } catch {
      this.active.set(cue, Math.max(0, (this.active.get(cue) ?? 1) - 1));
      // Local audio is optional feedback; visual state remains authoritative.
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
