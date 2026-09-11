import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";
import { SplitSound, type SplitAudioFrame, type SplitCue } from "./sound";

export const SPLIT_RULES = {
  roundSeconds: 55,
  graceSeconds: 10,
  acquireSeconds: 0.7,
  cutSeconds: 4,
  linkEnter: 172,
  linkExit: 204,
  disconnectSeconds: 3,
  areaShrink: 0.82,
  dimensionFloor: Math.sqrt(0.28),
  edgeCooldown: 4.5,
  riftWarning: 4,
  riftInterval: 10,
  firstRift: 16,
} as const;

const INITIAL_W = 1000;
const INITIAL_H = 562;
const PLAYER_RADIUS = 20;
const MOVE_SPEED = 188;
const EDGE_KO_POINTS = 2;
const WINNER_BONUS = 3;
const SEGMENT_NAMES = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"] as const;

export interface SplitInput {
  x: number;
  y: number;
}

export interface SplitPhoneFrame {
  t: "splitState";
  role: "survivor" | "edge";
  phase: "grace" | "live" | "cut" | "result";
  status: string;
  remaining: number;
  grace: number;
  cut: number | null;
  target: string | null;
  cooldown: number;
  queued: boolean;
  connected: boolean;
  score?: number;
  rift?: number | null;
}

export interface SplitPhoneFrames {
  t: "splitStates";
  frames: Record<string, SplitPhoneFrame>;
}

interface Actor {
  id: string;
  name: string;
  seat: number;
  color: string;
  x: number;
  y: number;
  input: SplitInput;
  role: "survivor" | "edge";
  connected: boolean;
  disconnectedFor: number;
  eliminatedAt: number | null;
  edgeKOs: number;
  segment: number;
  cooldown: number;
  armed: boolean;
  pulse: number;
  queuedOrder: number | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

interface PartitionCandidate {
  signature: string;
  keep: string[];
}

/**
 * Build stable components from a proximity graph. Existing links use the
 * wider exit threshold, preventing a few pixels of jitter from changing a
 * player's group. The returned links become the next frame's memory.
 */
export function proximityPartition(
  points: ReadonlyArray<{ id: string; x: number; y: number }>,
  previousLinks: ReadonlySet<string> = new Set(),
  thresholdScale = 1,
) {
  const links = new Set<string>();
  const adjacency = new Map(points.map((point) => [point.id, new Set<string>()]));
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const key = pairKey(a.id, b.id);
      // The camera zooms as the world-space frame shrinks. Scale tether
      // distances with it so acquire/release occupy the same projector pixels
      // at the first frame and the dimension floor.
      const baseThreshold = previousLinks.has(key) ? SPLIT_RULES.linkExit : SPLIT_RULES.linkEnter;
      const threshold = baseThreshold * thresholdScale;
      if (Math.hypot(a.x - b.x, a.y - b.y) <= threshold) {
        links.add(key);
        adjacency.get(a.id)?.add(b.id);
        adjacency.get(b.id)?.add(a.id);
      }
    }
  }

  const unseen = new Set(points.map((point) => point.id));
  const components: string[][] = [];
  while (unseen.size) {
    const first = [...unseen].sort()[0];
    const component: string[] = [];
    const queue = [first];
    unseen.delete(first);
    while (queue.length) {
      const id = queue.shift()!;
      component.push(id);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!unseen.delete(neighbor)) continue;
        queue.push(neighbor);
      }
    }
    components.push(component.sort());
  }
  components.sort((a, b) => a[0].localeCompare(b[0]));
  return { components, links };
}

/** A cut exists only when exactly one component is strictly largest. */
export function uniqueLargestPartition(components: ReadonlyArray<ReadonlyArray<string>>): PartitionCandidate | null {
  if (components.length < 2) return null;
  const max = Math.max(...components.map((component) => component.length));
  const largest = components.filter((component) => component.length === max);
  if (largest.length !== 1) return null;
  const normalized = components.map((component) => [...component].sort().join(",")).sort();
  return {
    keep: [...largest[0]].sort(),
    signature: `${[...largest[0]].sort().join(",")}|${normalized.join("/")}`,
  };
}

export function ratchetDimension(current: number, initial: number) {
  return Math.max(initial * SPLIT_RULES.dimensionFloor, current * Math.sqrt(SPLIT_RULES.areaShrink));
}

