import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";
import type { LastMarbleInput, LastMarbleStatusFrame } from "./protocol";
import { LastMarbleSound } from "./sound";

const HEATS = 5;
const OPENING_RUNWAY = 9;
const INTERMISSION = 4;
const FINAL_CELEBRATION = 1.8;
const HEAT_LIMIT = 40;
const WARNING_SECONDS = 3;
const FIXED_STEP = 1 / 120;
const PLATFORM_WIDTH = 880;
const PLATFORM_HEIGHT = 500;
const MARBLE_RADIUS = 28;
const ACCELERATION = 1900;
const DRAG = 5.4;
const MAX_SPEED = 320;
const RESTITUTION = 0.9;
const QUALIFIED_CLOSING_SPEED = MAX_SPEED * 0.45;
const QUALIFIED_ATTACKER_LEAD = 24;
const HIT_CREDIT_WINDOW = 1.25;
const PAIR_IMPACT_COOLDOWN = 0.09;
const PHONE_IMPACT_COOLDOWN = 0.11;
const PARTY_POINTS = [10, 8, 6, 5, 4, 3, 2, 1, 1, 1];
const GLYPHS = ["◆", "▲", "●", "✦", "■", "⬟", "✚", "★", "⬢", "✿"];

type Tile = 0 | 1 | 2 | 3;
type MatchPhase = "runway" | "playing" | "intermission" | "celebration" | "complete";

interface Marble {
  id: string;
  seat: number;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  eliminatedAt: number | null;
  input: LastMarbleInput;
  lastHit: { by: string; at: number } | null;
  outMessage: string;
}

interface MatchScore {
  player: Player;
  survivalTenths: number;
  kos: number;
  wins: number;
}

interface ImpactRing {
  x: number;
  y: number;
  age: number;
  color: string;
}

