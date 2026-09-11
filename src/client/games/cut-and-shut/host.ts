import type { Player, RoundResult } from "../../../shared/protocol";
import { createFinalCountdown } from "../../final-countdown";
import type { GameHost, HostContext } from "../registry";
import { drawCourierSprite, preloadCourierSprite } from "./courier-sprite";
import { CutAndShutSound } from "./sound";
import type { CutAndShutFrame, CutAndShutInput, CutPhase, RoadShape } from "./protocol";

export const CUT_AND_SHUT_RULES = {
  rounds: 4,
  runwaySeconds: 8,
  planningSeconds: 18,
  foldSeconds: 1.4,
  beatSeconds: 1,
  marchSteps: 6,
  recapSeconds: 5,
  finalSeconds: 5,
  sharedPoints: 1,
} as const;

const COLS = 4;
const ROWS = 3;
const TILE_COUNT = COLS * ROWS;
const COURIER_COUNT = 6;
const CIRCUIT_POSITIONS = [0, 1, 2, 3, 7, 11, 10, 9, 8, 4] as const;
const CIRCUIT_INCOMING = [0, 1, 1, 1, 2, 2, 3, 3, 3, 0] as const;

interface PlayerState {
  player: Player;
  active: boolean;
  connected: boolean;
  tileId: number | null;
  inputSeq: number;
}

export interface RoundTile {
  id: number;
  position: number;
  shape: RoadShape;
  rotation: number;
  safeRotation: number;
  ownerId: string | null;
}

export interface CourierState {
  id: number;
  tile: number;
  fromTile: number;
  direction: number;
  alive: boolean;
  failedAt: number | null;
}

export interface RoundBoard {
  layout: number[];
  tiles: RoundTile[];
  couriers: CourierState[];
}

export interface ResolutionSummary {
  steps: number;
  survivors: number;
  destinations: number[];
}

/** Physical tile ids move through these fixed 4 × 3 fold layouts. */
export function layoutForRound(round: number): number[] {
  const layouts = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11],
    [8, 9, 2, 3, 4, 5, 6, 7, 0, 1, 10, 11],
    [11, 10, 2, 3, 7, 6, 5, 4, 8, 9, 1, 0],
    [3, 2, 10, 11, 4, 5, 6, 7, 0, 1, 9, 8],
  ];
  return [...layouts[Math.max(0, Math.min(layouts.length - 1, round))]];
}

/**
 * Builds a solvable circuit, then scrambles only player-owned perimeter roads.
 * The returned canonical rotations are host/test state and never sent to phones.
 */
export function buildRoundBoard(seed: number, round: number, players: readonly Pick<Player, "id" | "seat">[]): RoundBoard {
  const layout = layoutForRound(round);
  const ordered = [...players].sort((a, b) => a.seat - b.seat || a.id.localeCompare(b.id)).slice(0, 10);
  const ownerByPosition = new Map<number, string>();
  const start = mod(hash(seed) + round * 3, CIRCUIT_POSITIONS.length);
  ordered.forEach((player, index) => ownerByPosition.set(CIRCUIT_POSITIONS[mod(start + index, 10)], player.id));

  const tiles = layout.map((id, position): RoundTile => {
    const { shape, rotation: safeRotation } = roadForPosition(position);
    const ownerId = ownerByPosition.get(position) ?? null;
    let rotation = safeRotation;
    if (ownerId) {
      const amount = shape === "straight"
        ? 1
        : 1 + mod(hash(seed ^ Math.imul(round + 1, 0x85ebca6b) ^ Math.imul(id + 1, 0x27d4eb2d)), 3);
      rotation = mod(safeRotation + amount, 4);
    }
    return { id, position, shape, rotation, safeRotation, ownerId };
  });

  const courierOffset = mod(hash(seed ^ Math.imul(round + 1, 0x45d9f3b)), CIRCUIT_POSITIONS.length);
  const couriers = Array.from({ length: COURIER_COUNT }, (_, id) => {
    const circuitIndex = mod(courierOffset + id * 3, CIRCUIT_POSITIONS.length);
    const tile = layout[CIRCUIT_POSITIONS[circuitIndex]];
    return {
      id,
      tile,
      fromTile: tile,
      direction: CIRCUIT_INCOMING[circuitIndex],
      alive: true,
      failedAt: null,
    };
  });
  return { layout, tiles, couriers };
}