export function createHost(ctx: HostContext): GameHost {
  const actors = new Map<string, Actor>();
  const initialIds = new Set(ctx.players.map((player) => player.id));
  const frame = { x: 0, y: 0, w: INITIAL_W, h: INITIAL_H };
  const links = new Set<string>();
  const particles: Particle[] = [];
  const sound = typeof AudioContext === "undefined" ? null : new SplitSound("host");
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let randomState = ctx.seed >>> 0;
  let clock = 0;
  let candidate: PartitionCandidate | null = null;
  let acquiredFor = 0;
  let cutRemaining: number | null = null;
  let tieHold = false;
  let phoneSendClock = 0;
  let pulseStartSpacing = 0;
  let pulseQueueOrder = 0;
  let lastGraceBeat = 4;
  let lastCutBeat = 5;
  let finishFor = 0;
  let over = false;
  let flash = 0;
  let rift: { x: number; halfWidth: number; remaining: number } | null = null;
  let nextRift = SPLIT_RULES.firstRift as number;
  let callout = "STAY WITH THE BIGGER CROWD";
  let calloutFor = 3.5;

  const rand = () => {
    randomState = (randomState + 0x6d2b79f5) >>> 0;
    let t = randomState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const spawn = (player: Player, index: number, late: boolean): Actor => {
    const angle = (index / Math.max(1, ctx.players.length)) * Math.PI * 2 - Math.PI / 2;
    // Keep ten names and seat glyphs readable without breaking the chain:
    // adjacent players remain within the link-enter threshold at this radius.
    const spawnRadius = Math.min(150, 70 + ctx.players.length * 8);
    return {
      id: player.id,
      name: player.name,
      seat: player.seat,
      color: player.color,
      x: Math.cos(angle) * spawnRadius,
      y: Math.sin(angle) * spawnRadius,
      input: { x: 0, y: 0 },
      role: late ? "edge" : "survivor",
      connected: player.connected,
      disconnectedFor: 0,
      eliminatedAt: late ? clock : null,
      edgeKOs: 0,
      segment: player.seat % 8,
      cooldown: late ? 1.2 : 0,
      armed: true,
      pulse: 0,
      queuedOrder: null,
    };
  };
  ctx.players.forEach((player, index) => actors.set(player.id, spawn(player, index, false)));

  const audio = (cue: SplitCue, to?: string) => {
    sound?.play(cue);
    if (to) ctx.send({ t: "splitAudio", cue } satisfies SplitAudioFrame, to);
  };

  const burst = (x: number, y: number, color: string, count: number) => {
    if (reducedMotion) return;
    for (let index = 0; index < count && particles.length < 120; index++) {
      const angle = rand() * Math.PI * 2;
      const speed = 80 + rand() * 170;
      const life = 0.3 + rand() * 0.5;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, max: life, color });
    }
  };

  const resetCut = () => {
    candidate = null;
    acquiredFor = 0;
    cutRemaining = null;
    lastCutBeat = 5;
  };

  const eliminate = (actor: Actor, credit?: Actor) => {
    if (actor.role !== "survivor") return;
    actor.role = "edge";
    actor.eliminatedAt = clock;
    actor.input = { x: 0, y: 0 };
    actor.cooldown = 1.2;
    // Elimination neutralizes movement, which counts as the deliberate
    // release before this player's first edge push.
    actor.armed = true;
    actor.pulse = 0;
    actor.queuedOrder = null;
    if (credit) credit.edgeKOs += 1;
    burst(actor.x, actor.y, actor.color, 16);
  };

  const resolveCut = () => {
    if (!candidate) return;
    const keep = new Set(candidate.keep);
    const survivors = [...actors.values()].filter((actor) => actor.role === "survivor");
    const kept = survivors.filter((actor) => keep.has(actor.id));
    for (const actor of survivors) {
      if (!keep.has(actor.id)) eliminate(actor);
    }
    if (kept.length) {
      frame.x = kept.reduce((sum, actor) => sum + actor.x, 0) / kept.length;
      frame.y = kept.reduce((sum, actor) => sum + actor.y, 0) / kept.length;
    }
    frame.w = ratchetDimension(frame.w, INITIAL_W);
    frame.h = ratchetDimension(frame.h, INITIAL_H);
    for (const actor of kept) clampToFrame(actor, frame);
    callout = "FRAME CUT";
    calloutFor = 1.4;
    flash = 0.65;
    audio("cut");
    for (const actor of actors.values()) {
      ctx.send({ t: "splitAudio", cue: "cut" } satisfies SplitAudioFrame, actor.id);
    }
    resetCut();
  };

  const pulseHits = (actor: Actor, segment: number) => {
    const lx = actor.x - frame.x;
    const ly = actor.y - frame.y;
    const hw = frame.w / 2;
    const hh = frame.h / 2;
    const nearE = hw - lx;
    const nearW = hw + lx;
    const nearN = hh + ly;
    const nearS = hh - ly;
    const sideHalf = frame.w * 0.28;
    const verticalHalf = frame.h * 0.28;
    switch (segment) {
      case 0: return { depth: nearE, lane: Math.abs(ly) <= verticalHalf };
      case 1: return { depth: Math.max(nearE, nearN), lane: lx > sideHalf && ly < -verticalHalf };
      case 2: return { depth: nearN, lane: Math.abs(lx) <= sideHalf };
      case 3: return { depth: Math.max(nearW, nearN), lane: lx < -sideHalf && ly < -verticalHalf };
      case 4: return { depth: nearW, lane: Math.abs(ly) <= verticalHalf };
      case 5: return { depth: Math.max(nearW, nearS), lane: lx < -sideHalf && ly > verticalHalf };
      case 6: return { depth: nearS, lane: Math.abs(lx) <= sideHalf };
      default: return { depth: Math.max(nearE, nearS), lane: lx > sideHalf && ly > verticalHalf };
    }
  };

  const resolvePulse = (edge: Actor) => {
    let knockedOut = 0;
    for (const survivor of [...actors.values()].filter((actor) => actor.role === "survivor")) {
      const hit = pulseHits(survivor, edge.segment);
      if (!hit.lane || hit.depth > 140) continue;
      if (hit.depth <= 76) {
        eliminate(survivor, edge);
        knockedOut += 1;
      } else {
        const amount = 52 * (1 - (hit.depth - 76) / 64);
        nudgeInward(survivor, edge.segment, amount);
        clampToFrame(survivor, frame);
      }
    }
    burst(...segmentPoint(frame, edge.segment), edge.color, knockedOut ? 24 : 10);
    if (knockedOut) {
      callout = `${edge.name.toUpperCase()} TOOK ${knockedOut}`;
      calloutFor = 1.3;
      audio("ko", edge.id);
    }
  };

  const startPulse = (actor: Actor) => {
    actor.queuedOrder = null;
    actor.cooldown = SPLIT_RULES.edgeCooldown;
    actor.pulse = 0.72;
    pulseStartSpacing = 0.8;
    audio("push", actor.id);
  };

  const phase = (): SplitPhoneFrame["phase"] => finishFor > 0
    ? "result"
    : clock < SPLIT_RULES.graceSeconds
      ? "grace"
      : cutRemaining !== null
        ? "cut"
        : "live";

  const sendPhoneFrames = () => {
    const currentPhase = phase();
    const frames: Record<string, SplitPhoneFrame> = {};
    for (const actor of actors.values()) {
      const target = actor.role === "edge" ? SEGMENT_NAMES[actor.segment] : null;
      const status = actor.role === "survivor"
        ? !actor.connected
          ? `Signal lost · cut in ${Math.max(0, SPLIT_RULES.disconnectSeconds - actor.disconnectedFor).toFixed(1)}s`
          : currentPhase === "result"
            ? `Final score: ${actorScore(actor, clock)} · alive +1 / 8s, finish +3, KOs +2`
          : currentPhase === "grace"
            ? "Stay alive +1 / 8s · finish +3 · edge KOs +2"
            : rift
              ? `RIFT IN ${Math.ceil(rift.remaining)} · leave the striped lane`
            : currentPhase === "cut"
              ? [...actors.values()].some((other) => other.role === "survivor" && !other.connected)
                ? "Cut paused · waiting for signal"
                : "Join the bigger group"
              : tieHold
                ? "TIE · move to make one group bigger"
                : "Stay connected to the crowd"
        : actor.queuedOrder !== null
          ? `Queued at ${target} · watch the frame`
          : actor.pulse > 0
            ? `Strike locked at ${target} · KOs +2`
          : actor.cooldown > 0
            ? `Frame recharging · ${actor.cooldown.toFixed(1)}s`
            : actor.armed
              ? `Aim ${target} · push hard to strike`
              : "Release the stick to re-arm";
      frames[actor.id] = {
        t: "splitState",
        role: actor.role,
        phase: currentPhase,
        status,
        remaining: Math.max(0, SPLIT_RULES.roundSeconds - clock),
        grace: Math.max(0, SPLIT_RULES.graceSeconds - clock),
        cut: cutRemaining,
        target,
        cooldown: actor.cooldown,
        queued: actor.queuedOrder !== null,
        connected: actor.connected,
        score: actorScore(actor, clock),
        rift: rift?.remaining ?? null,
      } satisfies SplitPhoneFrame;
    }
    // Every role, score and warning is public on the projector. One opaque
    // broadcast preserves 10Hz feedback without 100 targeted sends at ten seats.
    ctx.send({ t: "splitStates", frames } satisfies SplitPhoneFrames);
  };

  return {
    onJoin(player) {
      if (!actors.has(player.id)) actors.set(player.id, spawn(player, actors.size, !initialIds.has(player.id)));
    },

    onLeave(id) {
      const actor = actors.get(id);
      if (!actor) return;
      actor.connected = false;
      actor.input = { x: 0, y: 0 };
      actor.queuedOrder = null;
    },

    onConnectionChange(id, connected) {
      const actor = actors.get(id);
      if (!actor) return;
      actor.connected = connected;
      actor.input = { x: 0, y: 0 };
      if (!connected) actor.queuedOrder = null;
      if (connected) actor.disconnectedFor = 0;
    },

    onInput(id, value) {
      const actor = actors.get(id);
      if (!actor || !actor.connected || !value || typeof value !== "object" || Array.isArray(value)) return;
      const raw = value as Partial<SplitInput>;
      const x = clamp(Number(raw.x) || 0, -1, 1);
      const y = clamp(Number(raw.y) || 0, -1, 1);
      const magnitude = Math.hypot(x, y);
      actor.input = magnitude > 1 ? { x: x / magnitude, y: y / magnitude } : { x, y };
      if (actor.role !== "edge") return;
      // A push commits its target, including time spent in the queue.
      if (magnitude > 0.24 && actor.pulse <= 0 && actor.queuedOrder === null) actor.segment = angleSegment(x, y);
      if (magnitude <= 0.25) actor.armed = true;
      if (actor.armed && actor.cooldown <= 0 && actor.pulse <= 0 && actor.queuedOrder === null && magnitude >= 0.82) {
        actor.armed = false;
        const activePulses = [...actors.values()].filter((other) => other.pulse > 0).length;
        if (activePulses < 2 && pulseStartSpacing <= 0) startPulse(actor);
        else actor.queuedOrder = ++pulseQueueOrder;
      }
    },

    tick(dt) {
      if (over) return;
      dt = clamp(dt, 0, 0.25);
      if (finishFor > 0) {
        finishFor += dt;
        flash = Math.max(0, flash - dt);
        if (finishFor >= 2) over = true;
        phoneSendClock += dt;
        if (phoneSendClock >= 0.1) {
          phoneSendClock %= 0.1;
          sendPhoneFrames();
        }
        return;
      }

      clock += dt;
      pulseStartSpacing = Math.max(0, pulseStartSpacing - dt);
      calloutFor = Math.max(0, calloutFor - dt);
      flash = Math.max(0, flash - dt * 1.8);
      for (let index = particles.length - 1; index >= 0; index--) {
        const particle = particles[index];
        particle.life -= dt;
        if (particle.life <= 0) {
          particles.splice(index, 1);
          continue;
        }
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 1 - Math.min(0.9, dt * 4);
        particle.vy *= 1 - Math.min(0.9, dt * 4);
      }

      const graceBeat = Math.ceil(SPLIT_RULES.graceSeconds - clock);
      if (graceBeat > 0 && graceBeat <= 3 && graceBeat < lastGraceBeat) {
        lastGraceBeat = graceBeat;
        audio("countdown");
      }
      if (clock >= SPLIT_RULES.graceSeconds && lastGraceBeat !== 0) {
        lastGraceBeat = 0;
        callout = "CUTS ARE LIVE";
        calloutFor = 1.4;
        flash = 0.35;
        audio("go");
        for (const actor of actors.values()) {
          ctx.send({ t: "splitAudio", cue: "go" } satisfies SplitAudioFrame, actor.id);
        }
      }

      for (const actor of actors.values()) {
        if (!actor.connected && actor.role === "survivor") {
          actor.disconnectedFor += dt;
          if (actor.disconnectedFor >= SPLIT_RULES.disconnectSeconds) eliminate(actor);
        }
        if (actor.role === "survivor" && actor.connected) {
          const magnitude = Math.hypot(actor.input.x, actor.input.y);
          if (magnitude > 0.08) {
            const scaled = (magnitude - 0.08) / 0.92;
            actor.x += (actor.input.x / magnitude) * MOVE_SPEED * scaled * dt;
            actor.y -= (actor.input.y / magnitude) * MOVE_SPEED * scaled * dt;
            clampToFrame(actor, frame);
          }
        } else if (actor.role === "edge") {
          actor.cooldown = Math.max(0, actor.cooldown - dt);
          if (actor.pulse > 0) {
            actor.pulse -= dt;
            if (actor.pulse <= 0) resolvePulse(actor);
          }
        }
      }

      // A stationary crowd is never a safe way to skip the heat. Freeze the
      // lane at announcement and grant a full four seconds to leave it.
      if (rift) {
        rift.remaining -= dt;
        if (rift.remaining <= 0) {
          for (const actor of actors.values()) {
            if (actor.role === "survivor" && Math.abs(actor.x - rift.x) <= rift.halfWidth + PLAYER_RADIUS) {
              eliminate(actor);
              ctx.send({ t: "splitAudio", cue: "cut" } satisfies SplitAudioFrame, actor.id);
            }
          }
          audio("cut");
          callout = "RIFT HIT · CUT PLAYERS BECOME THE EDGE";
          calloutFor = 1.5;
          rift = null;
        }
      } else if (clock >= nextRift) {
        const crowd = [...actors.values()].filter((actor) => actor.role === "survivor");
        if (crowd.length) {
          // Target a real body nearest the centroid: a stationary equal split
          // cannot leave the announced lane harmlessly between both crowds.
          const center = crowd.reduce((sum, actor) => sum + actor.x, 0) / crowd.length;
          const target = [...crowd].sort((a, b) => Math.abs(a.x - center) - Math.abs(b.x - center) || a.seat - b.seat)[0];
          rift = { x: target.x, halfWidth: 60 * frame.h / INITIAL_H, remaining: SPLIT_RULES.riftWarning };
          audio("countdown");
        }
        nextRift += SPLIT_RULES.riftInterval;
      }

      const activePulses = [...actors.values()].filter((actor) => actor.pulse > 0).length;
      if (activePulses < 2 && pulseStartSpacing <= 0) {
        const nextPulse = [...actors.values()]
          .filter((actor) => actor.role === "edge" && actor.connected && actor.queuedOrder !== null)
          .sort((a, b) => a.queuedOrder! - b.queuedOrder!)[0];
        if (nextPulse) startPulse(nextPulse);
      }

      // Grace suppresses cuts, not their visual explanation: tethers teach
      // group membership from the first moving frame.
      const survivors = [...actors.values()].filter((actor) => actor.role === "survivor");
      const partition = proximityPartition(survivors, links, frame.h / INITIAL_H);
      links.clear();
      for (const link of partition.links) links.add(link);

      if (clock >= SPLIT_RULES.graceSeconds) {
        const next = uniqueLargestPartition(partition.components);
        const signalLost = survivors.some((actor) => !actor.connected);
        const maxSize = partition.components.length ? Math.max(...partition.components.map((component) => component.length)) : 0;
        tieHold = partition.components.length > 1
          && partition.components.filter((component) => component.length === maxSize).length > 1;
        if (!next) {
          // Reuniting or producing equal-largest groups is the only way to
          // cancel an armed cut. There is never a seat/centre/random tie-break.
          resetCut();
        } else if (cutRemaining !== null) {
          // Once armed, the clock belongs to the split, not to one frozen
          // snapshot of it. Crossings can flip SAFE/CUT live without resetting
          // four seconds. A lost signal pauses resolution until steerability
          // returns or the disconnect grace promotes that body to the edge.
          candidate = next;
          if (!signalLost) {
            cutRemaining -= dt;
            const beat = Math.ceil(cutRemaining);
            if (beat > 0 && beat < lastCutBeat) {
              lastCutBeat = beat;
              audio("countdown");
            }
            if (cutRemaining <= 0) resolveCut();
          }
        } else if (next.signature !== candidate?.signature) {
          candidate = next;
          acquiredFor = 0;
          lastCutBeat = 5;
        } else if (!signalLost) {
          acquiredFor += dt;
          if (acquiredFor >= SPLIT_RULES.acquireSeconds) {
            cutRemaining = SPLIT_RULES.cutSeconds;
            lastCutBeat = 5;
          }
        }
      }

      if (clock >= SPLIT_RULES.roundSeconds || ![...actors.values()].some((actor) => actor.role === "survivor")) {
        finishFor = 0.001;
        resetCut();
        tieHold = false;
        rift = null;
        callout = winnerLabel(actors, clock);
        calloutFor = 2;
        flash = 0.5;
      }

      phoneSendClock += dt;
      if (phoneSendClock >= 0.1) {
        phoneSendClock %= 0.1;
        sendPhoneFrames();
      }
    },

    render(g, w, h) {
      g.save();
      g.fillStyle = "#090B0D";
      g.fillRect(0, 0, w, h);
      // The border remains a stable projector landmark while its world-space
      // dimensions ratchet down; zooming the current frame makes survivors
      // larger after every cut instead of shrinking the usable screen area.
      const scale = Math.min((w * 0.82) / frame.w, (h * 0.7) / frame.h);
      const ox = w / 2;
      const oy = h / 2 + h * 0.025;
      g.translate(ox, oy);
      g.scale(scale, scale);
      g.translate(-frame.x, -frame.y);

      // Registration-grid texture establishes the brutal broadcast look while
      // staying well below the contrast of player silhouettes and hazards.
      g.strokeStyle = "rgba(247,239,218,0.055)";
      g.lineWidth = 1 / scale;
      for (let x = frame.x - INITIAL_W; x <= frame.x + INITIAL_W; x += 52) {
        g.beginPath(); g.moveTo(x, frame.y - INITIAL_H); g.lineTo(x, frame.y + INITIAL_H); g.stroke();
      }
      for (let y = frame.y - INITIAL_H; y <= frame.y + INITIAL_H; y += 52) {
        g.beginPath(); g.moveTo(frame.x - INITIAL_W, y); g.lineTo(frame.x + INITIAL_W, y); g.stroke();
      }

      if (rift) {
        const left = rift.x - rift.halfWidth - PLAYER_RADIUS;
        const right = rift.x + rift.halfWidth + PLAYER_RADIUS;
        g.fillStyle = "rgba(255,107,87,.24)";
        g.fillRect(left, frame.y - frame.h / 2, right - left, frame.h);
        g.strokeStyle = "#FF6B57";
        g.lineWidth = 3;
        for (let y = frame.y - frame.h / 2; y < frame.y + frame.h / 2; y += 26) {
          g.beginPath(); g.moveTo(left, y); g.lineTo(right, Math.min(y + 22, frame.y + frame.h / 2)); g.stroke();
        }
        g.fillStyle = "#F7EFDA";
        g.textAlign = "center";
        g.font = "900 18px system-ui, sans-serif";
        g.fillText(`RIFT ${Math.ceil(rift.remaining)}`, rift.x, frame.y - frame.h / 2 + 26);
      }

      // Hysteretic links are the game's only group-membership explanation:
      // if the cream tether holds, the players still count as one crowd.
      g.strokeStyle = "rgba(247,239,218,0.32)";
      g.lineWidth = 5;
      for (const link of links) {
        const [aId, bId] = link.split("\u0000");
        const a = actors.get(aId);
        const b = actors.get(bId);
        if (!a || !b || a.role !== "survivor" || b.role !== "survivor") continue;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }

      if (cutRemaining !== null && candidate) {
        const keep = new Set(candidate.keep);
        for (const actor of actors.values()) {
          if (actor.role !== "survivor" || keep.has(actor.id)) continue;
          g.fillStyle = `rgba(255,107,87,${0.08 + (1 - cutRemaining / SPLIT_RULES.cutSeconds) * 0.18})`;
          g.beginPath(); g.arc(actor.x, actor.y, 54, 0, Math.PI * 2); g.fill();
        }
      }

      for (const actor of actors.values()) {
        if (actor.role !== "survivor") continue;
        drawActor(g, actor, !actor.connected);
      }

      if (cutRemaining !== null && candidate) {
        const keep = new Set(candidate.keep);
        g.font = "900 14px Archivo, system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        for (const actor of actors.values()) {
          if (actor.role !== "survivor") continue;
          g.fillStyle = keep.has(actor.id) ? "#F7EFDA" : "#FF6B57";
          g.fillText(keep.has(actor.id) ? "SAFE" : "CUT", actor.x, actor.y + 42);
        }
      }

      for (const particle of particles) {
        g.globalAlpha = clamp(particle.life / particle.max, 0, 1);
        g.fillStyle = particle.color;
        g.fillRect(particle.x - 5, particle.y - 5, 10, 10);
      }
      g.globalAlpha = 1;

      drawFrame(g, frame, actors, cutRemaining, reducedMotion);
      g.restore();

      const hudScale = clamp(Math.min(w / 1280, h / 720), 0.72, 1.5);
      g.textBaseline = "middle";
      g.fillStyle = "#F7EFDA";
      g.textAlign = "left";
      g.font = `900 ${Math.round(23 * hudScale)}px Archivo, system-ui, sans-serif`;
      g.fillText("SPLIT", 28 * hudScale, 34 * hudScale);
      g.fillStyle = "#F1B24A";
      g.font = `800 ${Math.round(18 * hudScale)}px Archivo, system-ui, sans-serif`;
      const areaPercent = (frame.w * frame.h) / (INITIAL_W * INITIAL_H) * 100;
      g.fillText(`FRAME ${Math.round(areaPercent)}%`, 28 * hudScale, 65 * hudScale);

      // Keep the clock clear of the shell's persistent sound/exit controls.
      g.fillStyle = "#F7EFDA";
      g.font = `900 ${Math.round(23 * hudScale)}px Archivo, system-ui, sans-serif`;
      g.fillText(`${Math.ceil(Math.max(0, SPLIT_RULES.roundSeconds - clock))}s LEFT`, 28 * hudScale, 95 * hudScale);

      if (rift) {
        g.textAlign = "center";
        g.fillStyle = "#FF6B57";
        g.font = `900 ${Math.round(25 * hudScale)}px system-ui, sans-serif`;
        g.fillText(`RIFT IN ${Math.ceil(rift.remaining)} · LEAVE THE STRIPED LANE`, w / 2, 44 * hudScale);
      }

      if (clock < SPLIT_RULES.graceSeconds) {
        const remaining = Math.ceil(SPLIT_RULES.graceSeconds - clock);
        centerBanner(g, w, h, remaining > 3 ? "MOVE · FIND YOUR CROWD" : String(remaining), remaining > 6 ? "STAY LINKED · DODGE STRIPED RIFTS · CUT PLAYERS BECOME THE EDGE" : "55s HEAT · SURVIVE +1 / 8s · FINISH +3 · EDGE KO +2", "#F1B24A", hudScale);
      } else if (cutRemaining !== null && candidate) {
        const lost = [...actors.values()].filter((actor) => actor.role === "survivor" && !candidate!.keep.includes(actor.id)).length;
        const safe = candidate.keep.length;
        const signalLost = [...actors.values()].some((actor) => actor.role === "survivor" && !actor.connected);
        centerBanner(
          g,
          w,
          h,
          String(Math.max(1, Math.ceil(cutRemaining))),
          signalLost ? "SIGNAL LOST · CUT PAUSED" : `SAFE ${safe} · CUT ${lost} · JOIN THE BIGGER GROUP`,
          signalLost ? "#F1B24A" : "#FF6B57",
          hudScale,
        );
      } else if (tieHold) {
        centerBanner(g, w, h, "TIE — MOVE", "NO GROUP WILL BE CHOSEN", "#F1B24A", hudScale);
      } else if (finishFor > 0 || calloutFor > 0) {
        centerBanner(g, w, h, callout, finishFor > 0 ? "SURVIVAL +1 / 8s · FINISH +3 · EDGE KO +2" : "", "#F7EFDA", hudScale);
      }

      if (flash > 0) {
        g.globalAlpha = reducedMotion ? 0.08 : flash * 0.14;
        g.fillStyle = finishFor > 0 ? "#F7EFDA" : "#FF6B57";
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 1;
      }
    },

    isOver: () => over,

    results() {
      const rows = [...actors.values()].map((actor) => {
        const survived = Math.floor(Math.min(actor.eliminatedAt ?? SPLIT_RULES.roundSeconds, SPLIT_RULES.roundSeconds));
        const winner = actor.role === "survivor" && clock >= SPLIT_RULES.roundSeconds;
        return { actor, survived, score: Math.floor(survived / 8) + actor.edgeKOs * EDGE_KO_POINTS + (winner ? WINNER_BONUS : 0) };
      }).sort((a, b) => b.score - a.score || b.survived - a.survived || a.actor.seat - b.actor.seat || a.actor.id.localeCompare(b.actor.id));
      let place = 0;
      let priorScore: number | null = null;
      return rows.map((row, index): RoundResult => {
        if (row.score !== priorScore) place = index + 1;
        priorScore = row.score;
        return {
          id: row.actor.id,
          place,
          score: row.score,
          detail: `${row.survived}s alive · ${row.actor.edgeKOs} edge ${row.actor.edgeKOs === 1 ? "KO" : "KOs"}`,
        };
      });
    },

    destroy() {
      sound?.destroy();
    },
  };
}

