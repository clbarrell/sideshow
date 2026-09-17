import { audioBus, loadAudio } from "../../audio";

export type DragCue = "launch" | "go" | "lunge" | "eat" | "warning" | "burst" | "respawn" | "finish";

export interface DragAudioFrame {
  t: "dragAudio";
  cue: DragCue;
}

export const DRAG_CUE_PATHS: Record<DragCue, string> = {
  launch: "/audio/drag/launch.mp3",
  go: "/audio/drag/go.mp3",
  lunge: "/audio/drag/lunge.mp3",
  eat: "/audio/drag/eat.mp3",
  warning: "/audio/drag/warning.mp3",
  burst: "/audio/drag/respawn.mp3",
  respawn: "/audio/drag/respawn.mp3",
  finish: "/audio/drag/finish.mp3",
};

const MAX_VOICES: Record<DragCue, number> = {
  launch: 1, go: 1, lunge: 3, eat: 4, warning: 2, burst: 2, respawn: 2, finish: 1,
};
const PRIORITY: Record<DragCue, number> = {
  launch: 1, lunge: 1, eat: 1, warning: 2, burst: 3, respawn: 3, go: 4, finish: 4,
};
const SAMPLE_NORMALIZATION: Record<DragCue, number> = {
  launch: .8, go: 7, lunge: .8, eat: 8, warning: .8, burst: .8, respawn: .8, finish: .8,
};

export function isDragCue(value: unknown): value is DragCue {
  return typeof value === "string" && Object.hasOwn(DRAG_CUE_PATHS, value);
}

export function isDragAudioFrame(value: unknown): value is DragAudioFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<DragAudioFrame>;
  return frame.t === "dragAudio" && isDragCue(frame.cue);
}

/** Optional local samples backed by quiet procedural cues for missing assets/offline play. */
export class DragSound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly sources = new Map<AudioScheduledSourceNode, DragCue>();
  private readonly active = new Map<DragCue, number>();
  private priorityEpoch = 0;
  private destroyed = false;

  constructor(private readonly surface: "host" | "phone") {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = surface === "host" ? 0.9 : 0.75;
    void Promise.allSettled([...new Set(Object.values(DRAG_CUE_PATHS))].map((path) => loadAudio(path)));
  }

  play(cue: DragCue) {
    if (this.destroyed || (this.active.get(cue) ?? 0) >= MAX_VOICES[cue]) return;
    const totalActive = [...this.active.values()].reduce((sum, count) => sum + count, 0);
    if (PRIORITY[cue] >= 2) {
      this.priorityEpoch += 1;
      for (const [source, activeCue] of this.sources) {
        if (PRIORITY[activeCue] >= PRIORITY[cue]) continue;
        try { source.stop(); } catch { /* It may have ended between frames. */ }
      }
    } else if (totalActive >= 6) return;
    const epoch = this.priorityEpoch;
    this.active.set(cue, (this.active.get(cue) ?? 0) + 1);
    void this.playSample(cue, epoch)
      .catch(() => this.playFallback(cue, epoch))
      .finally(() => this.active.set(cue, Math.max(0, (this.active.get(cue) ?? 1) - 1)));
  }

  destroy() {
    this.destroyed = true;
    for (const source of this.sources.keys()) {
      try { source.stop(); } catch { /* A one-shot may already have ended. */ }
    }
    this.sources.clear();
    this.output.disconnect();
  }

  private async playSample(cue: DragCue, epoch: number) {
    const buffer = await loadAudio(DRAG_CUE_PATHS[cue]);
    if (this.destroyed || epoch !== this.priorityEpoch) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = cue === "burst" ? 0.72 : 1;
    const hostGain: Record<DragCue, number> = { launch: .22, go: .34, lunge: .2, eat: .12, warning: .25, burst: .27, respawn: .27, finish: .36 };
    const phoneGain: Record<DragCue, number> = { launch: .14, go: .24, lunge: .28, eat: .18, warning: .25, burst: .24, respawn: .24, finish: .28 };
    gain.gain.value = (this.surface === "host" ? hostGain : phoneGain)[cue] * SAMPLE_NORMALIZATION[cue];
    source.connect(gain).connect(this.output);
    this.sources.set(source, cue);
    source.start();
    await new Promise<void>((resolve) => {
      source.onended = () => {
        this.sources.delete(source);
        gain.disconnect();
        resolve();
      };
    });
  }

  private playFallback(cue: DragCue, epoch: number) {
    if (this.destroyed || epoch !== this.priorityEpoch) return Promise.resolve();
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const settings: Record<DragCue, { from: number; to: number; duration: number; type: OscillatorType; gain: number }> = {
      launch: { from: 150, to: 280, duration: .55, type: "sine", gain: .07 },
      go: { from: 390, to: 880, duration: .34, type: "triangle", gain: .13 },
      lunge: { from: 310, to: 110, duration: .2, type: "triangle", gain: .08 },
      eat: { from: 420, to: 250, duration: .1, type: "sine", gain: .06 },
      warning: { from: 620, to: 760, duration: .22, type: "square", gain: .075 },
      burst: { from: 170, to: 54, duration: .35, type: "sine", gain: .11 },
      respawn: { from: 250, to: 610, duration: .38, type: "sine", gain: .09 },
      finish: { from: 210, to: 92, duration: .55, type: "triangle", gain: .12 },
    };
    const s = settings[cue];
    oscillator.type = s.type;
    oscillator.frequency.setValueAtTime(s.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(s.to, now + s.duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(s.gain, now + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, now + s.duration);
    oscillator.connect(gain).connect(this.output);
    this.sources.set(oscillator, cue);
    oscillator.start(now);
    oscillator.stop(now + s.duration + .02);
    return new Promise<void>((resolve) => {
      oscillator.onended = () => {
        this.sources.delete(oscillator);
        gain.disconnect();
        resolve();
      };
    });
  }
}