/** Direction is 0=N, 1=E, 2=S, 3=W and describes travel into this tile. */
export function roadDirection(shape: RoadShape, rotation: number, travelDirection: number): number | null {
  const direction = mod(travelDirection, 4);
  if (shape === "junction") return direction;
  const incomingEdge = mod(direction + 2, 4);
  const arms = roadArms(shape, rotation);
  if (!arms.includes(incomingEdge)) return null;
  return arms[0] === incomingEdge ? arms[1] : arms[0];
}

export function roadArms(shape: RoadShape, rotation: number): number[] {
  const turn = mod(rotation, 4);
  if (shape === "junction") return [0, 1, 2, 3];
  if (shape === "straight") return turn % 2 === 0 ? [1, 3] : [0, 2];
  return [turn, mod(turn + 1, 4)];
}

export function neighborInLayout(layout: readonly number[], tile: number, direction: number) {
  const position = layout.indexOf(tile);
  if (position < 0) return null;
  const row = Math.floor(position / COLS);
  const col = position % COLS;
  const nextRow = row + (direction === 0 ? -1 : direction === 2 ? 1 : 0);
  const nextCol = col + (direction === 1 ? 1 : direction === 3 ? -1 : 0);
  if (nextRow < 0 || nextRow >= ROWS || nextCol < 0 || nextCol >= COLS) return null;
  return layout[nextRow * COLS + nextCol];
}

export function resolveCouriers(
  initial: readonly CourierState[],
  layout: readonly number[],
  tiles: readonly Pick<RoundTile, "id" | "shape" | "rotation">[],
): { couriers: CourierState[]; summary: ResolutionSummary } {
  const couriers = initial.map((courier) => ({ ...courier }));
  const roads = new Map(tiles.map((tile) => [tile.id, tile]));
  for (let step = 0; step < CUT_AND_SHUT_RULES.marchSteps; step += 1) {
    stepCouriers(couriers, layout, roads, step);
  }
  return {
    couriers,
    summary: {
      steps: CUT_AND_SHUT_RULES.marchSteps,
      survivors: couriers.filter((courier) => courier.alive).length,
      destinations: couriers.filter((courier) => courier.alive).map((courier) => courier.tile),
    },
  };
}