interface Callout {
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface Vector {
  x: number;
  y: number;
}

export interface PlatformState {
  removed: Tile[];
  warning: Tile | null;
  warningProgress: number;
}

/**
 * Seeded clockwise/counter-clockwise walk around the 2x2 plate. Removing the
 * first tile leaves an L; removing the next leaves two edge-connected tiles.
 */
export function createRemovalPath(seed: number): Tile[] {
  const ring: Tile[] = [0, 1, 3, 2];
  const start = hash(seed) % ring.length;
  const direction = (hash(seed ^ 0x9e3779b9) & 1) === 0 ? 1 : -1;
  return Array.from({ length: 4 }, (_, index) => ring[mod(start + direction * index, ring.length)]);
}

/** The warning windows are fixed: 7–10, 17–20, 27–30, and 37–40. */
export function platformStateAt(seconds: number, path: readonly Tile[]): PlatformState {
  const time = clamp(seconds, 0, HEAT_LIMIT);
  const removedCount = Math.min(4, Math.floor((time + 1e-7) / 10));
  const removed = path.slice(0, removedCount) as Tile[];
  if (time >= HEAT_LIMIT) return { removed, warning: null, warningProgress: 0 };
  const windowStart = removedCount * 10 + (10 - WARNING_SECONDS);
  const warning = time >= windowStart ? path[removedCount] ?? null : null;
  return {
    removed,
    warning,
    warningProgress: warning === null ? 0 : clamp((time - windowStart) / WARNING_SECONDS, 0, 1),
  };
}

/** Pure collision seam: equal masses exchange normal momentum predictably. */
export function equalMassNormalVelocities(aNormal: number, bNormal: number) {
  const closing = aNormal - bNormal;
  if (closing <= 0) return { a: aNormal, b: bNormal };
  const impulse = ((1 + RESTITUTION) * closing) / 2;
  return { a: aNormal - impulse, b: bNormal + impulse };
}

/** 0 means A hit B, 1 means B hit A; balanced head-ons credit nobody. */
export function qualifiedAttacker(aToward: number, bToward: number): 0 | 1 | null {
  const closing = aToward + bToward;
  if (closing < QUALIFIED_CLOSING_SPEED) return null;
  if (aToward > bToward + QUALIFIED_ATTACKER_LEAD && aToward > QUALIFIED_CLOSING_SPEED * 0.6) return 0;
  if (bToward > aToward + QUALIFIED_ATTACKER_LEAD && bToward > QUALIFIED_CLOSING_SPEED * 0.6) return 1;
  return null;
}

export function hitCreditIsFresh(now: number, hitAt: number) {
  return now >= hitAt && now - hitAt <= HIT_CREDIT_WINDOW;
}

/** Deterministic public physics seam used by the host and tuning tests. */
export function sampleControlledMotion(initial: Vector, input: Vector, seconds: number) {
  let velocity = { ...initial };
  let distance = 0;
  let elapsed = 0;
  while (elapsed + 1e-9 < seconds) {
    const dt = Math.min(FIXED_STEP, seconds - elapsed);
    velocity = controlledVelocity(velocity, input, dt);
    distance += Math.hypot(velocity.x, velocity.y) * dt;
    elapsed += dt;
  }
  return { velocity, speed: Math.hypot(velocity.x, velocity.y), distance };
}

export function resolveEqualMassVelocities(a: Vector, b: Vector, normal: Vector) {
  const aNormal = a.x * normal.x + a.y * normal.y;
  const bNormal = b.x * normal.x + b.y * normal.y;
  const after = equalMassNormalVelocities(aNormal, bNormal);
  return {
    a: { x: a.x + (after.a - aNormal) * normal.x, y: a.y + (after.a - aNormal) * normal.y },
    b: { x: b.x + (after.b - bNormal) * normal.x, y: b.y + (after.b - bNormal) * normal.y },
  };
}

export function spawnPointsFor(seed: number, heatIndex: number, count: number) {
  const random = mulberry32(heatSeed(seed, heatIndex));
  const rotation = random() * Math.PI * 2;
  const radius = count <= 4 ? 128 : 182;
  return Array.from({ length: count }, (_, index) => {
    const angle = rotation + (index / Math.max(1, count)) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

/**
 * Keeps repeated contact readable and preserves room-router headroom. Pair
 * events can recur at 90ms; phone frames are globally limited to two every
 * 110ms, at most 20 targeted messages in any one-second interval.
 */
export function createImpactLimiter() {
  const pairNext = new Map<string, number>();
  let phoneNext = 0;
  return {
    allowPair(now: number, a: string, b: string) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (now + 1e-9 < (pairNext.get(key) ?? 0)) return false;
      pairNext.set(key, now + PAIR_IMPACT_COOLDOWN);
      return true;
    },
    allowPhone(now: number) {
      if (now + 1e-9 < phoneNext) return false;
      phoneNext = now + PHONE_IMPACT_COOLDOWN;
      return true;
    },
    clear() {
      pairNext.clear();
      phoneNext = 0;
    },
  };
}

export function createHost(ctx: HostContext): GameHost {
  const scores = new Map<string, MatchScore>();
  for (const player of [...ctx.players].sort((a, b) => a.seat - b.seat)) {
    scores.set(player.id, { player, survivalTenths: 0, kos: 0, wins: 0 });
  }

  let marbles = new Map<string, Marble>();
  let phase: MatchPhase = scores.size === 0 ? "complete" : "runway";
  let phaseClock = 0;
  let heatClock = 0;
  let heatIndex = 0;
  let heatWinner = "";
  let matchBanner = "";
  let heatPath = createRemovalPath(heatSeed(ctx.seed, heatIndex));
  let accumulator = 0;
  let over = scores.size === 0;
  const spectators = new Set<string>();
  const impacts: ImpactRing[] = [];
  const callouts: Callout[] = [];
  const sound = typeof AudioContext === "undefined" ? null : new LastMarbleSound("host");
  const impactLimiter = createImpactLimiter();
  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const heatParticipants = () => [...scores.values()].sort((a, b) => a.player.seat - b.player.seat);

  const resetHeat = () => {
    const participants = heatParticipants();
    const seed = heatSeed(ctx.seed, heatIndex);
    const spawnPoints = spawnPointsFor(ctx.seed, heatIndex, participants.length);
    heatPath = createRemovalPath(seed);
    heatClock = 0;
    impacts.length = 0;
    callouts.length = 0;
    impactLimiter.clear();
    marbles = new Map(participants.map(({ player }, index) => {
      return [player.id, {
        id: player.id,
        seat: player.seat,
        name: player.name,
        color: player.color,
        x: spawnPoints[index].x,
        y: spawnPoints[index].y,
        vx: 0,
        vy: 0,
        alive: true,
        eliminatedAt: null,
        input: marbles.get(player.id)?.input ?? { x: 0, y: 0 },
        lastHit: null,
        outMessage: "Watch the finish — the next heat starts soon.",
      } satisfies Marble];
    }));
  };

  const statusFor = (id: string, extra: Partial<LastMarbleStatusFrame> = {}): LastMarbleStatusFrame => {
    const marble = marbles.get(id);
    let phonePhase: LastMarbleStatusFrame["phase"] = "complete";
    let interactive = false;
    let message: string | undefined;

    if (phase === "runway") {
      phonePhase = "runway";
      interactive = true;
      message = "Set your thumb. Movement starts after the count.";
    } else if (phase === "playing") {
      phonePhase = marble?.alive ? "playing" : "out";
      interactive = Boolean(marble?.alive);
      message = marble?.alive ? "Ram rivals. Stay on cream." : marble?.outMessage;
    } else if (phase === "intermission") {
      phonePhase = "intermission";
      interactive = true;
      message = heatWinner ? `${heatWinner} takes the heat.` : "No sole survivor this heat.";
    } else {
      phonePhase = "complete";
      message = "Look up for the final standings.";
    }

    return {
      t: "lastMarbleStatus",
      phase: phonePhase,
      heat: Math.min(HEATS, heatIndex + 1),
      heats: HEATS,
      interactive,
      ...(message ? { message } : {}),
      ...(phonePhase === "out" || phonePhase === "intermission" ? { nextHeatIn: Math.ceil(phonePhase === "out" ? HEAT_LIMIT - heatClock + (heatIndex < HEATS - 1 ? INTERMISSION : 0) : INTERMISSION - phaseClock) } : {}),
      ...extra,
    };
  };

  const sendStatus = (id: string, extra?: Partial<LastMarbleStatusFrame>) => {
    ctx.send(statusFor(id, extra), id);
  };

  const broadcastStatus = () => {
    for (const id of scores.keys()) sendStatus(id);
  };

  const sendSpectatorStatus = (id: string) => {
    ctx.send({
      t: "lastMarbleStatus",
      phase: "spectating",
      heat: Math.min(HEATS, heatIndex + 1),
      heats: HEATS,
      interactive: false,
      message: "You’ll play when the next game starts.",
    } satisfies LastMarbleStatusFrame, id);
  };

  const rankedScores = () => [...scores.values()].sort((a, b) =>
    internalScore(b) - internalScore(a)
    || b.wins - a.wins
    || b.kos - a.kos
    || a.player.seat - b.player.seat);

  const finishMatchImmediately = () => {
    phase = "complete";
    phaseClock = 0;
    over = true;
    broadcastStatus();
  };

  const startFinalCelebration = () => {
    const ranked = rankedScores();
    const leaders = ranked.length ? ranked.filter((score) => scoresTie(ranked[0], score)) : [];
    matchBanner = leaders.length > 1
      ? `${leaders.map((score) => score.player.name.toUpperCase()).join(" + ")} TIE THE MATCH`
      : `${leaders[0]?.player.name.toUpperCase() ?? "MATCH"} WINS THE MATCH`;
    phase = "celebration";
    phaseClock = 0;
    sound?.win(true);
    broadcastStatus();
  };

  const announce = (text: string, color: string, life: number) => {
    callouts.unshift({ text, color, life, maxLife: life });
    callouts.length = Math.min(callouts.length, 3);
  };

  const finishHeat = () => {
    const survivors = [...marbles.values()].filter((marble) => marble.alive);
    for (const marble of survivors) {
      const score = scores.get(marble.id);
      if (score) score.survivalTenths += Math.round(Math.min(heatClock, HEAT_LIMIT) * 10);
    }

    heatWinner = survivors.length === 1 ? survivors[0].name : "";
    if (survivors.length === 1) {
      const winnerScore = scores.get(survivors[0].id);
      if (winnerScore) winnerScore.wins += 1;
    }

    if (heatIndex >= HEATS - 1) {
      startFinalCelebration();
      return;
    }
    if (survivors.length === 1) sound?.win(false);
    phase = "intermission";
    phaseClock = 0;
    broadcastStatus();
  };

  const eliminate = (marble: Marble) => {
    if (!marble.alive) return;
    marble.alive = false;
    marble.eliminatedAt = heatClock;
    marble.input = { x: 0, y: 0 };
    const score = scores.get(marble.id);
    if (score) score.survivalTenths += Math.round(Math.min(heatClock, HEAT_LIMIT) * 10);

    const credit = marble.lastHit && hitCreditIsFresh(heatClock, marble.lastHit.at)
      ? scores.get(marble.lastHit.by)
      : null;
    if (credit && credit.player.id !== marble.id) {
      credit.kos += 1;
      marble.outMessage = `${credit.player.name} knocked you out`;
      announce(`${credit.player.name.toUpperCase()} KNOCKS OUT ${marble.name.toUpperCase()}`, credit.player.color, 1.8);
    } else {
      marble.outMessage = "You slipped into the void. Watch the finish!";
    }
    sound?.fall();
    sendStatus(marble.id);
  };

  const resolveCollisions = () => {
    const active = [...marbles.values()].filter((marble) => marble.alive);
    const diameter = MARBLE_RADIUS * 2;
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= diameter) continue;
        if (distance < 1e-6) {
          const angle = ((a.seat * 17 + b.seat * 29) % 360) * Math.PI / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = diameter - distance;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        const aToward = a.vx * nx + a.vy * ny;
        const bToward = -(b.vx * nx + b.vy * ny);
        const closing = aToward + bToward;
        if (closing <= 0) continue;

        // Equal masses receive equal and opposite impulses. There are no
        // hidden weight classes or random kick multipliers.
        const velocityAfter = resolveEqualMassVelocities(
          { x: a.vx, y: a.vy },
          { x: b.vx, y: b.vy },
          { x: nx, y: ny },
        );
        a.vx = velocityAfter.a.x;
        a.vy = velocityAfter.a.y;
        b.vx = velocityAfter.b.x;
        b.vy = velocityAfter.b.y;
        capVelocity(a);
        capVelocity(b);

        if (closing >= QUALIFIED_CLOSING_SPEED) {
          let attacker: Marble | null = null;
          let victim: Marble | null = null;
          const qualified = qualifiedAttacker(aToward, bToward);
          if (qualified === 0) {
            attacker = a;
            victim = b;
          } else if (qualified === 1) {
            attacker = b;
            victim = a;
          }
          if (attacker && victim) {
            if (impactLimiter.allowPair(heatClock, a.id, b.id)) {
              victim.lastHit = { by: attacker.id, at: heatClock };
              announce(`${attacker.name.toUpperCase()} → ${victim.name.toUpperCase()}`, attacker.color, 1.1);
              const strength = clamp(closing / MAX_SPEED, 0.18, 1);
              sound?.impact(strength);
              if (impactLimiter.allowPhone(heatClock)) {
                sendStatus(a.id, { impact: strength });
                sendStatus(b.id, { impact: strength });
              }
            }
          }

          const strength = clamp(closing / MAX_SPEED, 0.18, 1);
          if (!reducedMotion && impacts.length < 32) {
            impacts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, age: 0, color: attacker?.color ?? "#F6EFE2" });
          }
        }
      }
    }
  };

  const simulate = (dt: number) => {
    const previousHeatClock = heatClock;
    heatClock += dt;
    for (let drop = 10; drop <= HEAT_LIMIT; drop += 10) {
      for (let remaining = WARNING_SECONDS; remaining >= 1; remaining--) {
        const threshold = drop - remaining;
        if (crossed(previousHeatClock, heatClock, threshold)) sound?.crack();
      }
    }
    for (const impact of impacts) impact.age += dt;
    while (impacts.length && impacts[0].age > 0.45) impacts.shift();
    for (const callout of callouts) callout.life -= dt;
    while (callouts.length && callouts[callouts.length - 1].life <= 0) callouts.pop();

    for (const marble of marbles.values()) {
      if (!marble.alive) continue;
      const velocity = controlledVelocity(
        { x: marble.vx, y: marble.vy },
        { x: marble.input.x, y: -marble.input.y },
        dt,
      );
      marble.vx = velocity.x;
      marble.vy = velocity.y;
      if (Math.hypot(marble.vx, marble.vy) < 1.5 && marble.input.x === 0 && marble.input.y === 0) {
        marble.vx = 0;
        marble.vy = 0;
      }
      capVelocity(marble);
      marble.x += marble.vx * dt;
      marble.y += marble.vy * dt;
    }

    resolveCollisions();

    const platform = platformStateAt(heatClock, heatPath);
    for (const marble of marbles.values()) {
      if (marble.alive && !pointOnPlatform(marble.x, marble.y, platform.removed)) eliminate(marble);
    }

    if (heatClock >= HEAT_LIMIT) {
      heatClock = HEAT_LIMIT;
      finishHeat();
      return;
    }
    const alive = [...marbles.values()].filter((marble) => marble.alive).length;
    if (heatClock >= 1 && alive <= 1) finishHeat();
  };

  const update = (dt: number) => {
    if (phase === "complete") return;
    if (scores.size === 0) {
      finishMatchImmediately();
      return;
    }

    const previousPhaseClock = phaseClock;
    phaseClock += dt;
    if (Math.floor(previousPhaseClock) !== Math.floor(phaseClock) && (phase === "playing" || phase === "intermission")) broadcastStatus();
    if (phase === "celebration") {
      if (phaseClock >= FINAL_CELEBRATION) over = true;
      return;
    }

    if (phase === "runway") {
      for (const threshold of [OPENING_RUNWAY - 3, OPENING_RUNWAY - 2, OPENING_RUNWAY - 1]) {
        if (crossed(previousPhaseClock, phaseClock, threshold)) sound?.countdown();
      }
      if (phaseClock >= OPENING_RUNWAY) {
        phase = "playing";
        phaseClock = 0;
        heatClock = 0;
        sound?.go();
        broadcastStatus();
      }
      return;
    }

    if (phase === "intermission") {
      for (const threshold of [INTERMISSION - 3, INTERMISSION - 2, INTERMISSION - 1]) {
        if (crossed(previousPhaseClock, phaseClock, threshold)) sound?.countdown();
      }
      if (phaseClock >= INTERMISSION) {
        heatIndex += 1;
        resetHeat();
        phase = "playing";
        phaseClock = 0;
        heatWinner = "";
        sound?.go();
        broadcastStatus();
      }
      return;
    }

    simulate(dt);
  };

  resetHeat();
  broadcastStatus();

  return {
    onJoin(player) {
      // The five-heat roster is immutable. A late joiner gets an honest
      // spectator screen rather than appearing in heat three with no score.
      spectators.add(player.id);
      sendSpectatorStatus(player.id);
    },

    onLeave(id) {
      scores.delete(id);
      marbles.delete(id);
      spectators.delete(id);
      if (scores.size === 0) finishMatchImmediately();
    },

    onConnectionChange(id, connected) {
      if (connected) {
        if (scores.has(id)) sendStatus(id);
        else if (spectators.has(id)) sendSpectatorStatus(id);
        return;
      }
      const marble = marbles.get(id);
      if (marble) marble.input = { x: 0, y: 0 };
    },

    onInput(playerId, value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      if ((value as { t?: unknown }).t === "sync") {
        if (scores.has(playerId)) sendStatus(playerId);
        else if (spectators.has(playerId)) sendSpectatorStatus(playerId);
        return;
      }
      const marble = marbles.get(playerId);
      if (!marble || (!marble.alive && phase !== "intermission") || phase === "complete" || phase === "celebration") return;
      const input = value as Partial<LastMarbleInput>;
      const rawX = Number.isFinite(input.x) ? Number(input.x) : 0;
      const rawY = Number.isFinite(input.y) ? Number(input.y) : 0;
      const magnitude = Math.hypot(rawX, rawY);
      const scale = magnitude > 1 ? 1 / magnitude : 1;
      marble.input = { x: rawX * scale, y: rawY * scale };
    },

    tick(dt) {
      if (!Number.isFinite(dt) || dt <= 0 || over) return;
      accumulator += Math.min(dt, 0.25);
      while (accumulator + 1e-9 >= FIXED_STEP && !over) {
        accumulator -= FIXED_STEP;
        update(FIXED_STEP);
      }
    },

    resize() {
      /* World-space layout scales from the current canvas dimensions. */
    },

    render(g, w, h) {
      renderGame(g, w, h, {
        phase,
        phaseClock,
        heatClock,
        heatIndex,
        heatWinner,
        matchBanner,
        heatPath,
        marbles: [...marbles.values()],
        scores: [...scores.values()].map((score) => ({ ...score, survivalTenths: score.survivalTenths + (phase === "playing" && marbles.get(score.player.id)?.alive ? Math.round(heatClock * 10) : 0) })).sort((a, b) => internalScore(b) - internalScore(a) || b.wins - a.wins || b.kos - a.kos || a.player.seat - b.player.seat),
        impacts,
        callouts,
      });
    },

    isOver: () => over,

    results(): RoundResult[] {
      let place = 0;
      let previous: MatchScore | null = null;
      return rankedScores().map((score, index) => {
        if (!previous || !scoresTie(previous, score)) place = index + 1;
        previous = score;
        return {
          id: score.player.id,
          place,
          score: PARTY_POINTS[Math.min(place - 1, PARTY_POINTS.length - 1)],
          detail: `5 heats · ${internalScore(score).toFixed(1)} total = ${(score.survivalTenths / 10).toFixed(1)} survival + ${score.kos * 2} KO + ${score.wins * 5} win pts`,
        };
      });
    },

    destroy() {
      sound?.destroy();
    },
  };
}