function drawActor(g: CanvasRenderingContext2D, actor: Actor, disconnected: boolean) {
  g.save();
  g.translate(actor.x, actor.y);
  g.globalAlpha = disconnected ? 0.48 : 1;
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.fillRect(-21, -17, 48, 42);
  g.fillStyle = actor.color;
  const shape = actor.seat % 3;
  g.beginPath();
  if (shape === 0) g.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
  else if (shape === 1) { g.moveTo(0, -24); g.lineTo(23, 20); g.lineTo(-23, 20); g.closePath(); }
  else g.rect(-20, -20, 40, 40);
  g.fill();
  g.fillStyle = "#090B0D";
  g.font = "900 20px Archivo, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(actor.seat + 1), 0, 1);
  g.fillStyle = "rgba(9,11,13,0.92)";
  roundRect(g, -Math.max(45, actor.name.length * 6.8), -57, Math.max(90, actor.name.length * 13.6), 25, 12);
  g.fill();
  g.fillStyle = "#F7EFDA";
  g.font = "800 17px Archivo, system-ui, sans-serif";
  g.fillText(disconnected ? `${actor.name} · SIGNAL` : actor.name, 0, -44);
  g.restore();
}

function drawFrame(g: CanvasRenderingContext2D, frame: { x: number; y: number; w: number; h: number }, actors: Map<string, Actor>, cut: number | null, reducedMotion: boolean) {
  g.save();
  g.strokeStyle = cut === null ? "#F7EFDA" : "#FF6B57";
  g.lineWidth = cut === null ? 11 : 18;
  g.strokeRect(frame.x - frame.w / 2, frame.y - frame.h / 2, frame.w, frame.h);
  for (const actor of actors.values()) {
    if (actor.role !== "edge" || actor.pulse <= 0) continue;
    drawPulseTelegraph(g, frame, actor.segment, reducedMotion ? 1 : 1 - actor.pulse / 0.72);
  }
  for (let segment = 0; segment < SEGMENT_NAMES.length; segment++) {
    const occupants = [...actors.values()]
      .filter((actor) => actor.role === "edge" && actor.segment === segment)
      .sort((a, b) => a.seat - b.seat);
    occupants.forEach((actor, index) => {
      const [x, y] = edgeMarkerPoint(frame, segment, index, occupants.length);
      g.save();
      g.translate(x, y);
      g.fillStyle = actor.pulse > 0 ? "#FF6B57" : actor.queuedOrder !== null ? "#F1B24A" : actor.cooldown > 0 ? "#5A5145" : actor.color;
      g.fillRect(-19, -19, 38, 38);
      g.fillStyle = "#090B0D";
      g.font = "900 17px Archivo, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(actor.seat + 1), 0, 1);
      if (actor.pulse > 0 || actor.queuedOrder !== null) {
        g.strokeStyle = actor.pulse > 0 ? "#F1B24A" : actor.color;
        g.lineWidth = 7;
        g.strokeRect(-31, -31, 62, 62);
      }
      g.restore();
    });
  }
  g.restore();
}

