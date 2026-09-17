import { audioBus, loadAudio } from "../../audio";
import type { GetawayCue } from "./protocol";

type ProductionCue = Extract<GetawayCue, "countdown" | "go" | "pickup" | "shove" | "spill" | "deposit" | "vault" | "finish">;
type CuePriority = "medium" | "high" | "critical";

interface CueSetting {
  path: string;
  duration: number;
  gain: number;
  maxVoices: number;
  priority: CuePriority;
  duckDb?: number;
  fallback: { from: number; to: number; type: OscillatorType };
}

interface VoiceClaim { id: number; cue: ProductionCue; priority: CuePriority }

export const GETAWAY_CUE_PATHS: Record<ProductionCue, string> = {
  countdown: "/audio/getaway/countdown.mp3",
  go: "/audio/getaway/go.mp3",
  pickup: "/audio/getaway/pickup.mp3",
  shove: "/audio/getaway/shove.mp3",
  spill: "/audio/getaway/spill.mp3",
  deposit: "/audio/getaway/deposit.mp3",
  vault: "/audio/getaway/vault.mp3",
  finish: "/audio/getaway/finish.mp3",
};

const SETTINGS: Record<ProductionCue, CueSetting> = {
  countdown: cue("countdown", .5, .11, 1, "high", 520, 340, "triangle"),
  go: cue("go", .7, .16, 1, "critical", 260, 760, "triangle", 3),
  pickup: cue("pickup", .5, .09, 3, "medium", 360, 680, "sine"),
  shove: cue("shove", .5, .08, 2, "medium", 180, 72, "triangle"),
  spill: cue("spill", .65, .14, 3, "high", 160, 58, "triangle", 2),
  deposit: cue("deposit", .8, .16, 2, "critical", 280, 720, "sine", 3),
  vault: cue("vault", .9, .17, 1, "critical", 118, 46, "square", 4),
  finish: cue("finish", 1, .18, 1, "critical", 240, 620, "triangle"),
};

const MAX_VOICES = 5;

/** Local sample mix with capped voices and an offline decode-failure fallback. */
export class GetawaySound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly actionBus: GainNode;
  private readonly priorityBus: GainNode;
  private readonly sources = new Map<AudioScheduledSourceNode, { claimId: number; gain: GainNode }>();
  private readonly claims = new Map<number, VoiceClaim>();
  private readonly buffers = new Map<ProductionCue, AudioBuffer>();
  private nextClaimId = 1;
  private destroyed = false;

  constructor(private readonly surface: "host" | "phone") {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = surface === "host" ? .88 : .64;
    this.actionBus = this.context.createGain();
    this.priorityBus = this.context.createGain();
    this.actionBus.gain.value = 1;
    this.priorityBus.gain.value = 1;
    this.actionBus.connect(this.output);
    this.priorityBus.connect(this.output);
    for (const [cueName, path] of Object.entries(GETAWAY_CUE_PATHS) as Array<[ProductionCue, string]>) {
      void loadAudio(path).then((buffer) => {
        if (!this.destroyed) this.buffers.set(cueName, buffer);
      }).catch(() => undefined);
    }
  }

  play(cueName: GetawayCue) {
    if (this.destroyed || !Object.hasOwn(SETTINGS, cueName)) return;
    if (this.context.state !== "running") {
      if (cueName === "finish") this.stopSources();
      return;
    }
    const name = cueName as ProductionCue;
    const setting = SETTINGS[name];
    if (name === "finish") {
      this.stopSources();
    } else {
      if (this.cueVoiceCount(name) >= setting.maxVoices) return;
      if (this.claims.size >= MAX_VOICES && !this.preemptLowerPriority(setting.priority)) return;
    }
    const claim = { id: this.nextClaimId++, cue: name, priority: setting.priority };
    this.claims.set(claim.id, claim);
    const buffer = this.buffers.get(name);
    if (buffer) {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      this.startSource(claim, source, setting, buffer.duration);
    } else {
      this.playFallback(claim, setting);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.buffers.clear();
    this.stopSources();
    this.actionBus.disconnect();
    this.priorityBus.disconnect();
    this.output.disconnect();
  }

  private playFallback(claim: VoiceClaim, setting: CueSetting) {
    try {
      const source = this.context.createOscillator();
      const now = this.context.currentTime;
      source.type = setting.fallback.type;
      source.frequency.setValueAtTime(setting.fallback.from, now);
      source.frequency.exponentialRampToValueAtTime(setting.fallback.to, now + setting.duration);
      this.startSource(claim, source, setting, setting.duration, true);
    } catch {
      this.claims.delete(claim.id);
    }
  }

  private startSource(claim: VoiceClaim, source: AudioScheduledSourceNode, setting: CueSetting, duration: number, fallback = false) {
    const now = this.context.currentTime;
    const gain = this.context.createGain();
    const level = setting.gain * (this.surface === "host" ? 1 : .8) * (fallback ? .68 : 1);
    const tail = Math.max(.014, Math.min(.05, duration * .16));
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + .008);
    gain.gain.setValueAtTime(level, now + Math.max(.008, duration - tail));
    gain.gain.linearRampToValueAtTime(.0001, now + duration);
    source.connect(gain).connect(setting.priority === "critical" ? this.priorityBus : this.actionBus);
    this.sources.set(source, { claimId: claim.id, gain });
    source.onended = () => this.finishSource(source);
    if (setting.duckDb) this.duckAction(setting.duckDb, duration);
    source.start(now);
    if (fallback) source.stop(now + duration + .02);
  }

  private finishSource(source: AudioScheduledSourceNode) {
    const active = this.sources.get(source);
    if (!active) return;
    this.sources.delete(source);
    active.gain.disconnect();
    this.claims.delete(active.claimId);
  }

  private stopSources() {
    for (const [source, active] of this.sources) {
      try { source.stop(); } catch { /* A short cue may already have ended. */ }
      active.gain.disconnect();
    }
    this.sources.clear();
    this.claims.clear();
  }

  private duckAction(db: number, duration: number) {
    const now = this.context.currentTime;
    const ducked = 10 ** (-db / 20);
    this.actionBus.gain.cancelScheduledValues(now);
    this.actionBus.gain.setTargetAtTime(ducked, now, .012);
    this.actionBus.gain.setTargetAtTime(1, now + duration, .06);
  }

  private cueVoiceCount(cueName: ProductionCue) {
    let count = 0;
    for (const claim of this.claims.values()) if (claim.cue === cueName) count += 1;
    return count;
  }

  private preemptLowerPriority(priority: CuePriority) {
    const rank: Record<CuePriority, number> = { medium: 0, high: 1, critical: 2 };
    const victim = [...this.claims.values()]
      .filter((claim) => rank[claim.priority] < rank[priority])
      .sort((a, b) => rank[a.priority] - rank[b.priority] || a.id - b.id)[0];
    if (!victim) return false;
    this.claims.delete(victim.id);
    for (const [source, active] of this.sources) {
      if (active.claimId !== victim.id) continue;
      this.sources.delete(source);
      try { source.stop(); } catch { /* The replaced cue may already have ended. */ }
      active.gain.disconnect();
      break;
    }
    return true;
  }
}

function cue(name: ProductionCue, duration: number, gain: number, maxVoices: number, priority: CuePriority, from: number, to: number, type: OscillatorType, duckDb?: number): CueSetting {
  return { path: GETAWAY_CUE_PATHS[name], duration, gain, maxVoices, priority, duckDb, fallback: { from, to, type } };
}