function renderGame(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: {
    phase: MatchPhase;
    phaseClock: number;
    heatClock: number;
    heatIndex: number;
    heatWinner: string;
    matchBanner: string;
    heatPath: Tile[];
    marbles: Marble[];
    scores: MatchScore[];
    impacts: ImpactRing[];
    callouts: Callout[];
  },
) {
  g.save();
  g.fillStyle = "#0E2226";
  g.fillRect(0, 0, w, h);
  const scale = Math.min(w / 1180, h / 760);
  const ox = w / 2;
  const oy = h / 2 + 8 * scale;
  g.translate(ox, oy);
  g.scale(scale, scale);

  const platform = platformStateAt(state.heatClock, state.heatPath);
  for (let tile = 0 as Tile; tile < 4; tile = (tile + 1) as Tile) {
    if (platform.removed.includes(tile)) continue;
    drawPlate(g, tile, platform.warning === tile, platform.warningProgress);
  }

  for (const impact of state.impacts) {
    const progress = clamp(impact.age / 0.45, 0, 1);
    g.globalAlpha = 1 - progress;
    g.strokeStyle = impact.color;
    g.lineWidth = 8;
    g.beginPath();
    g.arc(impact.x, impact.y, 34 + progress * 58, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;

  for (const marble of state.marbles) {
    if (!marble.alive) continue;
    drawVelocity(g, marble);
    drawMarble(g, marble);
  }
  g.restore();

  drawHud(g, w, h, scale, state, platform);
  g.restore();
}

function drawPlate(g: CanvasRenderingContext2D, tile: Tile, warning: boolean, progress: number) {
  const rect = tileRect(tile);
  const gap = 7;
  g.fillStyle = warning ? "#FFC24A" : "#F6EFE2";
  roundRect(g, rect.x + gap, rect.y + gap, rect.w - gap * 2, rect.h - gap * 2, 18);
  g.fill();
  g.strokeStyle = warning ? "#FF5A47" : "rgba(14,34,38,0.34)";
  g.lineWidth = warning ? 8 + progress * 5 : 4;
  g.stroke();

  if (!warning) return;
  g.save();
  roundRect(g, rect.x + gap, rect.y + gap, rect.w - gap * 2, rect.h - gap * 2, 18);
  g.clip();
  g.strokeStyle = "rgba(14,34,38,0.25)";
  g.lineWidth = 7;
  const offset = progress * 30;
  for (let x = rect.x - rect.h; x < rect.x + rect.w + rect.h; x += 34) {
    g.beginPath();
    g.moveTo(x + offset, rect.y + rect.h);
    g.lineTo(x + rect.h + offset, rect.y);
    g.stroke();
  }
  g.restore();
}

function drawMarble(g: CanvasRenderingContext2D, marble: Marble) {
  g.save();
  g.translate(marble.x, marble.y);
  g.fillStyle = "rgba(14,34,38,0.35)";
  g.beginPath();
  g.ellipse(5, 9, MARBLE_RADIUS + 3, MARBLE_RADIUS - 1, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = marble.color;
  g.strokeStyle = "#0E2226";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(0, 0, MARBLE_RADIUS, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  g.fillStyle = "rgba(246,239,226,0.92)";
  if (marble.seat % 3 === 0) {
    g.fillRect(-MARBLE_RADIUS + 8, -5, MARBLE_RADIUS * 2 - 16, 10);
  } else if (marble.seat % 3 === 1) {
    g.beginPath();
    g.arc(0, 0, 10, 0, Math.PI * 2);
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(-16, 14);
    g.lineTo(0, -16);
    g.lineTo(16, 14);
    g.closePath();
    g.fill();
  }

  g.fillStyle = "#0E2226";
  g.font = "900 20px Archivo, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(marble.seat + 1), 0, 1);
  g.restore();

  const label = `${GLYPHS[marble.seat] ?? "●"} ${marble.name}`;
  g.font = "800 22px Archivo, system-ui, sans-serif";
  const labelWidth = Math.max(90, g.measureText(label).width + 24);
  g.fillStyle = "rgba(14,34,38,0.9)";
  roundRect(g, marble.x - labelWidth / 2, marble.y - 67, labelWidth, 32, 16);
  g.fill();
  g.fillStyle = "#F6EFE2";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, marble.x, marble.y - 51);
}

function drawVelocity(g: CanvasRenderingContext2D, marble: Marble) {
  const speed = Math.hypot(marble.vx, marble.vy);
  if (speed < 20) return;
  const length = clamp(speed * 0.22, 18, 72);
  const nx = marble.vx / speed;
  const ny = marble.vy / speed;
  const tailX = marble.x - nx * length;
  const tailY = marble.y - ny * length;
  g.strokeStyle = marble.color;
  g.lineWidth = 10;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(tailX, tailY);
  g.lineTo(marble.x - nx * (MARBLE_RADIUS + 5), marble.y - ny * (MARBLE_RADIUS + 5));
  g.stroke();
  g.fillStyle = "#0E2226";
  g.beginPath();
  g.moveTo(tailX, tailY);
  g.lineTo(tailX + nx * 15 - ny * 8, tailY + ny * 15 + nx * 8);
  g.lineTo(tailX + nx * 15 + ny * 8, tailY + ny * 15 - nx * 8);
  g.closePath();
  g.fill();
}

function drawHud(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  scale: number,
  state: {
    phase: MatchPhase;
    phaseClock: number;
    heatClock: number;
    heatIndex: number;
    heatWinner: string;
    matchBanner: string;
    scores: MatchScore[];
    callouts: Callout[];
  },
  platform: PlatformState,
) {
  const s = Math.max(1, scale);
  g.textBaseline = "middle";
  g.fillStyle = "#F6EFE2";
  g.textAlign = "left";
  g.font = `900 ${Math.round(27 * s)}px Archivo, system-ui, sans-serif`;
  g.fillText(`HEAT ${state.heatIndex + 1} / ${HEATS}`, 28 * s, 42 * s);
  g.font = `750 ${Math.round(20 * s)}px Archivo, system-ui, sans-serif`;
  g.fillStyle = "rgba(246,239,226,0.7)";
  g.fillText("5-HEAT MATCH", 30 * s, 72 * s);

  if (state.phase === "playing") {
    g.textAlign = "center";
    g.fillStyle = "#F6EFE2";
    g.font = `900 ${Math.round(38 * s)}px Archivo, system-ui, sans-serif`;
    g.fillText(`${Math.max(0, HEAT_LIMIT - state.heatClock).toFixed(1)}s`, w / 2, 43 * s);
    if (platform.warning !== null) {
      g.fillStyle = "#FFC24A";
      g.font = `900 ${Math.round(24 * s)}px Archivo, system-ui, sans-serif`;
      g.fillText(`PLATE DROPS IN ${Math.max(0, Math.ceil((1 - platform.warningProgress) * WARNING_SECONDS))}`, w / 2, 78 * s);
    }
  }

  state.callouts.forEach((callout, index) => {
    g.globalAlpha = clamp(callout.life / Math.min(0.35, callout.maxLife), 0, 1);
    g.textAlign = "center";
    g.font = `900 ${Math.round((index === 0 ? 36 : 25) * s)}px Archivo, system-ui, sans-serif`;
    g.lineWidth = 9 * s;
    g.strokeStyle = "rgba(14,34,38,0.9)";
    g.strokeText(callout.text, w / 2, (112 + index * 43) * s);
    g.fillStyle = callout.color;
    g.fillText(callout.text, w / 2, (112 + index * 43) * s);
  });
  g.globalAlpha = 1;

  const gap = 7 * s;
  const margin = 24 * s;
  const width = Math.min(180 * s, (w - margin * 2 - gap * Math.max(0, state.scores.length - 1)) / Math.max(1, state.scores.length));
  state.scores.forEach((score, index) => {
    const x = margin + index * (width + gap);
    const y = h - 78 * s;
    g.fillStyle = "rgba(14,34,38,0.9)";
    roundRect(g, x, y, width, 58 * s, 16 * s);
    g.fill();
    g.fillStyle = score.player.color;
    g.beginPath();
    g.arc(x + 15 * s, y + 19 * s, 6 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#F6EFE2";
    g.textAlign = "left";
    g.font = `850 ${Math.round(20 * s)}px Archivo, system-ui, sans-serif`;
    g.fillText(`${GLYPHS[score.player.seat] ?? "●"} ${score.player.seat + 1}`, x + 27 * s, y + 19 * s);
    g.textAlign = "right";
    g.font = `850 ${Math.round(18 * s)}px Archivo, system-ui, sans-serif`;
    g.fillText(`${internalScore(score).toFixed(1)} PTS`, x + width - 10 * s, y + 43 * s);
  });

  if (state.phase === "runway") {
    const remaining = Math.max(1, Math.ceil(OPENING_RUNWAY - state.phaseClock));
    drawOverlay(g, w, h, "LAST MARBLE", String(remaining), [
      "RAM WITH MOMENTUM · STAY ON CREAM",
      "5 HEATS · HIGHEST TOTAL WINS",
      "SURVIVE +1/s · KO +2 · HEAT WIN +5",
    ], s);
  } else if (state.phase === "intermission") {
    const remaining = Math.max(1, Math.ceil(INTERMISSION - state.phaseClock));
    drawOverlay(g, w, h, state.heatWinner ? `${state.heatWinner.toUpperCase()} TAKES THE HEAT` : "NO SOLE SURVIVOR", String(remaining), [
      `HEAT ${state.heatIndex + 2} STARTS NEXT · SET YOUR THUMB`,
      "TOTAL = SURVIVAL SECONDS + 2 PER KO + 5 PER WIN",
    ], s);
  } else if (state.phase === "playing" && state.phaseClock < 0.8) {
    g.fillStyle = "#FFC24A";
    g.textAlign = "center";
    g.font = `900 ${Math.round(100 * s)}px Archivo, system-ui, sans-serif`;
    g.fillText("GO!", w / 2, h * 0.4);
  } else if (state.phase === "celebration") {
    drawOverlay(g, w, h, state.matchBanner, "★", ["FINAL STANDINGS"], s);
  }
}

function drawOverlay(g: CanvasRenderingContext2D, w: number, h: number, title: string, number: string, lines: string[], scale: number) {
  g.fillStyle = "rgba(14,34,38,0.78)";
  g.fillRect(0, 0, w, h);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#FFC24A";
  g.font = `900 ${Math.round(70 * scale)}px Archivo, system-ui, sans-serif`;
  g.fillText(title, w / 2, h * 0.28);
  g.fillStyle = "#F6EFE2";
  g.font = `900 ${Math.round(160 * scale)}px Archivo, system-ui, sans-serif`;
  g.fillText(number, w / 2, h * 0.52);
  lines.forEach((line, index) => {
    g.font = `850 ${Math.round((index === 0 ? 28 : 21) * scale)}px Archivo, system-ui, sans-serif`;
    g.fillText(line, w / 2, h * 0.72 + index * 38 * scale);
  });
}

function tileRect(tile: Tile) {
  const w = PLATFORM_WIDTH / 2;
  const h = PLATFORM_HEIGHT / 2;
  return {
    x: tile % 2 === 0 ? -w : 0,
    y: tile < 2 ? -h : 0,
    w,
    h,
  };
}

function pointOnPlatform(x: number, y: number, removed: readonly Tile[]) {
  if (x < -PLATFORM_WIDTH / 2 || x > PLATFORM_WIDTH / 2 || y < -PLATFORM_HEIGHT / 2 || y > PLATFORM_HEIGHT / 2) return false;
  const tile = (y >= 0 ? 2 : 0) + (x >= 0 ? 1 : 0) as Tile;
  return !removed.includes(tile);
}

function capVelocity(marble: Marble) {
  const speed = Math.hypot(marble.vx, marble.vy);
  if (speed <= MAX_SPEED) return;
  const scale = MAX_SPEED / speed;
  marble.vx *= scale;
  marble.vy *= scale;
}

function controlledVelocity(velocity: Vector, input: Vector, dt: number) {
  let vx = velocity.x + input.x * ACCELERATION * dt;
  let vy = velocity.y + input.y * ACCELERATION * dt;
  const damping = Math.exp(-DRAG * dt);
  vx *= damping;
  vy *= damping;
  const speed = Math.hypot(vx, vy);
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    vx *= scale;
    vy *= scale;
  }
  return { x: vx, y: vy };
}

function internalScore(score: MatchScore) {
  return score.survivalTenths / 10 + score.kos * 2 + score.wins * 5;
}

function scoresTie(a: MatchScore, b: MatchScore) {
  return internalScore(a) === internalScore(b) && a.wins === b.wins && a.kos === b.kos;
}

function heatSeed(seed: number, heatIndex: number) {
  return hash(seed ^ Math.imul(heatIndex + 1, 0x85ebca6b));
}

function hash(value: number) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}

function crossed(previous: number, current: number, threshold: number) {
  return previous < threshold && current >= threshold;
}

function fitText(g: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (g.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped && g.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
  return `${clipped}…`;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  g.beginPath();
  g.moveTo(x + radius, y);
  g.arcTo(x + w, y, x + w, y + h, radius);
  g.arcTo(x + w, y + h, x, y + h, radius);
  g.arcTo(x, y + h, x, y, radius);
  g.arcTo(x, y, x + w, y, radius);
  g.closePath();
}