function drawPulseTelegraph(g: CanvasRenderingContext2D, frame: { x: number; y: number; w: number; h: number }, segment: number, progress: number) {
  const depth = 140;
  const hw = frame.w / 2;
  const hh = frame.h / 2;
  const x = frame.x - hw;
  const y = frame.y - hh;
  const horizontal = frame.w * 0.28;
  const vertical = frame.h * 0.28;
  g.save();
  g.globalAlpha = 0.2 + progress * 0.35;
  g.fillStyle = "#FF6B57";
  if (segment === 0) g.fillRect(x + frame.w - depth, frame.y - vertical, depth, vertical * 2);
  else if (segment === 1) g.fillRect(x + frame.w - depth, y, depth, depth);
  else if (segment === 2) g.fillRect(frame.x - horizontal, y, horizontal * 2, depth);
  else if (segment === 3) g.fillRect(x, y, depth, depth);
  else if (segment === 4) g.fillRect(x, frame.y - vertical, depth, vertical * 2);
  else if (segment === 5) g.fillRect(x, y + frame.h - depth, depth, depth);
  else if (segment === 6) g.fillRect(frame.x - horizontal, y + frame.h - depth, horizontal * 2, depth);
  else g.fillRect(x + frame.w - depth, y + frame.h - depth, depth, depth);
  // The coral cutoff advances from the selected border to the exact lethal
  // depth, making both the threatened lane and the resolution boundary visible.
  const lethal = 76 * (0.35 + progress * 0.65);
  g.globalAlpha = 0.95;
  g.strokeStyle = "#F7EFDA";
  g.lineWidth = 6;
  g.beginPath();
  if (segment === 0) { g.moveTo(x + frame.w - lethal, frame.y - vertical); g.lineTo(x + frame.w - lethal, frame.y + vertical); }
  else if (segment === 1) { g.moveTo(x + frame.w - lethal, y); g.lineTo(x + frame.w - lethal, y + depth); g.moveTo(x + frame.w, y + lethal); g.lineTo(x + frame.w - depth, y + lethal); }
  else if (segment === 2) { g.moveTo(frame.x - horizontal, y + lethal); g.lineTo(frame.x + horizontal, y + lethal); }
  else if (segment === 3) { g.moveTo(x + lethal, y); g.lineTo(x + lethal, y + depth); g.moveTo(x, y + lethal); g.lineTo(x + depth, y + lethal); }
  else if (segment === 4) { g.moveTo(x + lethal, frame.y - vertical); g.lineTo(x + lethal, frame.y + vertical); }
  else if (segment === 5) { g.moveTo(x + lethal, y + frame.h); g.lineTo(x + lethal, y + frame.h - depth); g.moveTo(x, y + frame.h - lethal); g.lineTo(x + depth, y + frame.h - lethal); }
  else if (segment === 6) { g.moveTo(frame.x - horizontal, y + frame.h - lethal); g.lineTo(frame.x + horizontal, y + frame.h - lethal); }
  else { g.moveTo(x + frame.w - lethal, y + frame.h); g.lineTo(x + frame.w - lethal, y + frame.h - depth); g.moveTo(x + frame.w, y + frame.h - lethal); g.lineTo(x + frame.w - depth, y + frame.h - lethal); }
  g.stroke();
  const [px, py] = segmentPoint(frame, segment);
  const inward = [[-1, 0], [-0.7, 0.7], [0, 1], [0.7, 0.7], [1, 0], [0.7, -0.7], [0, -1], [-0.7, -0.7]][segment] ?? [-1, 0];
  g.globalAlpha = 0.8;
  g.strokeStyle = "#F1B24A";
  g.lineWidth = 10;
  for (let lane = -1; lane <= 1; lane++) {
    const sx = px + (segment % 4 === 0 ? 0 : lane * 34);
    const sy = py + (segment % 4 === 0 ? lane * 34 : 0);
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + inward[0] * (58 + progress * 35), sy + inward[1] * (58 + progress * 35));
    g.stroke();
  }
  g.restore();
}

