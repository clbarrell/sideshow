import type { Player } from "../../../shared/protocol";
import { createFinalCountdown } from "../../final-countdown";
import type { GameHost, HostContext } from "../registry";
import { type BorderlineFrame, type BorderlinePhase, isBorderlineInput } from "./protocol";
import {
  advanceForces,
  bankTerritoryScores,
  createCampaignWorld,
  fallbackOrder,
  FORCE_SET,
  homeSlotFor,
  legalTargets,
  orderIsLegal,
  PROVINCES,
  rankedResults,
  resolveTurn,
  type BorderlineOrder,
  type CampaignPlayer,
  type EffectiveOrder,
  type Force,
  type PlayerOutcome,
  type TurnResolution,
} from "./rules";
import { createBorderlineSound } from "./sound";

export const BORDERLINE_TIMING = {
  teach: 18,
  practice: 10,
  practiceReveal: 4,
  countdown: 4,
  planning: 20,
  reveal: 4,
  recap: 2.4,
  finale: 4,
  phoneFrame: 0.5,
} as const;

interface PlayerState {
  player: Player;
  campaign: CampaignPlayer;
  active: boolean;
  connected: boolean;
  synced: boolean;
  inputSeq: number;
  order: BorderlineOrder | null;
}

interface PendingResolution {
  practice: boolean;
  before: Array<string | null>;
  orders: Map<string, EffectiveOrder>;
  result: TurnResolution;
}

const REQUIRED_PLAYERS = 10;
const TURNS = 9;
const CAPTURE_REVEAL_AT = 1.45;

