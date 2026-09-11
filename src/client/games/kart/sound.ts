import { audioBus, loadAudio, unlockAudio } from "../../audio";

const ENGINE = "/audio/kart/engine-loop.mp3";
const CRASH = "/audio/kart/crash.mp3";
const BOOST = "/audio/kart/boost.mp3";
const MUSIC = "/audio/kart/race-theme.mp3";

export interface KartAudioFrame {
  t: "kartAudio";
  speed: number;
  boost?: true;
  crash?: number;
  ready?: boolean;
  recharge?: number;
  lap?: number;
  finished?: boolean;
  racing?: boolean;
}

export function isKartAudioFrame(value: unknown): value is KartAudioFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<KartAudioFrame>;
  return frame.t === "kartAudio" && typeof frame.speed === "number";
}

export class KartSound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private engineGain: GainNode | null = null;
  private engineSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private activeEffects = 0;
  private speed = 0;
  private destroyed = false;

  constructor(private readonly surface: "host" | "phone") {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = 1;
    // Warm one-shots during the long pre-race countdown so the first impact
    // never waits on a network request or decode on a slower phone.
    void Promise.all([loadAudio(CRASH), loadAudio(BOOST)]).catch(() => undefined);
    void this.startEngine();
    if (surface === "host") void this.startMusic();
  }

  unlock() {
    unlockAudio();
  }

  setSpeed(value: number) {
    this.speed = clamp(value, 0, 1);
    if (!this.engineGain) return;
    const now = this.context.currentTime;
    const audibleSpeed = Math.max(0, (this.speed - 0.025) / 0.975);
    const maxGain = this.surface === "phone" ? 0.2 : 0.1;
    this.engineGain.gain.setTargetAtTime(audibleSpeed * maxGain, now, 0.08);
    this.engineSource?.playbackRate.setTargetAtTime(0.72 + this.speed * 0.73, now, 0.1);
  }

  boost() {
    this.playOneShot(
      BOOST,
      this.surface === "phone" ? 0.46 : 0.27,
      2,
      { attack: 0.14, release: 0.32 },
    );
    this.duckMusic();
  }

  crash(intensity = 1) {
    const scaled = 0.65 + clamp(intensity, 0, 1) * 0.35;
    this.playOneShot(CRASH, (this.surface === "phone" ? 0.55 : 0.36) * scaled, this.surface === "phone" ? 1 : 3);
    this.duckMusic();
  }

  destroy() {
    this.destroyed = true;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();
    this.output.disconnect();
  }

  private async startEngine() {
    try {
      const buffer = await loadAudio(ENGINE);
      if (this.destroyed) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(this.output);
      source.start();
      this.sources.add(source);
      this.engineGain = gain;
      this.engineSource = source;
      this.setSpeed(this.speed);
    } catch {
      // Sound is enhancement; a missing asset must never stop a race.
    }
  }

  private async startMusic() {
    try {
      const buffer = await loadAudio(MUSIC);
      if (this.destroyed) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0.22;
      source.connect(gain).connect(this.output);
      source.start();
      this.sources.add(source);
      this.musicGain = gain;
    } catch {
      // Keep the race playable offline or when decoding is unavailable.
    }
  }

  private async playOneShot(
    path: string,
    gainValue: number,
    maxVoices: number,
    envelope?: { attack: number; release: number },
  ) {
    if (this.destroyed || this.activeEffects >= maxVoices) return;
    this.activeEffects += 1;
    try {
      const buffer = await loadAudio(path);
      if (this.destroyed) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      if (envelope) {
        const now = this.context.currentTime;
        const end = now + buffer.duration;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(gainValue, now + envelope.attack);
        gain.gain.setValueAtTime(gainValue, Math.max(now + envelope.attack, end - envelope.release));
        gain.gain.linearRampToValueAtTime(0.0001, end);
      } else {
        gain.gain.value = gainValue;
      }
      source.connect(gain).connect(this.output);
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        this.activeEffects = Math.max(0, this.activeEffects - 1);
        gain.disconnect();
      };
      source.start();
    } catch {
      this.activeEffects = Math.max(0, this.activeEffects - 1);
    }
  }

  private duckMusic() {
    if (!this.musicGain) return;
    const now = this.context.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(0.15, now, 0.025);
    this.musicGain.gain.setTargetAtTime(0.22, now + 0.3, 0.16);
  }
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}