export function createHost(ctx: HostContext): GameHost {
  void preloadCourierSprite();
  const players = new Map<string, PlayerState>();
  for (const player of [...ctx.players].sort((a, b) => a.seat - b.seat || a.id.localeCompare(b.id))) {
    players.set(player.id, { player, active: true, connected: player.connected, tileId: null, inputSeq: 0 });
  }
  const spectators = new Map<string, Player>();
  let round = 0;
  let phase: CutPhase = players.size ? "runway" : "complete";
  let phaseClock = 0;
  let phoneClock = 0;
  let marchStep = 0;
  let teamScore = 0;
  let totalSurvivors = 0;
  let lastSurvivors = COURIER_COUNT;
  let board = buildRoundBoard(ctx.seed, round, activePlayers().map((state) => state.player));
  let foldFromLayout = [...board.layout];
  let foldToLayout = [...board.layout];
  let couriers = board.couriers.map((courier) => ({ ...courier }));
  let over = players.size === 0;
  let sound: CutAndShutSound | null = typeof AudioContext === "undefined" ? null : new CutAndShutSound();
  const finalCountdown = createFinalCountdown();
  const reducedMotion = typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  assignBoardOwnership();

  function activePlayers() {
    return [...players.values()]
      .filter((state) => state.active)
      .sort((a, b) => a.player.seat - b.player.seat || a.player.id.localeCompare(b.player.id));
  }

  function tileById(id: number | null) {
    return id === null ? undefined : board.tiles.find((tile) => tile.id === id);
  }

  function assignBoardOwnership() {
    for (const state of players.values()) state.tileId = null;
    for (const tile of board.tiles) {
      if (!tile.ownerId) continue;
      const state = players.get(tile.ownerId);
      if (!state?.active) {
        tile.ownerId = null;
        tile.rotation = tile.safeRotation;
        continue;
      }
      state.tileId = tile.id;
      if (!state.connected) tile.rotation = tile.safeRotation;
    }
  }

  function forecast() {
    return resolveCouriers(board.couriers, board.layout, board.tiles).summary.survivors;
  }

  function secondsRemaining() {
    if (phase === "runway") return Math.max(0, CUT_AND_SHUT_RULES.runwaySeconds - phaseClock);
    if (phase === "fold") return Math.max(0, CUT_AND_SHUT_RULES.foldSeconds - phaseClock);
    if (phase === "planning") return Math.max(0, CUT_AND_SHUT_RULES.planningSeconds - phaseClock);
    if (phase === "march") return Math.max(0, CUT_AND_SHUT_RULES.marchSteps - marchStep);
    if (phase === "recap") return Math.max(0, CUT_AND_SHUT_RULES.recapSeconds - phaseClock);
    if (phase === "complete") return Math.max(0, CUT_AND_SHUT_RULES.finalSeconds - phaseClock);
    return 0;
  }

  function messageFor(state: PlayerState) {
    if (!state.connected) return "Signal lost. Your road has been safely restored.";
    if (phase === "runway") return "Find your name on the city, then turn the same road here.";
    if (phase === "fold") return "The city is folding into the next circuit.";
    if (phase === "planning") return "Turn your road, then look up at the shared route.";
    if (phase === "march") return "Look up. All six couriers move together.";
    if (phase === "recap") return `${lastSurvivors} of 6 stayed on the road.`;
    return `The team kept ${totalSurvivors} of 24 courier runs safe.`;
  }

  function frameFor(state: PlayerState): CutAndShutFrame {
    const tile = tileById(state.tileId);
    return {
      t: "cutAndShutState",
      phase,
      round: Math.min(4, round + 1),
      rounds: 4,
      seconds: secondsRemaining(),
      road: tile && tile.shape !== "junction" ? { shape: tile.shape, rotation: tile.rotation } : null,
      inputSeq: state.inputSeq,
      safeCouriers: phase === "march" || phase === "recap" || phase === "complete" ? couriers.filter((courier) => courier.alive).length : forecast(),
      survivors: lastSurvivors,
      teamScore,
      message: messageFor(state),
    };
  }

  function sendState(id: string) {
    const state = players.get(id);
    if (state?.active) ctx.send(frameFor(state), id);
  }

  function sendSpectator(player: Player) {
    ctx.send({
      t: "cutAndShutState",
      phase: "spectator",
      round: Math.min(4, round + 1),
      rounds: 4,
      seconds: secondsRemaining(),
      road: null,
      inputSeq: 0,
      safeCouriers: phase === "march" || phase === "recap" || phase === "complete" ? couriers.filter((courier) => courier.alive).length : forecast(),
      survivors: lastSurvivors,
      teamScore,
      message: "This circuit is in progress. You join the next game.",
    } satisfies CutAndShutFrame, player.id);
  }

  function sendAll() {
    for (const state of activePlayers()) sendState(state.player.id);
    for (const spectator of spectators.values()) sendSpectator(spectator);
  }

  function beginPlanning() {
    phase = "planning";
    phaseClock = 0;
    phoneClock = 0;
    marchStep = 0;
    couriers = board.couriers.map((courier) => ({ ...courier }));
    sendAll();
  }

  function beginFold() {
    round += 1;
    phase = "fold";
    phaseClock = 0;
    phoneClock = 0;
    foldFromLayout = [...board.layout];
    board = buildRoundBoard(ctx.seed, round, activePlayers().map((state) => state.player));
    foldToLayout = [...board.layout];
    assignBoardOwnership();
    couriers = board.couriers.map((courier) => ({ ...courier }));
    sound?.play("fold");
    sendAll();
  }

  function beginMarch() {
    phase = "march";
    phaseClock = 0;
    phoneClock = 0;
    marchStep = 0;
    couriers = board.couriers.map((courier) => ({ ...courier }));
    sendAll();
  }

  function marchOnce() {
    const roads = new Map(board.tiles.map((tile) => [tile.id, tile]));
    stepCouriers(couriers, board.layout, roads, marchStep);
    marchStep += 1;
    sound?.play("step");
    if (couriers.some((courier) => courier.failedAt === marchStep - 1)) sound?.play("fail");
    if (marchStep < CUT_AND_SHUT_RULES.marchSteps) return;
    lastSurvivors = couriers.filter((courier) => courier.alive).length;
    totalSurvivors += lastSurvivors;
    teamScore += lastSurvivors * CUT_AND_SHUT_RULES.sharedPoints;
    phase = "recap";
    phaseClock = 0;
    phoneClock = 0;
    sound?.play("result");
    sendAll();
  }

  function beginComplete() {
    phase = "complete";
    phaseClock = 0;
    phoneClock = 0;
    sound?.play("result");
    sendAll();
  }

  function onInput(playerId: string, value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const input = value as Partial<CutAndShutInput> & Record<string, unknown>;
    const state = players.get(playerId);
    if (input.t === "sync") {
      if (state?.active) sendState(playerId);
      else if (spectators.has(playerId)) sendSpectator(spectators.get(playerId)!);
      return;
    }
    if (!state?.active || !state.connected || phase !== "planning" || input.t !== "rotate") return;
    if (!Number.isInteger(input.round) || input.round !== round + 1) return;
    if (!Number.isInteger(input.seq) || Number(input.seq) <= state.inputSeq || Number(input.seq) > state.inputSeq + 100) return;
    if (!Number.isInteger(input.rotation) || Number(input.rotation) < 0 || Number(input.rotation) > 3) return;
    const tile = tileById(state.tileId);
    if (!tile || tile.ownerId !== playerId || tile.shape === "junction") return;
    state.inputSeq = Number(input.seq);
    tile.rotation = Number(input.rotation);
    sound?.play("stitch");
  }

  return {
    onInput,
    onJoin(player) {
      const existing = players.get(player.id);
      if (existing?.active) {
        existing.player = player;
        existing.connected = player.connected;
        sendState(player.id);
        return;
      }
      spectators.set(player.id, player);
      sendSpectator(player);
    },
    onLeave(id) {
      spectators.delete(id);
      const state = players.get(id);
      if (!state?.active) return;
      const tile = tileById(state.tileId);
      if (tile) {
        tile.rotation = tile.safeRotation;
        tile.ownerId = null;
      }
      state.tileId = null;
      state.active = false;
      state.connected = false;
      if (!activePlayers().length) {
        phase = "complete";
        over = true;
      }
      sendAll();
    },
    onConnectionChange(id, connected) {
      const state = players.get(id);
      if (!state?.active) return;
      state.connected = connected;
      const tile = tileById(state.tileId);
      if (!connected && tile) tile.rotation = tile.safeRotation;
      sendAll();
    },
    tick(dt) {
      if (over || !Number.isFinite(dt) || dt <= 0) {
        finalCountdown.update(null);
        return;
      }
      const step = Math.min(dt, 0.1);
      phaseClock += step;
      phoneClock += step;
      if (phoneClock + 1e-7 >= 0.5) {
        phoneClock %= 0.5;
        sendAll();
      }
      if (phase === "runway" && phaseClock + 1e-7 >= CUT_AND_SHUT_RULES.runwaySeconds) beginPlanning();
      else if (phase === "planning" && phaseClock + 1e-7 >= CUT_AND_SHUT_RULES.planningSeconds) beginMarch();
      else if (phase === "fold" && phaseClock + 1e-7 >= CUT_AND_SHUT_RULES.foldSeconds) beginPlanning();
      else if (phase === "march" && phaseClock + 1e-7 >= CUT_AND_SHUT_RULES.beatSeconds) {
        phaseClock -= CUT_AND_SHUT_RULES.beatSeconds;
        marchOnce();
      } else if (phase === "recap" && phaseClock + 1e-7 >= CUT_AND_SHUT_RULES.recapSeconds) {
        if (round + 1 >= CUT_AND_SHUT_RULES.rounds) beginComplete();
        else beginFold();
      } else if (phase === "complete" && phaseClock + 1e-7 >= CUT_AND_SHUT_RULES.finalSeconds) {
        over = true;
        sendAll();
      }
      finalCountdown.update(phase === "planning" ? secondsRemaining() : null);
    },
    render(c, w, h) {
      renderHost(c, w, h, {
        phase,
        round,
        seconds: secondsRemaining(),
        board,
        foldFromLayout,
        foldToLayout,
        players: activePlayers(),
        couriers,
        marchStep,
        phaseClock,
        safeCouriers: phase === "march" || phase === "recap" || phase === "complete" ? couriers.filter((courier) => courier.alive).length : forecast(),
        lastSurvivors,
        teamScore,
        totalSurvivors,
        reducedMotion,
      });
    },
    isOver: () => over,
    results: () => resultsFor(activePlayers(), teamScore, totalSurvivors),
    destroy() {
      finalCountdown.destroy();
      sound?.destroy();
      sound = null;
      spectators.clear();
    },
  };
}