export function createHost(ctx: HostContext): GameHost {
  const session = createSessionId(ctx.seed);
  const roster = [...ctx.players].sort((a, b) => a.seat - b.seat || a.id.localeCompare(b.id));
  const campaign = createCampaignWorld(ctx.seed, roster);
  const states = new Map<string, PlayerState>();
  for (const member of campaign.players) {
    const player = roster.find((candidate) => candidate.id === member.id)!;
    states.set(member.id, {
      player,
      campaign: member,
      active: true,
      connected: player.connected,
      synced: false,
      inputSeq: 0,
      order: null,
    });
  }
  const spectators = new Map<string, Player>();
  let phase: BorderlinePhase = roster.length === REQUIRED_PLAYERS ? "loading" : "complete";
  let turn = 0;
  let phaseClock = 0;
  let phoneClock = 0;
  let ownership = [...campaign.ownership];
  let frozenOwnership = [...ownership];
  let scores = new Map(campaign.players.map((player) => [player.id, 0]));
  let previousScores = new Map(scores);
  let lastBanked = new Map(campaign.players.map((player) => [player.id, 0]));
  let forces = new Map(campaign.players.map((player) => [player.id, [...FORCE_SET] as Force[]]));
  let pending: PendingResolution | null = null;
  let lastOutcomes = new Map<string, PlayerOutcome>();
  let over = roster.length !== REQUIRED_PLAYERS;
  let revealCuePlayed = false;
  const reducedMotion = typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const sound = createBorderlineSound("host");
  const finalCountdown = createFinalCountdown();

  function activeStates() {
    return [...states.values()]
      .filter((state) => state.active)
      .sort((a, b) => a.campaign.seat - b.campaign.seat || a.campaign.id.localeCompare(b.campaign.id));
  }

  function allLoaded() {
    return activeStates().every((state) => !state.connected || state.synced);
  }

  function clockDuration() {
    if (phase === "teach") return BORDERLINE_TIMING.teach;
    if (phase === "practice") return BORDERLINE_TIMING.practice;
    if (phase === "practiceReveal") return BORDERLINE_TIMING.practiceReveal;
    if (phase === "countdown") return BORDERLINE_TIMING.countdown;
    if (phase === "planning") return BORDERLINE_TIMING.planning;
    if (phase === "reveal") return BORDERLINE_TIMING.reveal;
    if (phase === "recap") return BORDERLINE_TIMING.recap;
    if (phase === "complete") return BORDERLINE_TIMING.finale;
    return 0;
  }

  function secondsRemaining() {
    return Math.max(0, clockDuration() - phaseClock);
  }

  function publicPlayers(): BorderlineFrame["players"] {
    return activeStates().map((state) => ({
      id: state.campaign.id,
      name: state.campaign.name,
      seat: state.campaign.seat,
      color: state.campaign.color,
      emblem: state.campaign.emblem,
      score: scores.get(state.campaign.id) ?? 0,
      territoryCount: ownership.filter((id) => id === state.campaign.id).length,
      forces: [...(forces.get(state.campaign.id) ?? [])],
      homeProvince: state.campaign.homeProvince,
      homeEntries: state.campaign.homeEntries,
      connected: state.connected,
    }));
  }

  function messageFor(state: PlayerState) {
    if (phase === "loading") return `${activeStates().filter((candidate) => !candidate.connected || candidate.synced).length}/10 controls loaded. The campaign waits for every connected phone.`;
    if (phase === "teach") return teachingCopy(phaseClock);
    if (phase === "practice") return "Try one order. Practice changes no territory, score or force.";
    if (phase === "practiceReveal") return "Practice orders reveal together. Nothing carries into turn 1.";
    if (phase === "countdown") return "Practice reset. Get ready for the real campaign.";
    if (phase === "planning") return state.order ? "Committed. You can still edit before lock." : "Choose mode, province and force. Your fallback is shown below.";
    if (phase === "reveal") return "All orders are locked. Look up at the shared map.";
    if (phase === "recap") return outcomeSentence(lastOutcomes.get(state.campaign.id));
    if (roster.length !== REQUIRED_PLAYERS) return "Borderline currently requires exactly ten players.";
    return "Nine turns scored. Look up for the campaign standings.";
  }

  function frameFor(state: PlayerState): BorderlineFrame {
    const base = phase === "practice" || phase === "planning" ? frozenOwnership : ownership;
    const remaining = forces.get(state.campaign.id) ?? [...FORCE_SET];
    return {
      t: "borderlineState",
      session,
      phase,
      turn: phase === "practice" || phase === "practiceReveal" || phase === "teach" || phase === "loading" || phase === "countdown" ? 0 : turn,
      turns: 9,
      seconds: secondsRemaining(),
      inputSeq: state.inputSeq,
      provinceOwners: [...ownership],
      players: publicPlayers(),
      legal: legalTargets(base, state.campaign),
      forces: [...remaining],
      committed: state.order ? { ...state.order } : null,
      fallback: fallbackOrder(base, state.campaign, remaining),
      ...(phase === "recap" || phase === "complete" ? { outcome: lastOutcomes.get(state.campaign.id) } : {}),
      message: messageFor(state),
    };
  }

  function sendState(id: string) {
    const state = states.get(id);
    if (state?.active) ctx.send(frameFor(state), id);
  }

  function sendSpectator(id: string) {
    const spectator = spectators.get(id);
    if (!spectator) return;
    const placeholder = activeStates()[0];
    if (!placeholder) return;
    ctx.send({ ...frameFor(placeholder), phase: "spectator", committed: null, message: "Fixed launch roster: you’ll play in the next game." } satisfies BorderlineFrame, id);
  }

  function broadcast() {
    for (const state of activeStates()) sendState(state.campaign.id);
    for (const id of spectators.keys()) sendSpectator(id);
  }

  function beginPractice() {
    phase = "practice";
    phaseClock = 0;
    frozenOwnership = [...ownership];
    pending = null;
    lastOutcomes.clear();
    for (const state of activeStates()) state.order = null;
    broadcast();
  }

  function beginTurn(nextTurn: number) {
    turn = nextTurn;
    phase = "planning";
    phaseClock = 0;
    frozenOwnership = [...ownership];
    pending = null;
    lastOutcomes.clear();
    revealCuePlayed = false;
    for (const state of activeStates()) state.order = null;
    sound?.play("go");
    broadcast();
  }

  function lockOrders(practice: boolean) {
    const effective = new Map<string, EffectiveOrder>();
    for (const state of activeStates()) {
      const remaining = forces.get(state.campaign.id) ?? [...FORCE_SET];
      effective.set(state.campaign.id, state.order ?? fallbackOrder(frozenOwnership, state.campaign, remaining));
    }
    pending = {
      practice,
      before: [...frozenOwnership],
      orders: effective,
      result: resolveTurn(frozenOwnership, effective),
    };
    phase = practice ? "practiceReveal" : "reveal";
    phaseClock = 0;
    revealCuePlayed = false;
    sound?.play("lock");
    broadcast();
  }

  function applyPending() {
    if (!pending || pending.practice) return;
    ownership = [...pending.result.ownership];
    previousScores = new Map(scores);
    scores = bankTerritoryScores(scores, ownership);
    lastBanked = new Map(campaign.players.map((player) => [
      player.id,
      ownership.filter((owner) => owner === player.id).length,
    ]));
    forces = advanceForces(forces, pending.orders, turn);
    lastOutcomes = new Map(Object.entries(pending.result.outcomes));
    sound?.play("score");
  }

  function transition() {
    if (phase === "loading") {
      if (!allLoaded()) return;
      phase = "teach";
      phaseClock = 0;
      broadcast();
      return;
    }
    if (phase === "teach") {
      beginPractice();
      return;
    }
    if (phase === "practice") {
      lockOrders(true);
      return;
    }
    if (phase === "practiceReveal") {
      // Practice resolution is visual-only: restore every campaign resource.
      ownership = [...campaign.ownership];
      frozenOwnership = [...ownership];
      scores = new Map(campaign.players.map((player) => [player.id, 0]));
      previousScores = new Map(scores);
      lastBanked = new Map(campaign.players.map((player) => [player.id, 0]));
      forces = new Map(campaign.players.map((player) => [player.id, [...FORCE_SET] as Force[]]));
      pending = null;
      for (const state of activeStates()) state.order = null;
      phase = "countdown";
      phaseClock = 0;
      broadcast();
      return;
    }
    if (phase === "countdown") {
      beginTurn(1);
      return;
    }
    if (phase === "planning") {
      lockOrders(false);
      return;
    }
    if (phase === "reveal") {
      applyPending();
      phase = "recap";
      phaseClock = 0;
      broadcast();
      return;
    }
    if (phase === "recap") {
      if (turn >= TURNS) {
        phase = "complete";
        phaseClock = 0;
        broadcast();
      } else {
        beginTurn(turn + 1);
      }
      return;
    }
    if (phase === "complete") over = true;
  }

  broadcast();

  return {
    onJoin(player) {
      const returning = states.get(player.id);
      if (returning) {
        returning.player = player;
        returning.connected = player.connected;
        returning.active = true;
        sendState(player.id);
        return;
      }
      spectators.set(player.id, player);
      sendSpectator(player.id);
    },
    onLeave(id) {
      const state = states.get(id);
      if (state) state.connected = false;
      spectators.delete(id);
    },
    onConnectionChange(id, connected) {
      const state = states.get(id);
      if (!state) return;
      state.connected = connected;
      if (connected) sendState(id);
      if (phase === "loading" && allLoaded()) transition();
    },
    onInput(playerId, data) {
      if (!isBorderlineInput(data)) return;
      const state = states.get(playerId);
      if (!state?.active) {
        if (data.t === "sync") sendSpectator(playerId);
        return;
      }
      if (data.t === "sync") {
        state.synced = true;
        sendState(playerId);
        if (phase === "loading" && allLoaded()) transition();
        return;
      }
      const expectedTurn = phase === "practice" ? 0 : turn;
      const inputPhase = phase === "practice" || phase === "planning";
      const order = { mode: data.mode, target: data.target, force: data.force } satisfies BorderlineOrder;
      const remaining = forces.get(playerId) ?? [];
      if (!inputPhase || data.turn !== expectedTurn || data.seq !== state.inputSeq + 1 || !orderIsLegal(order, frozenOwnership, state.campaign, remaining)) {
        sendState(playerId);
        return;
      }
      state.inputSeq = data.seq;
      state.order = order;
      // Acknowledgements are always owner-only. Other controllers receive no
      // mode, target or force before lock.
      sendState(playerId);
    },
    tick(dt) {
      if (over) return;
      const step = Math.max(0, Math.min(dt, 0.1));
      if (phase !== "loading") phaseClock += step;
      phoneClock += step;
      finalCountdown.update(phase === "planning" ? secondsRemaining() : null);

      if ((phase === "reveal" || phase === "practiceReveal") && !revealCuePlayed && phaseClock >= CAPTURE_REVEAL_AT) {
        revealCuePlayed = true;
        sound?.play(pending?.result.battles.some((battle) => battle.result === "captured") ? "capture" : "hold");
      }
      if (phoneClock >= BORDERLINE_TIMING.phoneFrame) {
        phoneClock %= BORDERLINE_TIMING.phoneFrame;
        broadcast();
      }
      if (phase === "loading") {
        if (allLoaded()) transition();
      } else if (phaseClock + 1e-8 >= clockDuration()) {
        transition();
      }
    },
    render(canvas, width, height) {
      renderHost(canvas, width, height, {
        phase,
        turn,
        seconds: secondsRemaining(),
        phaseClock,
        ownership,
        players: campaign.players,
        states,
        scores,
        previousScores,
        lastBanked,
        forces,
        pending,
        outcomes: lastOutcomes,
        reducedMotion,
      });
    },
    isOver() {
      return over;
    },
    results() {
      return rankedResults(activeStates().map((state) => state.campaign), scores);
    },
    destroy() {
      over = true;
      finalCountdown.destroy();
      sound?.destroy();
      pending = null;
      spectators.clear();
    },
  };
}

