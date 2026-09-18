import type { RoundResult } from "../../../shared/protocol";
import { createFinalCountdown } from "../../final-countdown";
import type { GameHost, HostContext } from "../registry";
import type { BorderlineFrame, BorderlineInput, BorderlineOrder, BorderlinePhase, Force } from "./protocol";
import { isForce } from "./protocol";
import { renderBorderline } from "./render";
import {
  createBorderlineCampaign,
  factionFor,
  fallbackOrder,
  isLegalOrder,
  legalTargets,
  publicForces,
  resolveTurn,
  type BorderlineCampaign,
  type CampaignPlayer,
  type ResolvedOrder,
} from "./rules";
import { BorderlineSound } from "./sound";
import { BORDERLINE_TUTORIAL_SECONDS, BORDERLINE_TUTORIAL_STEPS, borderlineTutorialStep } from "./tutorial";
import { FACTIONS } from "./world";

export const BORDERLINE_RULES = {
  turns: 9,
  runwaySeconds: BORDERLINE_TUTORIAL_SECONDS,
  practiceSeconds: 25,
  practiceRevealSeconds: 4.5,
  countdownSeconds: 3.8,
  planningSeconds: 20,
  revealSeconds: 3.8,
  recapSeconds: 3.2,
  completeSeconds: 5.5,
  phoneSnapshotSeconds: 1,
} as const;

let borderlineFontReady: Promise<FontFace | void> | null = null;

type FrozenTargets = Map<string, { invade: number[]; guard: number[] }>;

export function freezeLegalTargets(campaign: BorderlineCampaign): FrozenTargets {
  return new Map([...campaign.players].map(([id]) => [id, legalTargets(campaign, id)]));
}

export function campaignResults(campaign: BorderlineCampaign): RoundResult[] {
  const ranked = [...campaign.players.values()].sort((a, b) => b.score - a.score || a.player.seat - b.player.seat || a.player.id.localeCompare(b.player.id));
  let place = 0;
  let priorScore: number | null = null;
  return ranked.map((state, index) => {
    if (state.score !== priorScore) {
      place = index + 1;
      priorScore = state.score;
    }
    return { id: state.player.id, score: state.score, place };
  });
}