function resultsFor(players: PlayerState[], teamScore: number, totalSurvivors: number): RoundResult[] {
  return players.map(({ player }) => ({
    id: player.id,
    place: 1,
    score: teamScore,
    detail: `${totalSurvivors} of 24 courier runs safe`,
  }));
}

function roadForPosition(position: number): { shape: RoadShape; rotation: number } {
  if (position === 5 || position === 6) return { shape: "junction", rotation: 0 };
  if (position === 0) return { shape: "bend", rotation: 1 };
  if (position === 3) return { shape: "bend", rotation: 2 };
  if (position === 8) return { shape: "bend", rotation: 0 };
  if (position === 11) return { shape: "bend", rotation: 3 };
  return { shape: "straight", rotation: position === 4 || position === 7 ? 1 : 0 };
}

function stepCouriers(
  couriers: CourierState[],
  layout: readonly number[],
  roads: ReadonlyMap<number, Pick<RoundTile, "shape" | "rotation">>,
  step: number,
) {
  for (const courier of couriers) {
    if (!courier.alive) continue;
    const road = roads.get(courier.tile);
    const direction = road ? roadDirection(road.shape, road.rotation, courier.direction) : null;
    const next = direction === null ? null : neighborInLayout(layout, courier.tile, direction);
    courier.fromTile = courier.tile;
    if (next === null) {
      courier.alive = false;
      courier.failedAt = step;
    } else {
      courier.direction = direction!;
      courier.tile = next;
    }
  }
}