function centerBanner(g: CanvasRenderingContext2D, w: number, h: number, hero: string, sub: string, color: string, scale: number) {
  const boxW = Math.min(w * 0.78, 900 * scale);
  const boxH = sub ? 150 * scale : 105 * scale;
  g.fillStyle = "rgba(9,11,13,0.9)";
  g.fillRect(w / 2 - boxW / 2, h / 2 - boxH / 2, boxW, boxH);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = color;
  const numeric = /^\d+$/.test(hero);
  g.font = `900 ${Math.round((numeric ? 88 : 52) * scale)}px Archivo, system-ui, sans-serif`;
  g.fillText(hero, w / 2, h / 2 - (sub ? 20 * scale : 0));
  if (sub) {
    g.fillStyle = "#F7EFDA";
    g.font = `850 ${Math.round(21 * scale)}px Archivo, system-ui, sans-serif`;
    g.fillText(sub, w / 2, h / 2 + 48 * scale);
  }
}

function segmentPoint(frame: { x: number; y: number; w: number; h: number }, segment: number): [number, number] {
  const positions: [number, number][] = [
    [frame.x + frame.w / 2, frame.y], [frame.x + frame.w / 2, frame.y - frame.h / 2],
    [frame.x, frame.y - frame.h / 2], [frame.x - frame.w / 2, frame.y - frame.h / 2],
    [frame.x - frame.w / 2, frame.y], [frame.x - frame.w / 2, frame.y + frame.h / 2],
    [frame.x, frame.y + frame.h / 2], [frame.x + frame.w / 2, frame.y + frame.h / 2],
  ];
  return positions[segment] ?? positions[0];
}

