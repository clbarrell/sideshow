import { audioBus, loadAudio } from "../../audio";

const CUES = {
  flap: "/audio/joust/flap.mp3",
  bump: "/audio/joust/bump.mp3",
  crack: "/audio/joust/crack.mp3",
  egg: "/audio/joust/egg-result.mp3",
  music: "/audio/joust/championship-bed.mp3",
} as const;

export interface JoustAudioFrame {
  t: "joustAudio";
  bump?: true;
  crack?: true;
  respawn?: true;
  egg?: "reclaim" | "steal";
}

export function isJoustAudioFrame(value: unknown): value is JoustAudioFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<JoustAudioFrame>;
  return frame.t === "joustAudio" &&
    (frame.bump === undefined || frame.bump === true) &&
    (frame.crack === undefined || frame.crack === true) &&
    (frame.respawn === undefined || frame.respawn === true) &&
    (frame.egg === undefined || frame.egg === "reclaim" || frame.egg === "steal");
}

export class JoustSound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly voices = new Map<keyof typeof CUES, number>();
  private musicGain: GainNode | null = null;
  private destroyed = false;

  constructor(private readonly surface: "host" | "phone") {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = 1;
    const preload = surface === "host" ? Object.values(CUES) : [CUES.flap, CUES.bump, CUES.crack, CUES.egg];
    void Promise.all(preload.map((path) => loadAudio(path))).catch(() => undefined);
    if (surface === "host") void this.startMusic();
  }

  flap() { this.oneShot("flap", this.surface === "phone" ? 0.22 : 0.07, this.surface === "phone" ? 1 : 3); }
  bump() { this.oneShot("bump", this.surface === "phone" ? 0.36 : 0.18, this.surface === "phone" ? 2 : 3); }
  crack() { this.oneShot("crack", this.surface === "phone" ? 0.48 : 0.3, this.surface === "phone" ? 1 : 3); this.duck(); }
  round() { this.oneShot("egg", this.surface === "phone" ? 0.4 : 0.32, 1); this.duck(); }
  egg(kind: "reclaim" | "steal") {
    this.oneShot("egg", this.surface === "phone" ? 0.52 : kind === "steal" ? 0.38 : 0.3, 2, kind === "steal" ? 1.08 : 0.88);
    this.duck();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const source of this.sources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.sources.clear();
    this.voices.clear();
    this.musicGain?.disconnect();
    this.output.disconnect();
  }

  private async startMusic() {
    try {
      const buffer = await loadAudio(CUES.music);
      if (this.destroyed) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      const now = this.context.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.25);
      source.connect(gain).connect(this.output);
      source.start();
      this.sources.add(source);
      this.musicGain = gain;
      source.onended = () => this.sources.delete(source);
    } catch { /* a silent championship is still playable */ }
  }

  private async oneShot(cue: keyof typeof CUES, gainValue: number, maxVoices: number, rate = 1) {
    if (this.destroyed || (this.voices.get(cue) ?? 0) >= maxVoices) return;
    this.voices.set(cue, (this.voices.get(cue) ?? 0) + 1);
    try {
      const buffer = await loadAudio(CUES[cue]);
      if (this.destroyed) { this.releaseVoice(cue); return; }
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const now = this.context.currentTime;
      const duration = buffer.duration / rate;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(gainValue, now + 0.008);
      gain.gain.setValueAtTime(gainValue, now + Math.max(0.008, duration - 0.04));
      gain.gain.linearRampToValueAtTime(0, now + duration);
      source.connect(gain).connect(this.output);
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        this.releaseVoice(cue);
        gain.disconnect();
      };
      source.start();
    } catch { this.releaseVoice(cue); }
  }

  private releaseVoice(cue: keyof typeof CUES) {
    this.voices.set(cue, Math.max(0, (this.voices.get(cue) ?? 1) - 1));
  }

  private duck() {
    if (!this.musicGain) return;
    const now = this.context.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(0.1, now, 0.02);
    this.musicGain.gain.setTargetAtTime(0.16, now + 0.35, 0.14);
  }
}