function renderHost(c: CanvasRenderingContext2D, w: number, h: number, state: {
  phase: CutPhase;
  round: number;
  seconds: number;
  board: RoundBoard;
  foldFromLayout: number[];
  foldToLayout: number[];
  players: PlayerState[];
  couriers: CourierState[];
  marchStep: number;
  phaseClock: number;
  safeCouriers: number;
  lastSurvivors: number;
  teamScore: number;
  totalSurvivors: number;
  reducedMotion: boolean;
}) {
  c.save();
  c.fillStyle = "#6F607D";
  c.fillRect(0, 0, w, h);
  const scale = Math.min(w / 1280, h / 720);
  c.scale(scale, scale);
  const vw = w / scale;
  const vh = h / scale;
  c.textBaseline = "middle";
  c.lineJoin = "round";
  drawHeader(c, state, vw);
  drawBoard(c, state, vw, vh);
  drawOverlay(c, state, vw, vh);
  c.restore();
}

function drawHeader(c: CanvasRenderingContext2D, state: Parameters<typeof renderHost>[3], vw: number) {
  c.fillStyle = "#17131C";
  c.fillRect(0, 0, vw, 94);
  c.fillStyle = "#F2F53D";
  c.font = "1000 34px system-ui, sans-serif";
  c.fillText("CUT & SHUT", 28, 35);
  c.fillStyle = "#FFF3D1";
  c.font = "850 17px system-ui, sans-serif";
  c.fillText(`ROUND ${state.round + 1} / 4`, 30, 70);
  c.textAlign = "center";
  c.font = "950 25px system-ui, sans-serif";
  c.fillText(phaseTitle(state.phase), Math.min(vw * 0.52, vw - 545), 34);
  c.fillStyle = state.safeCouriers === 6 ? "#F2F53D" : "#FFF3D1";
  c.font = "900 19px system-ui, sans-serif";
  c.fillText(`${state.safeCouriers} / 6 SAFE`, Math.min(vw * 0.52, vw - 545), 69);
  c.textAlign = "right";
  c.fillStyle = state.seconds <= 5 ? "#F2F53D" : "#FFF3D1";
  c.font = "1000 42px ui-monospace, monospace";
  const clock = state.phase === "march" ? `${state.marchStep}/6` : String(Math.ceil(state.seconds)).padStart(2, "0");
  c.fillText(clock, vw - 355, 47);
  c.textAlign = "left";
}