/** Fan duplicate edge owners along the perimeter so every seat glyph remains visible. */
export function edgeMarkerPoint(
  frame: { x: number; y: number; w: number; h: number },
  segment: number,
  index: number,
  count: number,
): [number, number] {
  const perimeter = 2 * (frame.w + frame.h);
  // Clockwise distances from the top-left corner for E, NE, N, NW, W,
  // SW, S and SE. Offsets then follow the actual perimeter around corners,
  // rather than fanning diagonally off-screen.
  const bases = [
    frame.w + frame.h / 2,
    frame.w,
    frame.w / 2,
    0,
    2 * frame.w + frame.h * 1.5,
    2 * frame.w + frame.h,
    frame.w * 1.5 + frame.h,
    frame.w + frame.h,
  ];
  const distance = ((bases[segment] ?? bases[0]) + (index - (count - 1) / 2) * 48 + perimeter) % perimeter;
  const left = frame.x - frame.w / 2;
  const top = frame.y - frame.h / 2;
  if (distance <= frame.w) return [left + distance, top];
  if (distance <= frame.w + frame.h) return [left + frame.w, top + distance - frame.w];
  if (distance <= frame.w * 2 + frame.h) return [left + frame.w - (distance - frame.w - frame.h), top + frame.h];
  return [left, top + frame.h - (distance - frame.w * 2 - frame.h)];
}