interface RenderState {
  phase: BorderlinePhase;
  turn: number;
  seconds: number;
  phaseClock: number;
  ownership: Array<string | null>;
  players: CampaignPlayer[];
  states: Map<string, PlayerState>;
  scores: Map<string, number>;
  previousScores: Map<string, number>;
  lastBanked: Map<string, number>;
  forces: Map<string, Force[]>;
  pending: PendingResolution | null;
  outcomes: Map<string, PlayerOutcome>;
  reducedMotion: boolean;
}

interface MapBox { x: number; y: number; width: number; height: number; cellW: number; cellH: number }

function renderHost(c: CanvasRenderingContext2D, width: number, height: number, state: RenderState) {
  c.save();
  c.clearRect(0, 0, width, height);
  c.fillStyle = "#071d2c";
  c.fillRect(0, 0, width, height);
  drawSeaTexture(c, width, height);

  const scale = Math.max(0.7, Math.min(width / 1280, height / 720));
  const hudWidth = Math.max(245 * scale, width * 0.225);
  const map: MapBox = {
    x: 38 * scale,
    y: 120 * scale,
    width: width - hudWidth - 74 * scale,
    height: height - 160 * scale,
    cellW: 0,
    cellH: 0,
  };
  map.cellW = map.width / 6;
  map.cellH = map.height / 4;

  drawHeader(c, width, scale, state);
  const revealOwnership = state.pending && (state.phase === "reveal" || state.phase === "practiceReveal") && state.phaseClock >= CAPTURE_REVEAL_AT
    ? state.pending.result.ownership
    : state.ownership;
  drawMap(c, map, revealOwnership, state.players, scale);
  drawPorts(c, map, state.players, scale);
  drawScoreStrip(c, width - hudWidth + 9 * scale, 105 * scale, hudWidth - 24 * scale, height - 126 * scale, state, scale);

  if ((state.phase === "reveal" || state.phase === "practiceReveal") && state.pending) drawOrders(c, map, state, scale);
  if (state.phase === "teach") drawTeaching(c, map, state.phaseClock, scale, state.reducedMotion);
  if (state.phase === "loading") drawOverlay(c, map, "UNFOLDING THE MAP", `${[...state.states.values()].filter((candidate) => !candidate.connected || candidate.synced).length}/10 PHONES READY`, scale);
  if (state.phase === "practice") drawRibbon(c, map, "PRACTICE · NOTHING COUNTS", scale);
  if (state.phase === "practiceReveal") drawRibbon(c, map, "PRACTICE REVEAL · THEN FULL RESET", scale);
  if (state.phase === "countdown") drawOverlay(c, map, Math.max(1, Math.ceil(state.seconds)).toString(), "REAL CAMPAIGN", scale);
  if (state.phase === "recap") drawScoreBank(c, map, state, scale);
  if (state.phase === "complete") {
    drawFinale(c, map, state, scale);
  }
  c.restore();
}