function drawBoard(c: CanvasRenderingContext2D, state: Parameters<typeof renderHost>[3], vw: number, vh: number) {
  const centerX = vw * 0.46;
  const originY = 180;
  const tileW = Math.min(265, vw / 4.75);
  const tileH = tileW * 0.59;
  const foldProgress = state.phase === "fold"
    ? state.reducedMotion ? 1 : smoothStep(Math.min(1, state.phaseClock / CUT_AND_SHUT_RULES.foldSeconds))
    : 1;
  const lift = state.phase === "fold" && !state.reducedMotion ? Math.sin(foldProgress * Math.PI) * 34 : 0;
  const centerFor = (tile: number) => {
    if (state.phase !== "fold") return tileCenter(state.board.layout, tile, centerX, originY, tileW, tileH);
    const from = tileCenter(state.foldFromLayout, tile, centerX, originY, tileW, tileH);
    const to = tileCenter(state.foldToLayout, tile, centerX, originY, tileW, tileH);
    return { x: from.x + (to.x - from.x) * foldProgress, y: from.y + (to.y - from.y) * foldProgress };
  };
  const orderedTiles = [...state.board.tiles].sort((a, b) => centerFor(a.id).y - centerFor(b.id).y || centerFor(a.id).x - centerFor(b.id).x);
  for (const tile of orderedTiles) {
    const point = centerFor(tile.id);
    const owner = tile.ownerId ? state.players.find((item) => item.player.id === tile.ownerId)?.player : undefined;
    drawIsoTile(c, point.x, point.y - ((tile.id + state.round) % 2 ? lift : 0), tileW, tileH, tile, owner);
  }

  // Labels sit above the complete slab stack so foreground tiles cannot cut
  // the names off. Couriers remain the final live layer over the city.
  for (const tile of orderedTiles) {
    if (!tile.ownerId) continue;
    const owner = state.players.find((item) => item.player.id === tile.ownerId)?.player;
    if (!owner) continue;
    const point = centerFor(tile.id);
    drawOwnerLabel(c, point.x, point.y - ((tile.id + state.round) % 2 ? lift : 0), tileW, tileH, owner);
  }

  for (const courier of state.couriers) {
    const point = centerFor(courier.tile);
    const previous = state.phase === "fold" ? point : tileCenter(state.board.layout, courier.fromTile, centerX, originY, tileW, tileH);
    const beat = state.phase === "march" && !state.reducedMotion ? Math.min(1, state.phaseClock / CUT_AND_SHUT_RULES.beatSeconds) : 1;
    const eased = 1 - Math.pow(1 - beat, 3);
    const cluster = state.couriers.filter((item) => item.tile === courier.tile);
    const clusterIndex = cluster.findIndex((item) => item.id === courier.id);
    const clusterAngle = clusterIndex / Math.max(1, cluster.length) * Math.PI * 2 - Math.PI / 2;
    const radius = cluster.length > 1 ? 22 + cluster.length * 2 : 0;
    let x = previous.x + (point.x - previous.x) * eased + Math.cos(clusterAngle) * radius;
    let y = previous.y + (point.y - previous.y) * eased - 8 + Math.sin(clusterAngle) * radius * 0.55;
    if (!courier.alive) {
      const distance = state.reducedMotion ? 34 : 58;
      x += [0, 1, 0, -1][courier.direction] * distance;
      y += [-0.45, 0.2, 0.55, 0.2][courier.direction] * distance;
      c.save();
      c.globalAlpha = 0.62;
      c.translate(x, y);
      c.rotate(courier.id % 2 ? -0.34 : 0.34);
      drawCourierSprite(c, { x: 0, y: 0, direction: courier.direction, height: 68 });
      c.restore();
      continue;
    }
    drawCourierSprite(c, { x, y, direction: courier.direction, height: 68 });
    c.fillStyle = "#17131C";
    c.beginPath();
    c.moveTo(x - 6, y + 6);
    c.lineTo(x + 6, y + 6);
    c.lineTo(x, y + 13);
    c.closePath();
    c.fill();
  }

  c.fillStyle = "rgba(23,19,28,.9)";
  c.fillRect(24, vh - 65, vw - 48, 43);
  c.fillStyle = "#FFF3D1";
  c.font = "850 19px system-ui, sans-serif";
  c.textAlign = "center";
  c.fillText(boardCaption(state), vw / 2, vh - 43);
  c.textAlign = "left";
}