export function createHost(ctx: HostContext): GameHost {
  const campaign = createBorderlineCampaign(ctx.players, ctx.seed);
  const spectators = new Map<string, CampaignPlayer["player"]>();
  let phase: BorderlinePhase = campaign.players.size ? "runway" : "complete";
  let phaseClock = 0;
  let phoneClock = 0;
  let frozen = freezeLegalTargets(campaign);
  let previousOwners = new Map(campaign.owners);
  let practiceOwners = new Map(campaign.owners);
  let revealedOrders: ResolvedOrder[] = [];
  let captures: Array<{ province: number; from: string | null; to: string }> = [];
  let over = campaign.players.size === 0;
  let destroyed = false;
  let oceanImage: HTMLImageElement | null = null;
  let paperImage: HTMLImageElement | null = null;
  const cueIds = new Map<string, number>();
  let sound: BorderlineSound | null = typeof AudioContext === "undefined" ? null : new BorderlineSound("host");
  let spokenTutorialStep = 0;
  const finalCountdown = createFinalCountdown();
  const reducedMotion = typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  sound?.playTutorial(spokenTutorialStep);

  if (typeof Image !== "undefined") {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => { if (!destroyed) oceanImage = image; };
    image.src = "/images/borderline/ocean.png";
    const paper = new Image();
    paper.decoding = "async";
    paper.onload = () => { if (!destroyed) paperImage = paper; };
    paper.src = "/images/borderline/paper.png";
  }
  if (typeof FontFace !== "undefined" && typeof document !== "undefined") {
    try {
      if (!borderlineFontReady) {
        const face = new FontFace("Alfa Slab One", "url(/fonts/borderline/AlfaSlabOne-Regular.ttf)");
        borderlineFontReady = face.load().then((loaded) => { document.fonts.add(loaded); return loaded; }).catch(() => undefined);
      }
    } catch { /* The local Georgia fallback keeps the atlas fully playable. */ }
  }

  function orderedPlayers() {
    return [...campaign.players.values()].sort((a, b) => a.player.seat - b.player.seat || a.player.id.localeCompare(b.player.id));
  }

  function secondsRemaining() {
    const duration = phase === "runway" ? BORDERLINE_RULES.runwaySeconds
      : phase === "practice" ? BORDERLINE_RULES.practiceSeconds
        : phase === "practiceReveal" ? BORDERLINE_RULES.practiceRevealSeconds
          : phase === "countdown" ? 3
            : phase === "planning" ? BORDERLINE_RULES.planningSeconds
              : phase === "reveal" ? BORDERLINE_RULES.revealSeconds
                : phase === "recap" ? BORDERLINE_RULES.recapSeconds
                  : phase === "complete" ? BORDERLINE_RULES.completeSeconds : 0;
    return Math.max(0, duration - phaseClock);
  }

  function frameFor(state: CampaignPlayer): BorderlineFrame {
    const targets = frozen.get(state.player.id) ?? { invade: [], guard: [] };
    return {
      t: "borderlineState",
      phase,
      turn: campaign.turn,
      turns: 9,
      seconds: secondsRemaining(),
      tutorialStep: phase === "runway" ? borderlineTutorialStep(phaseClock) : 0,
      factionName: factionFor(state).name,
      emblem: factionFor(state).emblem,
      columns: campaign.world.cols,
      rows: campaign.world.rows,
      provinces: campaign.world.provinces.map(({ id }) => {
        const ownerId = campaign.owners.get(id) ?? null;
        const owner = ownerId ? campaign.players.get(ownerId) : undefined;
        return {
          id,
          ownerId,
          ownerName: owner?.player.name ?? null,
          ownerColor: owner?.player.color ?? null,
          ownerEmblem: owner ? factionFor(owner).emblem : null,
        };
      }),
      legalInvades: phase === "planning" || phase === "practice" ? [...targets.invade] : [],
      legalGuards: phase === "planning" || phase === "practice" ? [...targets.guard] : [],
      availableForces: publicForces(state),
      committed: state.order ? { ...state.order } : null,
      inputSeq: state.inputSeq,
      fallback: fallbackOrder(campaign, state.player.id),
      score: state.score,
      outcome: state.outcome,
      message: messageFor(state),
      cue: cueIds.has(state.player.id) ? { id: cueIds.get(state.player.id)!, name: "commit" } : null,
    };
  }

  function spectatorFrame(): BorderlineFrame {
    return {
      t: "borderlineState",
      phase: "spectator",
      turn: campaign.turn,
      turns: 9,
      seconds: secondsRemaining(),
      tutorialStep: 0,
      factionName: "Observer",
      emblem: "diamond",
      columns: campaign.world.cols,
      rows: campaign.world.rows,
      provinces: campaign.world.provinces.map(({ id }) => ({ id, ownerId: null, ownerName: null, ownerColor: null, ownerEmblem: null })),
      legalInvades: [], legalGuards: [], availableForces: [], committed: null, inputSeq: 0,
      fallback: { mode: "pass", force: 1 }, score: 0, outcome: "", message: "This campaign is already under way. You join the next one.", cue: null,
    };
  }

  function messageFor(state: CampaignPlayer) {
    if (!state.connected) return state.order ? "Signal lost. Your confirmed order is safe." : "Signal lost. The shown fallback will execute.";
    if (phase === "runway") return BORDERLINE_TUTORIAL_STEPS[borderlineTutorialStep(phaseClock)].detail;
    if (phase === "practice") return state.order ? "Practice confirmed. You can still edit and confirm again." : "Try an invasion or guard. The real atlas will reset.";
    if (phase === "practiceReveal") return state.outcome;
    if (phase === "countdown") return "Practice is cleared. Get ready for the real campaign.";
    if (phase === "planning") return state.order ? "Confirmed. Edit and confirm again any time before zero." : "Choose mode, province and Strength, then confirm.";
    if (phase === "reveal") return "Look up. Every order lands together.";
    if (phase === "recap") return state.outcome;
    if (phase === "complete") return `${state.score} territory points. Look up for the final map.`;
    return "Watching this campaign.";
  }

  function sendState(id: string) {
    if (destroyed) return;
    const state = campaign.players.get(id);
    if (state) ctx.send(frameFor(state), id);
  }

  function sendAll() {
    if (destroyed) return;
    for (const state of orderedPlayers()) ctx.send(frameFor(state), state.player.id);
    for (const spectator of spectators.values()) ctx.send(spectatorFrame(), spectator.id);
  }

  function resetOrders() {
    for (const state of campaign.players.values()) state.order = null;
  }

  function beginPractice() {
    sound?.stopTutorial();
    phase = "practice";
    phaseClock = 0;
    phoneClock = 0;
    campaign.turn = 0;
    frozen = freezeLegalTargets(campaign);
    resetOrders();
    sendAll();
  }

  function collectOrders(): ResolvedOrder[] {
    return orderedPlayers().map((state) => {
      const accepted = state.order;
      if (accepted) return { playerId: state.player.id, mode: accepted.mode, target: accepted.target, force: accepted.force };
      return { playerId: state.player.id, ...fallbackOrder(campaign, state.player.id), fallback: true };
    });
  }

  function beginPracticeReveal() {
    revealedOrders = collectOrders();
    previousOwners = new Map(campaign.owners);
    const resolution = resolveTurn(previousOwners, revealedOrders, campaign.world.provinces);
    practiceOwners = resolution.owners;
    captures = resolution.captures;
    for (const state of campaign.players.values()) state.outcome = resolution.outcomes.get(state.player.id) ?? "Practice complete. The real atlas resets next.";
    phase = "practiceReveal";
    phaseClock = 0;
    phoneClock = 0;
    sound?.play("reveal");
    if (captures.length) sound?.play("capture");
    sendAll();
  }

  function beginCountdown() {
    phase = "countdown";
    phaseClock = 0;
    phoneClock = 0;
    revealedOrders = [];
    captures = [];
    practiceOwners = new Map(campaign.owners);
    resetOrders();
    for (const state of campaign.players.values()) state.outcome = "The real campaign begins now.";
    sendAll();
  }

  function beginPlanning(turn: number) {
    campaign.turn = turn;
    phase = "planning";
    phaseClock = 0;
    phoneClock = 0;
    previousOwners = new Map(campaign.owners);
    revealedOrders = [];
    captures = [];
    resetOrders();
    frozen = freezeLegalTargets(campaign);
    sound?.play("reveal");
    sendAll();
  }

  function beginReveal() {
    revealedOrders = collectOrders();
    previousOwners = new Map(campaign.owners);
    const resolution = resolveTurn(previousOwners, revealedOrders, campaign.world.provinces);
    campaign.owners = resolution.owners;
    captures = resolution.captures;
    for (const order of revealedOrders) {
      const state = campaign.players.get(order.playerId);
      if (!state) continue;
      state.available = state.available.filter((force) => force !== order.force);
      state.outcome = `${resolution.outcomes.get(order.playerId) ?? "No border changed."} +${territoryCount(order.playerId)} territory.`;
    }
    if (campaign.turn === 3 || campaign.turn === 6) {
      for (const state of campaign.players.values()) state.available = [1, 2, 3];
    }
    phase = "reveal";
    phaseClock = 0;
    phoneClock = 0;
    sound?.play("reveal");
    if (captures.length) sound?.play("capture");
    sendAll();
  }

  function beginRecap() {
    for (const state of campaign.players.values()) state.score += territoryCount(state.player.id);
    phase = "recap";
    phaseClock = 0;
    phoneClock = 0;
    sound?.play("score");
    sendAll();
  }

  function beginComplete() {
    phase = "complete";
    phaseClock = 0;
    phoneClock = 0;
    sound?.play("score");
    sendAll();
  }

  function territoryCount(playerId: string) {
    let count = 0;
    for (const owner of campaign.owners.values()) if (owner === playerId) count += 1;
    return count;
  }

  function onInput(playerId: string, value: unknown) {
    if (destroyed || !value || typeof value !== "object" || Array.isArray(value)) return;
    const input = value as Partial<BorderlineInput> & Record<string, unknown>;
    const state = campaign.players.get(playerId);
    if (input.t === "sync") {
      if (state) sendState(playerId);
      else if (spectators.has(playerId)) ctx.send(spectatorFrame(), playerId);
      return;
    }
    if (!state?.active || !state.connected || (phase !== "planning" && phase !== "practice") || input.t !== "order") return;
    if (!Number.isInteger(input.turn) || input.turn !== campaign.turn) return;
    if (!Number.isInteger(input.seq) || Number(input.seq) <= state.inputSeq || Number(input.seq) > state.inputSeq + 100) return;
    if ((input.mode !== "invade" && input.mode !== "guard") || !Number.isInteger(input.target) || !isForce(input.force)) return;
    const order: BorderlineOrder = { mode: input.mode, target: Number(input.target), force: input.force };
    if (!isLegalOrder(campaign, playerId, order, frozen)) return;
    state.inputSeq = Number(input.seq);
    state.order = { ...order, seq: state.inputSeq };
    cueIds.set(playerId, (cueIds.get(playerId) ?? 0) + 1);
    sendState(playerId);
  }

  return {
    onInput,
    onJoin(player) {
      if (destroyed) return;
      const existing = campaign.players.get(player.id);
      if (existing) {
        existing.player = player;
        existing.connected = player.connected;
        sendState(player.id);
        return;
      }
      spectators.set(player.id, player);
      ctx.send(spectatorFrame(), player.id);
    },
    onLeave(id) {
      spectators.delete(id);
      const state = campaign.players.get(id);
      if (!state) return;
      state.connected = false;
      sendAll();
    },
    onConnectionChange(id, connected) {
      if (destroyed) return;
      const state = campaign.players.get(id);
      if (!state) return;
      state.connected = connected;
      if (connected) sendState(id);
    },
    tick(dt) {
      if (destroyed || over || !Number.isFinite(dt) || dt <= 0) {
        finalCountdown.update(null);
        return;
      }
      let remaining = Math.min(dt, 0.25);
      while (remaining > 1e-8 && !over) {
        const duration = phase === "runway" ? BORDERLINE_RULES.runwaySeconds
          : phase === "practice" ? BORDERLINE_RULES.practiceSeconds
            : phase === "practiceReveal" ? BORDERLINE_RULES.practiceRevealSeconds
              : phase === "countdown" ? BORDERLINE_RULES.countdownSeconds
                : phase === "planning" ? BORDERLINE_RULES.planningSeconds
                  : phase === "reveal" ? BORDERLINE_RULES.revealSeconds
                    : phase === "recap" ? BORDERLINE_RULES.recapSeconds
                      : BORDERLINE_RULES.completeSeconds;
        const step = Math.min(remaining, Math.max(0, duration - phaseClock));
        phaseClock += step;
        if (phase === "runway") {
          const tutorialStep = borderlineTutorialStep(phaseClock);
          if (tutorialStep !== spokenTutorialStep) {
            spokenTutorialStep = tutorialStep;
            sound?.playTutorial(tutorialStep);
          }
        }
        phoneClock += step;
        remaining -= step;
        if (phoneClock + 1e-7 >= BORDERLINE_RULES.phoneSnapshotSeconds) {
          phoneClock %= BORDERLINE_RULES.phoneSnapshotSeconds;
          sendAll();
        }
        if (phaseClock + 1e-7 < duration) continue;
        if (phase === "runway") beginPractice();
        else if (phase === "practice") beginPracticeReveal();
        else if (phase === "practiceReveal") beginCountdown();
        else if (phase === "countdown") beginPlanning(1);
        else if (phase === "planning") beginReveal();
        else if (phase === "reveal") beginRecap();
        else if (phase === "recap") campaign.turn >= BORDERLINE_RULES.turns ? beginComplete() : beginPlanning(campaign.turn + 1);
        else if (phase === "complete") {
          over = true;
          sendAll();
        }
      }
      finalCountdown.update(phase === "planning" || phase === "practice" ? secondsRemaining() : null);
    },
    render(c, w, h) {
      if (destroyed) return;
      renderBorderline(c, w, h, {
        phase, turn: campaign.turn, seconds: secondsRemaining(), phaseClock, players: orderedPlayers(), owners: phase === "practiceReveal" ? practiceOwners : campaign.owners,
        previousOwners, revealedOrders, captures, reducedMotion, oceanImage, paperImage, world: campaign.world,
      });
    },
    isOver: () => over,
    results: () => campaignResults(campaign),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      finalCountdown.destroy();
      sound?.destroy();
      sound = null;
      oceanImage = null;
      paperImage = null;
      spectators.clear();
    },
  };
}

export { createBorderlineCampaign, fallbackOrder, isLegalOrder, legalTargets, resolveTurn, FACTIONS };
export type { BorderlineCampaign, ResolvedOrder };
