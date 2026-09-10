import { audioBus, loadAudio } from "../../audio";

export type TheGunCue =
  | "countdown"
  | "go"
  | "warning"
  | "drop"
  | "pickup"
  | "shot"
  | "reload"
  | "empty"
  | "shove"
  | "death"
  | "respawn"
  | "finish";

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

interface VoiceClaim {
  id: number;
  cue: TheGunCue;
  priority: CuePriority;
}

export const THE_GUN_CUE_PATHS: Record<TheGunCue, string> = {
  countdown: "/audio/the-gun/countdown.mp3",
  go: "/audio/the-gun/go.mp3",
  warning: "/audio/the-gun/warning.mp3",
  drop: "/audio/the-gun/drop.mp3",
  pickup: "/audio/the-gun/pickup.mp3",
  shot: "/audio/the-gun/shot.mp3",
  reload: "/audio/the-gun/reload.mp3",
  empty: "/audio/the-gun/empty.mp3",
  shove: "/audio/the-gun/shove.mp3",
  death: "/audio/the-gun/death.mp3",
  respawn: "/audio/the-gun/respawn.mp3",
  finish: "/audio/the-gun/finish.mp3",
};

const SETTINGS: Record<TheGunCue, CueSetting> = {
  countdown: cue("countdown", 0.48, 0.12, 1, "high", 590, 380, "triangle"),
  go: cue("go", 0.48, 0.18, 1, "critical", 330, 820, "triangle", 3),
  warning: cue("warning", 0.48, 0.13, 1, "high", 740, 510, "square"),
  drop: cue("drop", 0.48, 0.2, 1, "critical", 150, 42, "triangle", 3),
  pickup: cue("pickup", 0.48, 0.2, 1, "critical", 240, 690, "sawtooth", 4),
  shot: cue("shot", 0.48, 0.19, 2, "critical", 210, 48, "square", 4),
  reload: cue("reload", 0.48, 0.12, 1, "high", 470, 710, "triangle"),
  empty: cue("empty", 0.48, 0.08, 1, "medium", 190, 125, "square"),
  shove: cue("shove", 0.48, 0.11, 3, "medium", 135, 62, "triangle"),
  death: cue("death", 0.48, 0.16, 2, "critical", 260, 55, "sawtooth"),
  respawn: cue("respawn", 0.48, 0.1, 2, "high", 310, 770, "sine"),
  finish: cue("finish", 0.8, 0.2, 1, "critical", 250, 620, "triangle"),
};

const MAX_VOICES = 6;

/** Local sample mix with bounded voices and a procedural decode-failure fallback. */
export class TheGunSound {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly actionBus: GainNode;
  private readonly priorityBus: GainNode;
  private readonly sources = new Map<AudioScheduledSourceNode, { claimId: number; gain: GainNode }>();
  private readonly claims = new Map<number, VoiceClaim>();
  private nextClaimId = 1;
  private generation = 0;
  private destroyed = false;

  constructor(private readonly surface: "host" | "phone") {
    const bus = audioBus();
    this.context = bus.context;
    this.output = bus.gain;
    this.output.gain.value = surface === "host" ? 0.88 : 0.66;
    this.actionBus = this.context.createGain();
    this.priorityBus = this.context.createGain();
    this.actionBus.gain.value = 1;
    this.priorityBus.gain.value = 1;
    this.actionBus.connect(this.output);
    this.priorityBus.connect(this.output);
    for (const path of Object.values(THE_GUN_CUE_PATHS)) void loadAudio(path).catch(() => undefined);
  }

  play(cueName: TheGunCue) {
    if (this.destroyed || !Object.hasOwn(SETTINGS, cueName)) return;
    if (cueName === "finish") {
      this.generation += 1;
      this.stopSources();
    } else {
      const setting = SETTINGS[cueName];
      if (this.cueVoiceCount(cueName) >= setting.maxVoices) return;
      if (this.claims.size >= MAX_VOICES && !this.preemptLowerPriority(setting.priority)) return;
    }
    const generation = this.generation;
    const claim = { id: this.nextClaimId++, cue: cueName, priority: SETTINGS[cueName].priority };
    this.claims.set(claim.id, claim);
    void this.playLoaded(claim, generation);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.stopSources();
    this.actionBus.disconnect();
    this.priorityBus.disconnect();
    this.output.disconnect();
  }

  private async playLoaded(claim: VoiceClaim, generation: number) {
    const setting = SETTINGS[claim.cue];
    try {
      const buffer = await loadAudio(setting.path);
      if (!this.canStart(claim.id, generation)) return;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      this.startSource(claim, source, setting, buffer.duration);
    } catch {
      if (!this.canStart(claim.id, generation)) return;
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
  }

  private startSource(claim: VoiceClaim, source: AudioScheduledSourceNode, setting: CueSetting, duration: number, fallback = false) {
    const now = this.context.currentTime;
    const gain = this.context.createGain();
    const surfaceGain = this.surface === "host" ? 1 : 0.82;
    const level = setting.gain * surfaceGain * (fallback ? 0.72 : 1);
    const tail = Math.max(0.012, Math.min(0.04, duration * 0.18));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.008);
    gain.gain.setValueAtTime(level, now + Math.max(0.008, duration - tail));
    gain.gain.linearRampToValueAtTime(0.0001, now + duration);
    source.connect(gain).connect(setting.priority === "critical" ? this.priorityBus : this.actionBus);
    this.sources.set(source, { claimId: claim.id, gain });
    source.onended = () => this.finishSource(source);
    if (setting.duckDb) this.duckAction(setting.duckDb, duration);
    source.start(now);
    if (fallback) source.stop(now + duration + 0.02);
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
      try { source.stop(); } catch { /* The short cue may already have ended. */ }
      active.gain.disconnect();
    }
    this.sources.clear();
    this.claims.clear();
  }

  private duckAction(db: number, duration: number) {
    const now = this.context.currentTime;
    const ducked = 10 ** (-db / 20);
    this.actionBus.gain.cancelScheduledValues(now);
    this.actionBus.gain.setTargetAtTime(ducked, now, 0.012);
    this.actionBus.gain.setTargetAtTime(1, now + duration, 0.06);
  }

  private canStart(claimId: number, generation: number) {
    return !this.destroyed && generation === this.generation && this.claims.has(claimId);
  }

  private cueVoiceCount(cueName: TheGunCue) {
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

function cue(
  name: TheGunCue,
  duration: number,
  gain: number,
  maxVoices: number,
  priority: CuePriority,
  from: number,
  to: number,
  type: OscillatorType,
  duckDb?: number,
): CueSetting {
  return { path: THE_GUN_CUE_PATHS[name], duration, gain, maxVoices, priority, duckDb, fallback: { from, to, type } };
}