function drawIsoTile(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tile: RoundTile, owner?: Player) {
  const polygon = () => {
    c.beginPath();
    c.moveTo(x, y - h / 2);
    c.lineTo(x + w / 2, y);
    c.lineTo(x, y + h / 2);
    c.lineTo(x - w / 2, y);
    c.closePath();
  };
  c.fillStyle = "#33293A";
  c.save();
  c.translate(0, 11);
  polygon();
  c.fill();
  c.restore();
  c.fillStyle = owner ? "#C9B9D6" : "#B8A7C8";
  polygon();
  c.fill();
  c.strokeStyle = owner?.color ?? "#17131C";
  c.lineWidth = owner ? 7 : 4;
  c.stroke();

  c.save();
  c.translate(x, y);
  const vectors = [[1, -1], [1, 1], [-1, 1], [-1, -1]] as const;
  c.lineCap = "round";
  for (const line of [{ color: "#17131C", width: 22 }, { color: owner?.color ?? "#FFF3D1", width: 13 }]) {
    c.strokeStyle = line.color;
    c.lineWidth = line.width;
    c.beginPath();
    for (const direction of roadArms(tile.shape, tile.rotation)) {
      const [dx, dy] = vectors[direction];
      c.moveTo(0, 0);
      c.lineTo(dx * w * 0.245, dy * h * 0.255);
    }
    c.stroke();
  }
  c.fillStyle = owner?.color ?? "#FFF3D1";
  c.beginPath();
  c.arc(0, 0, 8, 0, Math.PI * 2);
  c.fill();
  c.restore();

}