function angleSegment(x: number, y: number) {
  const angle = Math.atan2(y, x);
  return (Math.round(angle / (Math.PI / 4)) + 8) % 8;
}

function nudgeInward(actor: Actor, segment: number, amount: number) {
  const vectors: [number, number][] = [[-1, 0], [-0.7, 0.7], [0, 1], [0.7, 0.7], [1, 0], [0.7, -0.7], [0, -1], [-0.7, -0.7]];
  const [x, y] = vectors[segment] ?? vectors[0];
  actor.x += x * amount;
  actor.y += y * amount;
}

function clampToFrame(actor: Actor, frame: { x: number; y: number; w: number; h: number }) {
  actor.x = clamp(actor.x, frame.x - frame.w / 2 + PLAYER_RADIUS, frame.x + frame.w / 2 - PLAYER_RADIUS);
  actor.y = clamp(actor.y, frame.y - frame.h / 2 + PLAYER_RADIUS, frame.y + frame.h / 2 - PLAYER_RADIUS);
}

function actorScore(actor: Actor, clock: number) {
  const survived = Math.min(actor.eliminatedAt ?? clock, SPLIT_RULES.roundSeconds);
  return Math.floor(survived / 8) + actor.edgeKOs * EDGE_KO_POINTS
    + (actor.role === "survivor" && clock >= SPLIT_RULES.roundSeconds ? WINNER_BONUS : 0);
}

function winnerLabel(actors: Map<string, Actor>, clock: number) {
  const rows = [...actors.values()].sort((a, b) => actorScore(b, clock) - actorScore(a, clock));
  const score = rows.length ? actorScore(rows[0], clock) : 0;
  const tied = rows.filter((actor) => actorScore(actor, clock) === score);
  return tied.length === 1 ? `${rows[0].name.toUpperCase()} WINS · ${score} PTS` : `${tied.length} TIE · ${score} PTS`;
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}