function drawHeader(c: CanvasRenderingContext2D, width: number, scale: number, state: RenderState) {
  c.fillStyle = "#f7edcf";
  c.font = `900 ${34 * scale}px system-ui, sans-serif`;
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillText("BORDERLINE", 38 * scale, 44 * scale);
  c.fillStyle = "#a7bbc2";
  c.font = `800 ${15 * scale}px system-ui, sans-serif`;
  c.fillText("STRONGEST FORCE WINS · A TIE FOR STRONGEST LEAVES THE FLAG", 40 * scale, 79 * scale);

  const label = phaseLabel(state.phase);
  const time = state.phase === "loading" || state.phase === "complete" ? "" : ` · ${Math.ceil(state.seconds)}s`;
  c.textAlign = "right";
  c.fillStyle = "#f7edcf";
  c.font = `900 ${21 * scale}px system-ui, sans-serif`;
  c.fillText(`${state.turn > 0 ? `TURN ${state.turn}/9 · ` : ""}${label}${time}`, width - 38 * scale, 47 * scale);
}

function drawMap(c: CanvasRenderingContext2D, map: MapBox, ownership: readonly (string | null)[], players: readonly CampaignPlayer[], scale: number) {
  const byId = new Map(players.map((player) => [player.id, player]));
  for (let index = 0; index < PROVINCES.length; index += 1) {
    const row = Math.floor(index / 6);
    const col = index % 6;
    const x = map.x + col * map.cellW;
    const y = map.y + row * map.cellH;
    const gap = 4 * scale;
    const owner = ownership[index] ? byId.get(ownership[index]!) : undefined;
    drawPaperProvince(c, x + gap, y + gap, map.cellW - gap * 2, map.cellH - gap * 2, index, owner?.color ?? "#d8c9a8", scale);
    c.fillStyle = "#092033";
    c.textAlign = "left";
    c.textBaseline = "top";
    c.font = `1000 ${26 * scale}px system-ui, sans-serif`;
    c.fillText(String(index + 1), x + 15 * scale, y + 12 * scale);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `900 ${31 * scale}px system-ui, sans-serif`;
    c.fillText(owner?.emblem ?? "·", x + map.cellW / 2, y + map.cellH * 0.49);
    c.font = `850 ${Math.max(10, 12 * scale)}px system-ui, sans-serif`;
    c.fillText(owner ? trim(owner.name, 11) : "NEUTRAL", x + map.cellW / 2, y + map.cellH - 18 * scale);
  }
}

function drawPaperProvince(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, index: number, fill: string, scale: number) {
  const j = (amount: number) => ((((index + 3) * (amount + 11)) % 7) - 3) * scale;
  c.save();
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath();
  c.roundRect(x + 5 * scale, y + 6 * scale, w, h, 8 * scale);
  c.fill();
  c.fillStyle = fill;
  c.strokeStyle = "#f7edcf";
  c.lineWidth = 2.5 * scale;
  c.beginPath();
  c.moveTo(x + j(1), y + j(2));
  c.lineTo(x + w + j(3), y + j(4));
  c.lineTo(x + w + j(5), y + h + j(6));
  c.lineTo(x + j(2), y + h + j(1));
  c.closePath();
  c.fill();
  c.stroke();
  c.globalAlpha = 0.09;
  c.fillStyle = "#092033";
  for (let n = 0; n < 5; n += 1) c.fillRect(x + ((n * 31 + index * 17) % Math.max(1, w - 8)), y + ((n * 19 + index * 11) % Math.max(1, h - 8)), 2 * scale, 2 * scale);
  c.restore();
}