function drawOwnerLabel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, owner: Player) {
  const label = shortName(owner.name, 12);
  c.font = "950 18px system-ui, sans-serif";
  const labelWidth = Math.min(w * 0.78, Math.max(82, c.measureText(label).width + 28));
  c.fillStyle = owner.color;
  c.fillRect(x - labelWidth / 2, y + h * 0.25, labelWidth, 31);
  c.strokeStyle = "#17131C";
  c.lineWidth = 3;
  c.strokeRect(x - labelWidth / 2, y + h * 0.25, labelWidth, 31);
  c.fillStyle = "#17131C";
  c.textAlign = "center";
  c.fillText(label, x, y + h * 0.25 + 16);
  c.textAlign = "left";
}

function drawOverlay(c: CanvasRenderingContext2D, state: Parameters<typeof renderHost>[3], vw: number, vh: number) {
  if (state.phase === "recap") {
    c.fillStyle = "rgba(23,19,28,.94)";
    c.fillRect(205, 225, vw - 410, 170);
    c.textAlign = "center";
    c.fillStyle = "#F2F53D";
    c.font = "1000 52px system-ui, sans-serif";
    c.fillText(`${state.lastSurvivors} / 6 SAFE`, vw / 2, 280);
    c.fillStyle = "#FFF3D1";
    c.font = "850 24px system-ui, sans-serif";
    c.fillText(`+${state.lastSurvivors} team points`, vw / 2, 344);
    c.textAlign = "left";
  } else if (state.phase === "complete") {
    c.fillStyle = "rgba(23,19,28,.95)";
    c.fillRect(170, 180, vw - 340, 245);
    c.textAlign = "center";
    c.fillStyle = "#F2F53D";
    c.font = "1000 53px system-ui, sans-serif";
    c.fillText(`${state.totalSurvivors} / 24 SAFE`, vw / 2, 250);
    c.fillStyle = "#FFF3D1";
    c.font = "950 32px system-ui, sans-serif";
    c.fillText(`${state.teamScore} POINTS EACH`, vw / 2, 322);
    c.fillStyle = "#B8A7C8";
    c.font = "800 20px system-ui, sans-serif";
    c.fillText("One city. One score.", vw / 2, 375);
    c.textAlign = "left";
  }
}

function phaseTitle(phase: CutPhase) {
  if (phase === "runway") return "KEEP ALL SIX ON THE ROAD";
  if (phase === "fold") return "CITY FOLD";
  if (phase === "planning") return "TURN YOUR ROAD";
  if (phase === "march") return "COURIERS MOVING";
  if (phase === "recap") return "ROUTE CHECK";
  return "TEAM RESULT";
}

function boardCaption(state: Parameters<typeof renderHost>[3]) {
  if (state.phase === "planning") return "FIND YOUR NAME · TAP TURN ROAD ON YOUR PHONE";
  if (state.phase === "fold") return "THE FOLD FINISHES BEFORE ANYONE PLANS";
  if (state.phase === "march") return `ALL SIX MOVE TOGETHER · ${state.marchStep} / 6 BEATS`;
  if (state.phase === "recap") return `${state.lastSurvivors} COURIERS SURVIVED THIS ROUND`;
  if (state.phase === "runway") return "FIND YOUR NAME · YOUR PHONE TURNS THAT ROAD";
  return "KEEP ALL SIX COURIERS ON THE ROAD";
}

function tileCenter(layout: readonly number[], tile: number, centerX: number, originY: number, tileW: number, tileH: number) {
  const position = Math.max(0, layout.indexOf(tile));
  const row = Math.floor(position / COLS);
  const col = position % COLS;
  return { x: centerX + (col - row) * tileW * 0.5, y: originY + (col + row) * tileH * 0.5 };
}

function hash(value: number) {
  let result = value | 0;
  result = Math.imul(result ^ (result >>> 16), 0x7feb352d);
  result = Math.imul(result ^ (result >>> 15), 0x846ca68b);
  return (result ^ (result >>> 16)) >>> 0;
}

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function smoothStep(value: number) {
  return value * value * (3 - 2 * value);
}

function shortName(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
