import { audioBus, loadAudio } from "../../audio";
import { BORDERLINE_TUTORIAL_STEPS } from "./tutorial";

export type BorderlineCue = "commit" | "reveal" | "capture" | "score";

export const BORDERLINE_CUE_PATHS: Record<BorderlineCue, string> = {
  commit: "/audio/borderline/commit.mp3",
  reveal: "/audio/borderline/reveal.mp3",
  capture: "/audio/borderline/capture.mp3",
  score: "/audio/borderline/score.mp3",
};

export const BORDERLINE_TUTORIAL_PATHS = BORDERLINE_TUTORIAL_STEPS.map((_, index) => `/audio/borderline/tutorial-${index + 1}.mp3`);

const MAX_CUE_VOICES: Record<BorderlineCue, number> = { commit: 1, reveal: 1, capture: 4, score: 1 };
const CUE_GAIN: Record<BorderlineCue, number> = { commit: 0.18, reveal: 0.3, capture: 0.2, score: 0.24 };

export function isBorderlineCue(value: unknown): value is BorderlineCue {
  return typeof value === "string" && Object.hasOwn(BORDERLINE_CUE_PATHS, value);
}

/** Optional local samples with a short paper-like synth fallback. */
export class BorderlineSound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private readonly active = new Map<BorderlineCue, number>();
  private tutorialSource: AudioBufferSourceNode | null = null;
  private tutorialGain: GainNode | null = null;
  private tutorialGeneration = 0;
  private destroyed = false;

  constructor(private readonly surface: "host" | "phone") {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = surface === "host" ? 0.82 : 0.66;
    void Promise.allSettled(Object.values(BORDERLINE_CUE_PATHS).map((path) => loadAudio(path)));
    if (surface === "host") void Promise.allSettled(BORDERLINE_TUTORIAL_PATHS.map((path) => loadAudio(path)));
  }

  play(cue: BorderlineCue) {
    const pendingAndActive = [...this.active.values()].reduce((sum, count) => sum + count, 0);
    if (this.destroyed || (this.active.get(cue) ?? 0) >= MAX_CUE_VOICES[cue] || pendingAndActive >= 4 || this.sources.size >= 4) return;
    this.active.set(cue, (this.active.get(cue) ?? 0) + 1);
    void this.playSample(cue)
      .catch(() => this.playFallback(cue))
      .finally(() => this.active.set(cue, Math.max(0, (this.active.get(cue) ?? 1) - 1)));
  }

  playTutorial(step: number) {
    if (this.destroyed || this.surface !== "host" || !Number.isInteger(step) || !BORDERLINE_TUTORIAL_PATHS[step]) return;
    const generation = ++this.tutorialGeneration;
    const requestedAt = performance.now();
    this.stopTutorialSource();
    void loadAudio(BORDERLINE_TUTORIAL_PATHS[step]).then((buffer) => {
      if (this.destroyed || generation !== this.tutorialGeneration) return;
      const elapsed = Math.max(0, (performance.now() - requestedAt) / 1000);
      if (buffer.duration > BORDERLINE_TUTORIAL_STEPS[step].seconds - elapsed - 0.3) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      gain.gain.value = 0.78;
      source.connect(gain).connect(this.output);
      this.tutorialSource = source;
      this.tutorialGain = gain;
      source.onended = () => {
        if (this.tutorialSource !== source) return;
        this.tutorialSource = null;
        this.tutorialGain = null;
        gain.disconnect();
      };
      source.start();
    }).catch(() => { /* Spoken guidance is optional; the same rules stay visible. */ });
  }

  stopTutorial() {
    this.tutorialGeneration += 1;
    this.stopTutorialSource();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.tutorialGeneration += 1;
    this.stopTutorialSource();
    for (const source of this.sources) {
      try { source.stop(); } catch { /* A one-shot may already have ended. */ }
    }
    this.sources.clear();
    this.output.disconnect();
  }

  private stopTutorialSource() {
    const source = this.tutorialSource;
    const gain = this.tutorialGain;
    this.tutorialSource = null;
    this.tutorialGain = null;
    if (source) {
      source.onended = null;
      try { source.stop(); } catch { /* The prior line may already have ended. */ }
    }
    gain?.disconnect();
  }

  private async playSample(cue: BorderlineCue) {
    const buffer = await loadAudio(BORDERLINE_CUE_PATHS[cue]);
    if (this.destroyed || this.sources.size >= 4) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = CUE_GAIN[cue] * (this.surface === "phone" ? 0.82 : 1);
    source.connect(gain).connect(this.output);
    this.register(source, gain);
    source.start();
  }

  private playFallback(cue: BorderlineCue) {
    if (this.destroyed || this.sources.size >= 4) return;
    const settings: Record<BorderlineCue, { from: number; to: number; duration: number; gain: number; type: OscillatorType }> = {
      commit: { from: 480, to: 350, duration: 0.09, gain: 0.026, type: "triangle" },
      reveal: { from: 180, to: 520, duration: 0.2, gain: 0.05, type: "triangle" },
      capture: { from: 140, to: 74, duration: 0.16, gain: 0.045, type: "sine" },
      score: { from: 390, to: 590, duration: 0.13, gain: 0.035, type: "sine" },
    };
    const setting = settings[cue];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = setting.type;
    oscillator.frequency.setValueAtTime(setting.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(setting.to, now + setting.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(setting.gain, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + setting.duration);
    oscillator.connect(gain).connect(this.output);
    this.register(oscillator, gain);
    oscillator.start(now);
    oscillator.stop(now + setting.duration + 0.02);
  }

  private register(source: AudioScheduledSourceNode, gain: GainNode) {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      gain.disconnect();
    };
  }
}