function drawPorts(c: CanvasRenderingContext2D, map: MapBox, players: readonly CampaignPlayer[], scale: number) {
  for (const player of players) {
    const anchor = portAnchor(player, map);
    const slot = homeSlotFor(player);
    c.save();
    c.globalAlpha = 0.42;
    c.strokeStyle = player.color;
    c.lineWidth = 1.5 * scale;
    c.setLineDash([4 * scale, 5 * scale]);
    for (const entry of player.homeEntries) {
      const destination = provinceCenter(entry, map);
      const stop = {
        x: destination.x + (anchor.x - destination.x) * 0.26,
        y: destination.y + (anchor.y - destination.y) * 0.26,
      };
      c.beginPath();
      c.moveTo(anchor.x, anchor.y);
      c.lineTo(stop.x, stop.y);
      c.stroke();
    }
    c.setLineDash([]);
    c.globalAlpha = 1;
    c.fillStyle = player.color;
    c.strokeStyle = "#f7edcf";
    c.lineWidth = 2 * scale;
    c.beginPath();
    c.arc(anchor.x, anchor.y, 12 * scale, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = "#092033";
    c.font = `900 ${12 * scale}px system-ui, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(player.emblem, anchor.x, anchor.y);
    const labelX = slot.side === "west" ? anchor.x + 20 * scale : slot.side === "east" ? anchor.x - 20 * scale : anchor.x;
    const labelY = slot.side === "north" ? anchor.y - 17 * scale : slot.side === "south" ? anchor.y + 17 * scale : anchor.y;
    c.fillStyle = "#071d2c";
    c.strokeStyle = player.color;
    c.lineWidth = 1.5 * scale;
    const labelWidth = 37 * scale;
    c.fillRect(labelX - labelWidth / 2, labelY - 8 * scale, labelWidth, 16 * scale);
    c.strokeRect(labelX - labelWidth / 2, labelY - 8 * scale, labelWidth, 16 * scale);
    c.fillStyle = "#f7edcf";
    c.font = `900 ${9 * scale}px system-ui, sans-serif`;
    c.fillText(`${player.homeEntries[0]}/${player.homeEntries[1]}`, labelX, labelY);
    c.restore();
  }
}

function drawScoreStrip(c: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, state: RenderState, scale: number) {
  const rowH = height / 10;
  const bankProgress = state.phase === "recap" ? scoreBankProgressAt(state.phaseClock, state.reducedMotion) : 1;
  for (let index = 0; index < state.players.length; index += 1) {
    const player = state.players[index];
    const statePlayer = state.states.get(player.id);
    const yy = y + index * rowH;
    c.fillStyle = index % 2 ? "rgba(247,237,207,.055)" : "rgba(247,237,207,.1)";
    c.fillRect(x, yy, width, rowH - 3 * scale);
    c.fillStyle = player.color;
    c.fillRect(x, yy, 7 * scale, rowH - 3 * scale);
    c.fillStyle = "#f7edcf";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = `900 ${17 * scale}px system-ui, sans-serif`;
    c.fillText(`${player.emblem} ${trim(player.name, 10)}`, x + 15 * scale, yy + rowH * 0.35);
    c.fillStyle = statePlayer?.connected ? "#9db3ba" : "#ff8f7d";
    c.font = `750 ${10 * scale}px system-ui, sans-serif`;
    const ledger = ledgerFor(player, state);
    c.fillText(ledger ?? `PORT ${player.homeEntries[0]}/${player.homeEntries[1]}`, x + 16 * scale, yy + rowH * 0.73);
    c.fillStyle = "#f7edcf";
    c.textAlign = "right";
    c.font = `1000 ${21 * scale}px system-ui, sans-serif`;
    const currentScore = state.scores.get(player.id) ?? 0;
    const priorScore = state.previousScores.get(player.id) ?? currentScore;
    const displayedScore = Math.round(priorScore + (currentScore - priorScore) * bankProgress);
    const scoreX = x + width - 8 * scale;
    const scoreY = yy + rowH * 0.34;
    const pop = state.phase === "recap" && !state.reducedMotion ? 1 + Math.sin(Math.min(1, bankProgress) * Math.PI) * 0.16 : 1;
    c.save();
    c.translate(scoreX, scoreY);
    c.scale(pop, pop);
    c.fillText(String(displayedScore), 0, 0);
    c.restore();
    const available = state.forces.get(player.id) ?? [];
    c.font = `900 ${10 * scale}px system-ui, sans-serif`;
    c.fillStyle = state.phase === "recap" ? "#ffca55" : "#9db3ba";
    c.fillText(
      state.phase === "recap"
        ? `+${state.lastBanked.get(player.id) ?? 0}`
        : [1, 2, 3].map((force) => available.includes(force as Force) ? force : "×").join("  "),
      x + width - 9 * scale,
      yy + rowH * 0.72,
    );
  }
}

function drawOrders(c: CanvasRenderingContext2D, map: MapBox, state: RenderState, scale: number) {
  if (!state.pending) return;
  const duration = state.reducedMotion ? 0 : 1.05;
  const progress = duration === 0 ? 1 : easeOut(Math.min(1, state.phaseClock / duration));
  for (const player of state.players) {
    const order = state.pending.orders.get(player.id);
    if (!order || order.mode === "pass") continue;
    const target = provinceCenter(order.target, map);
    if (order.mode === "guard") {
      c.save();
      c.globalAlpha = progress;
      c.fillStyle = "#092033";
      c.strokeStyle = player.color;
      c.lineWidth = 6 * scale;
      c.beginPath();
      c.arc(target.x, target.y, 24 * scale, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = "#f7edcf";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = `1000 ${20 * scale}px system-ui, sans-serif`;
      c.fillText(`G${order.force}`, target.x, target.y);
      c.restore();
      continue;
    }
    const start = portAnchor(player, map);
    const end = { x: start.x + (target.x - start.x) * progress, y: start.y + (target.y - start.y) * progress };
    c.save();
    c.strokeStyle = player.color;
    c.fillStyle = player.color;
    c.lineWidth = 7 * scale;
    c.lineCap = "round";
    c.shadowColor = "rgba(0,0,0,.45)";
    c.shadowBlur = 8 * scale;
    c.beginPath();
    c.moveTo(start.x, start.y);
    c.lineTo(end.x, end.y);
    c.stroke();
    const angle = Math.atan2(target.y - start.y, target.x - start.x);
    c.beginPath();
    c.moveTo(end.x, end.y);
    c.lineTo(end.x - 16 * scale * Math.cos(angle - 0.55), end.y - 16 * scale * Math.sin(angle - 0.55));
    c.lineTo(end.x - 16 * scale * Math.cos(angle + 0.55), end.y - 16 * scale * Math.sin(angle + 0.55));
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = "#092033";
    c.strokeStyle = "#f7edcf";
    c.lineWidth = 2 * scale;
    c.beginPath();
    c.arc(end.x, end.y, 15 * scale, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = "#f7edcf";
    c.font = `1000 ${14 * scale}px system-ui, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(String(order.force), end.x, end.y);
    c.restore();
  }

  if (state.phaseClock < CAPTURE_REVEAL_AT) return;
  for (const battle of state.pending.result.battles) {
    if (battle.attackers.length < 2 && battle.guard === 0) continue;
    const center = provinceCenter(battle.target, map);
    const pulse = state.reducedMotion ? 1 : 1 + Math.sin(state.phaseClock * 8) * 0.08;
    c.save();
    c.strokeStyle = battle.result === "captured" ? "#f7edcf" : "#ffca55";
    c.lineWidth = 6 * scale;
    c.beginPath();
    c.arc(center.x, center.y, 39 * scale * pulse, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
}

type TeachingKind = "unguarded" | "guard-stronger" | "guard-equal" | "attack-tie" | "force-cycle" | "port";

export const BORDERLINE_TEACHING: ReadonlyArray<{ kind: TeachingKind; title: string; subtitle: string; phone: string }> = [
  { kind: "unguarded", title: "UNGUARDED LAND", subtitle: "INVADE 1 TAKES IT", phone: "Force 1 takes any unguarded province." },
  { kind: "guard-stronger", title: "GUARD 2 · INVADE 1", subtitle: "THE STRONGER GUARD STOPS IT", phone: "Guard 2 stops an invading Force 1." },
  { kind: "guard-equal", title: "GUARD 1 · INVADE 1", subtitle: "DEFENDER EQUALITY · FLAG STAYS", phone: "An invasion tied with a guard does not capture." },
  { kind: "attack-tie", title: "INVADE 3 · INVADE 3 · INVADE 2", subtitle: "TOP ATTACKERS TIE · FLAG STAYS", phone: "If attackers tie for strongest, nobody captures. A weaker force never inherits the win." },
  { kind: "force-cycle", title: "USE FORCE 1 · 2 · 3 ONCE", subtitle: "ALL THREE RETURN AFTER TURN 3", phone: "Use each force once per three-turn cycle." },
  { kind: "port", title: "LOSE EVERY PROVINCE?", subtitle: "BOTH PERMANENT PORT ENTRIES STAY OPEN", phone: "Your permanent port keeps two recovery entries open even with no land." },
] as const;

export function teachingFrameAt(seconds: number, reducedMotion = false) {
  const lessonSeconds = BORDERLINE_TIMING.teach / BORDERLINE_TEACHING.length;
  const safe = Math.max(0, Math.min(BORDERLINE_TIMING.teach - 1e-6, seconds));
  const index = Math.floor(safe / lessonSeconds);
  const local = (safe - index * lessonSeconds) / lessonSeconds;
  return { index, progress: reducedMotion ? 1 : easeOut(Math.min(1, local * 1.7)) };
}

function drawTeaching(c: CanvasRenderingContext2D, map: MapBox, seconds: number, scale: number, reducedMotion: boolean) {
  const frame = teachingFrameAt(seconds, reducedMotion);
  const lesson = BORDERLINE_TEACHING[frame.index];
  const width = Math.min(map.width * 0.82, 760 * scale);
  const height = 250 * scale;
  const x = map.x + (map.width - width) / 2;
  const y = map.y + (map.height - height) / 2;
  const centerX = x + width / 2;
  const arenaY = y + 119 * scale;
  c.save();
  c.fillStyle = "rgba(7,29,44,.96)";
  c.strokeStyle = "#f7edcf";
  c.lineWidth = 5 * scale;
  c.fillRect(x, y, width, height);
  c.strokeRect(x, y, width, height);
  c.fillStyle = "#f7edcf";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `1000 ${Math.min(34, lesson.title.length > 24 ? 25 : 34) * scale}px system-ui, sans-serif`;
  c.fillText(lesson.title, centerX, y + 38 * scale);
  drawTeachingDiagram(c, lesson.kind, centerX, arenaY, frame.progress, scale);
  c.fillStyle = "#ffca55";
  c.font = `900 ${18 * scale}px system-ui, sans-serif`;
  c.fillText(lesson.subtitle, centerX, y + height - 28 * scale);
  c.restore();
}

function drawTeachingDiagram(c: CanvasRenderingContext2D, kind: TeachingKind, x: number, y: number, progress: number, scale: number) {
  if (kind === "force-cycle") {
    const labels: Force[] = [1, 2, 3];
    for (let index = 0; index < labels.length; index += 1) {
      const reveal = Math.max(0, Math.min(1, progress * 2.2 - index * 0.35));
      drawTeachingToken(c, x + (index - 1) * 92 * scale, y, `${labels[index]}`, "#ffca55", scale, reveal);
    }
    c.strokeStyle = "#9fc2cc";
    c.lineWidth = 3 * scale;
    c.setLineDash([7 * scale, 6 * scale]);
    c.beginPath();
    c.arc(x, y, 142 * scale, 0.25, Math.PI - 0.25, true);
    c.stroke();
    c.setLineDash([]);
    return;
  }

  if (kind === "port") {
    const portX = x - 130 * scale;
    const entryX = x + 95 * scale;
    drawTeachingToken(c, portX, y, "◆", "#52e0b0", scale, 1);
    for (const [index, label] of ["7", "8"].entries()) {
      const entryY = y + (index ? 39 : -39) * scale;
      c.strokeStyle = "#52e0b0";
      c.lineWidth = 4 * scale;
      c.setLineDash([6 * scale, 5 * scale]);
      c.beginPath();
      c.moveTo(portX + 25 * scale, y);
      c.lineTo(portX + 25 * scale + (entryX - portX - 25 * scale) * progress, y + (entryY - y) * progress);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = "#d8c9a8";
      c.fillRect(entryX - 24 * scale, entryY - 20 * scale, 48 * scale, 40 * scale);
      c.fillStyle = "#092033";
      c.font = `1000 ${18 * scale}px system-ui, sans-serif`;
      c.fillText(label, entryX, entryY);
    }
    c.fillStyle = "#f7edcf";
    c.font = `850 ${14 * scale}px system-ui, sans-serif`;
    c.fillText("0 LAND · STILL IN", x - 20 * scale, y + 64 * scale);
    return;
  }

  c.fillStyle = "#d8c9a8";
  c.strokeStyle = "#f7edcf";
  c.lineWidth = 3 * scale;
  c.fillRect(x - 43 * scale, y - 39 * scale, 86 * scale, 78 * scale);
  c.strokeRect(x - 43 * scale, y - 39 * scale, 86 * scale, 78 * scale);
  const flagStays = kind !== "unguarded" || progress < 0.74;
  c.fillStyle = flagStays ? "#a97bff" : "#52e0b0";
  c.fillRect(x - 8 * scale, y - 19 * scale, 22 * scale, 18 * scale);
  c.strokeStyle = "#092033";
  c.lineWidth = 3 * scale;
  c.beginPath();
  c.moveTo(x - 8 * scale, y - 21 * scale);
  c.lineTo(x - 8 * scale, y + 22 * scale);
  c.stroke();

  const incomingX = x - 172 * scale + 118 * scale * progress;
  drawTeachingToken(c, incomingX, y + 12 * scale, kind === "attack-tie" ? "I3" : "I1", "#52e0b0", scale, 1);
  if (kind === "guard-stronger" || kind === "guard-equal") {
    drawTeachingToken(c, x + 48 * scale, y + 12 * scale, kind === "guard-stronger" ? "G2" : "G1", "#ffca55", scale, 1);
  }
  if (kind === "attack-tie") {
    drawTeachingToken(c, x + 172 * scale - 118 * scale * progress, y + 12 * scale, "I3", "#ff5a47", scale, 1);
    drawTeachingToken(c, x, y - 98 * scale + 51 * scale * progress, "I2", "#4aa8ff", scale, 1);
  }
}

function drawTeachingToken(c: CanvasRenderingContext2D, x: number, y: number, label: string, color: string, scale: number, reveal: number) {
  const tokenScale = Math.max(0.05, reveal);
  c.save();
  c.translate(x, y);
  c.scale(tokenScale, tokenScale);
  c.fillStyle = color;
  c.strokeStyle = "#f7edcf";
  c.lineWidth = 3 * scale;
  c.beginPath();
  c.arc(0, 0, 27 * scale, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = "#092033";
  c.font = `1000 ${16 * scale}px system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(label, 0, 0);
  c.restore();
}

export function scoreBankProgressAt(seconds: number, reducedMotion = false) {
  if (reducedMotion) return 1;
  return easeOut(Math.max(0, Math.min(1, seconds / 1.15)));
}

function drawScoreBank(c: CanvasRenderingContext2D, map: MapBox, state: RenderState, scale: number) {
  const progress = scoreBankProgressAt(state.phaseClock, state.reducedMotion);
  const panelScale = state.reducedMotion ? 1 : 0.78 + progress * 0.22 + Math.sin(progress * Math.PI) * 0.08;
  const x = map.x + map.width / 2;
  const y = map.y + 36 * scale;
  c.save();
  c.translate(x, y);
  c.scale(panelScale, panelScale);
  c.fillStyle = "#ffca55";
  c.strokeStyle = "#092033";
  c.lineWidth = 4 * scale;
  c.fillRect(-174 * scale, -25 * scale, 348 * scale, 50 * scale);
  c.strokeRect(-174 * scale, -25 * scale, 348 * scale, 50 * scale);
  c.fillStyle = "#092033";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `1000 ${20 * scale}px system-ui, sans-serif`;
  c.fillText(`TURN ${state.turn} · SCORES BANKED`, 0, 0);
  c.restore();
}

export function finaleProgressAt(seconds: number, reducedMotion = false) {
  if (reducedMotion) return 1;
  return easeOut(Math.max(0, Math.min(1, seconds / 0.72)));
}

function drawFinale(c: CanvasRenderingContext2D, map: MapBox, state: RenderState, scale: number) {
  const ranked = rankedResults(state.players, state.scores);
  const topScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((result) => result.score === topScore)
    .map((result) => state.players.find((player) => player.id === result.id))
    .filter((player): player is CampaignPlayer => Boolean(player));
  const progress = finaleProgressAt(state.phaseClock, state.reducedMotion);
  const fade = state.reducedMotion || state.phaseClock < BORDERLINE_TIMING.finale - 0.55
    ? 1
    : Math.max(0, (BORDERLINE_TIMING.finale - state.phaseClock) / 0.55);
  const centerX = map.x + map.width / 2;
  const centerY = map.y + map.height / 2;

  if (!state.reducedMotion) {
    const travel = Math.min(2.4, state.phaseClock);
    for (let index = 0; index < 28; index += 1) {
      const angle = (index / 28) * Math.PI * 2 - Math.PI / 2;
      const speed = (90 + (index % 6) * 18) * scale;
      const px = centerX + Math.cos(angle) * speed * travel;
      const py = centerY + Math.sin(angle) * speed * travel + 38 * scale * travel * travel;
      c.save();
      c.translate(px, py);
      c.rotate(angle + travel * (index % 2 ? 2.4 : -2.1));
      c.globalAlpha = fade * Math.max(0, 1 - travel / 2.6);
      c.fillStyle = state.players[index % state.players.length]?.color ?? "#ffca55";
      c.fillRect(-5 * scale, -9 * scale, 10 * scale, 18 * scale);
      c.restore();
    }
  }

  const panelScale = state.reducedMotion ? 1 : 0.7 + progress * 0.3 + Math.sin(progress * Math.PI) * 0.12;
  c.save();
  c.globalAlpha = fade;
  c.translate(centerX, centerY);
  c.scale(panelScale, panelScale);
  c.fillStyle = "rgba(7,29,44,.96)";
  c.strokeStyle = "#ffca55";
  c.lineWidth = 7 * scale;
  c.fillRect(-330 * scale, -112 * scale, 660 * scale, 224 * scale);
  c.strokeRect(-330 * scale, -112 * scale, 660 * scale, 224 * scale);
  c.fillStyle = "#ffca55";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `1000 ${23 * scale}px system-ui, sans-serif`;
  c.fillText("CAMPAIGN COMPLETE", 0, -72 * scale);
  c.fillStyle = "#f7edcf";
  c.font = `1000 ${Math.min(48, winners.length > 1 ? 43 : 48) * scale}px system-ui, sans-serif`;
  c.fillText(winners.length === 1 ? `${winners[0].emblem} ${winners[0].name}` : `${winners.length}-WAY TIE`, 0, -8 * scale);
  c.fillStyle = "#ffca55";
  c.font = `900 ${24 * scale}px system-ui, sans-serif`;
  c.fillText(`${topScore} PROVINCES BANKED`, 0, 59 * scale);
  c.restore();
}

function drawOverlay(c: CanvasRenderingContext2D, map: MapBox, title: string, subtitle: string, scale: number) {
  const width = Math.min(map.width * 0.76, 720 * scale);
  const height = 180 * scale;
  const x = map.x + (map.width - width) / 2;
  const y = map.y + (map.height - height) / 2;
  c.save();
  c.fillStyle = "rgba(7,29,44,.94)";
  c.strokeStyle = "#f7edcf";
  c.lineWidth = 5 * scale;
  c.fillRect(x, y, width, height);
  c.strokeRect(x, y, width, height);
  c.fillStyle = "#f7edcf";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `1000 ${Math.min(50, title.length > 18 ? 34 : 50) * scale}px system-ui, sans-serif`;
  c.fillText(title, x + width / 2, y + height * 0.42);
  c.fillStyle = "#ffca55";
  c.font = `900 ${22 * scale}px system-ui, sans-serif`;
  c.fillText(subtitle, x + width / 2, y + height * 0.72);
  c.restore();
}

function drawRibbon(c: CanvasRenderingContext2D, map: MapBox, text: string, scale: number) {
  c.save();
  c.fillStyle = "#ffca55";
  c.fillRect(map.x + map.width * 0.16, map.y + 8 * scale, map.width * 0.68, 42 * scale);
  c.fillStyle = "#092033";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `1000 ${19 * scale}px system-ui, sans-serif`;
  c.fillText(text, map.x + map.width / 2, map.y + 29 * scale);
  c.restore();
}

function provinceCenter(province: number, map: MapBox) {
  const index = province - 1;
  return {
    x: map.x + (index % 6 + 0.5) * map.cellW,
    y: map.y + (Math.floor(index / 6) + 0.5) * map.cellH,
  };
}

function portAnchor(player: CampaignPlayer, map: MapBox) {
  const center = provinceCenter(player.homeProvince, map);
  const slot = homeSlotFor(player);
  if (slot.side === "north") return { x: center.x, y: map.y - 10 };
  if (slot.side === "south") return { x: center.x, y: map.y + map.height + 10 };
  if (slot.side === "west") return { x: map.x - 10, y: center.y };
  return { x: map.x + map.width + 10, y: center.y };
}

function ledgerFor(player: CampaignPlayer, state: RenderState) {
  if (!state.pending || (state.phase !== "reveal" && state.phase !== "practiceReveal" && state.phase !== "recap")) return null;
  const order = state.pending.orders.get(player.id);
  if (!order) return null;
  if (state.phase === "recap") return compactOutcomeLedger(order, state.outcomes.get(player.id));
  if (order.mode === "pass") return `PASS · FORCE ${order.force}`;
  return `${order.mode.toUpperCase()} ${order.target} · F${order.force}`;
}

export function compactOutcomeLedger(order: EffectiveOrder, outcome?: PlayerOutcome) {
  if (order.mode === "pass" || outcome === "passed") return `PASSED · F${order.force}`;
  const target = order.target;
  if (outcome === "captured") return `CAPTURED ${target}`;
  if (outcome === "held") return `HELD ${target}`;
  if (outcome === "lost") return `LOST ${target}`;
  if (outcome === "quiet") return `QUIET GUARD ${target}`;
  if (outcome === "tied") return `TOP TIE ${target}`;
  if (outcome === "outmatched") return `OUTMATCHED ${target}`;
  return `BLOCKED ${target}`;
}

function phaseLabel(phase: BorderlinePhase) {
  const labels: Record<BorderlinePhase, string> = {
    loading: "LOADING CONTROLS",
    teach: "HOW BORDERS BREAK",
    practice: "PRACTICE",
    practiceReveal: "PRACTICE REVEAL",
    countdown: "GET READY",
    planning: "MAKE A SECRET ORDER",
    reveal: "BORDERS BREAKING",
    recap: "SCORE BANKED",
    complete: "CAMPAIGN OVER",
    spectator: "WATCHING",
  };
  return labels[phase];
}

function teachingCopy(seconds: number) {
  return BORDERLINE_TEACHING[teachingFrameAt(seconds, true).index].phone;
}

function outcomeSentence(outcome?: PlayerOutcome) {
  const copy: Record<PlayerOutcome, string> = {
    captured: "Your invasion captured the province.",
    held: "Your guard held the province.",
    lost: "Your guarded province was captured.",
    quiet: "Your guarded province was not attacked.",
    tied: "You tied for strongest; the flag stayed.",
    defended: "Your invasion did not beat the defense.",
    outmatched: "A stronger invasion beat your force.",
    passed: "With no land, your fallback spent its force and passed.",
  };
  return outcome ? copy[outcome] : "The borders are settled.";
}

function drawSeaTexture(c: CanvasRenderingContext2D, width: number, height: number) {
  c.save();
  c.globalAlpha = 0.08;
  c.strokeStyle = "#86a7b3";
  c.lineWidth = 1;
  for (let y = 18; y < height; y += 34) {
    c.beginPath();
    for (let x = 0; x <= width; x += 54) {
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y + Math.sin((x + y) * 0.03) * 3);
    }
    c.stroke();
  }
  c.restore();
}

function trim(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, Math.max(1, length - 1))}…`;
}

function easeOut(value: number) {
  return 1 - (1 - value) ** 3;
}

function createSessionId(seed: number) {
  // This routes controller reconciliation only and never enters simulation.
  // A host refresh deliberately produces a new id while the seeded world and
  // all campaign outcomes remain deterministic.
  return `${seed.toString(36)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
