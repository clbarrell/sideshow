import { describe, expect, it, vi } from "vitest";
import type { Player } from "../../src/shared/protocol";
import {
  DRAG_RULES,
  applyDragInput,
  blobRadius,
  cameraInfluence,
  canEatPlayer,
  createDragState,
  createHost,
  dragResults,
  movementSpeed,
  neutralizeDragActor,
  renderDrag,
  retainActorInVisibleFrame,
  stepDragState,
  visualBlobScaleX,
} from "../../src/client/games/drag/host";

function player(id: string, seat: number, name = `Player${seat + 1}`): Player {
  const colors = ["#FF5A47", "#FFC24A", "#52E0B0", "#4AA8FF", "#A97BFF", "#FF8AC4", "#9CE04A", "#FF9A3D", "#3DE0E0", "#D46BFF"];
  return { id, name, seat, color: colors[seat], connected: true, ready: true, awayAt: null };
}

function players(count: number) {
  return Array.from({ length: count }, (_, index) => player(`p${index + 1}`, index));
}

function advance(state: ReturnType<typeof createDragState>, seconds: number) {
  for (let elapsed = 0; elapsed < seconds - .0001; elapsed += .05) stepDragState(state, Math.min(.05, seconds - elapsed));
}

interface TextDraw { text: string; x: number; y: number; maxWidth?: number; font: string }

function recordingCanvas(draws: TextDraw[] = []) {
  const target: Record<PropertyKey, unknown> = { font: "10px sans-serif", globalAlpha: 1 };
  return new Proxy(target as unknown as CanvasRenderingContext2D, {
    get(object, key) {
      if (key === "measureText") return (text: string) => ({ width: text.length * 13 });
      if (key === "createRadialGradient") return () => ({ addColorStop: () => undefined });
      if (key === "fillText") return (text: string, x: number, y: number, maxWidth?: number) => draws.push({ text, x, y, maxWidth, font: String(Reflect.get(object, "font")) });
      return Reflect.get(object, key) ?? (() => undefined);
    },
    set(object, key, value) { Reflect.set(object, key, value); return true; },
  });
}

describe("Drag simulation", () => {
  it("is seeded and begins with more than one hundred scattered drops inside the safe frame", () => {
    for (let seed = 0; seed < 80; seed++) {
      const first = createDragState(players(4), seed);
      const same = createDragState(players(4), seed);
      expect(first.patches).toEqual(same.patches);
      expect(first.patches.flatMap(({ drops }) => drops)).toHaveLength(DRAG_RULES.foodTarget);
      for (const patch of first.patches) {
        for (const drop of patch.drops) {
          expect(Math.abs(drop.x - first.camera.x) + drop.radius).toBeLessThan(DRAG_RULES.viewWidth / 2 - DRAG_RULES.dangerInset);
          expect(Math.abs(drop.y - first.camera.y) + drop.radius).toBeLessThan(DRAG_RULES.viewHeight / 2 - DRAG_RULES.dangerInset);
        }
      }
    }
  });

  it("replenishes a depleted field in a fraction of a second", () => {
    const state = createDragState(players(4), 41);
    state.phase = "live";
    state.actors.forEach((actor) => { actor.spectator = true; });
    state.patches[0].drops.slice(0, DRAG_RULES.foodTarget - DRAG_RULES.foodReplenishAt).forEach((drop) => { drop.eaten = true; });
    stepDragState(state, .05);
    expect(state.pendingPatches).not.toBeNull();
    advance(state, DRAG_RULES.patchPreview + .05);
    expect(state.pendingPatches).toBeNull();
    expect(state.patches.flatMap(({ drops }) => drops).filter(({ eaten }) => !eaten)).toHaveLength(DRAG_RULES.foodTarget);
  });

  it("eats a food dot when the enlarged visible body reaches it", () => {
    const state = createDragState(players(4), 42);
    const actor = state.actors[0];
    state.actors.slice(1).forEach((other) => { other.spectator = true; });
    const drop = state.patches[0].drops[0];
    state.patches[0].drops.slice(1).forEach((other) => { other.eaten = true; });
    actor.x = 0;
    actor.y = drop.y = 0;
    actor.input = { x: 0, y: 0 };
    drop.x = blobRadius(actor.size) + drop.radius * .2 + .1;
    stepDragState(state, .01);
    expect(drop.eaten).toBe(false);
    drop.x -= .2;
    stepDragState(state, .01);
    expect(drop.eaten).toBe(true);
  });

  it("does not let a stationary large blob stay capped by dense-field replenishment", () => {
    const state = createDragState(players(4), 42);
    state.phase = "live";
    const actor = state.actors[0];
    state.actors.slice(1).forEach((other) => { other.spectator = true; });
    actor.x = 0;
    actor.y = 0;
    actor.vx = 0;
    actor.vy = 0;
    actor.input = { x: 0, y: 0 };
    actor.size = DRAG_RULES.maximumSize;

    advance(state, 28);

    expect(actor.food).toBeGreaterThan(0);
    expect(actor.size).toBeLessThan(2);
  });

  it("requires a clear size advantage and deep overlap before swallowing a player", () => {
    const state = createDragState(players(4), 24);
    const [hunter, prey] = state.actors;
    hunter.x = prey.x = 0;
    hunter.y = prey.y = 0;
    hunter.size = 1.24;
    prey.size = 1;
    expect(canEatPlayer(hunter, prey)).toBe(false);
    hunter.size = 1.3;
    prey.x = blobRadius(hunter.size) + blobRadius(prey.size) - 2;
    expect(canEatPlayer(hunter, prey)).toBe(false);
    prey.x = 0;
    expect(canEatPlayer(hunter, prey)).toBe(true);
    hunter.size = DRAG_RULES.maximumSize;
    prey.size = DRAG_RULES.maximumSize - DRAG_RULES.predationSizeAdvantage - .01;
    expect(canEatPlayer(hunter, prey)).toBe(false);
    prey.size = 2;
    expect(blobRadius(hunter.size) / blobRadius(prey.size)).toBeGreaterThan(DRAG_RULES.predationRadiusRatio);
    expect(canEatPlayer(hunter, prey)).toBe(true);
  });

  it("banks a bounded swallow reward, reforms for two seconds, then grants visible anti-farming protection", () => {
    const state = createDragState(players(4), 51);
    state.phase = "live";
    state.patches.forEach((patch) => patch.drops.forEach((drop) => { drop.eaten = true; }));
    const [hunter, prey] = state.actors;
    state.actors.slice(2).forEach((actor, index) => { actor.x = 500; actor.y = index * 120; });
    hunter.x = prey.x = 0;
    hunter.y = prey.y = 0;
    hunter.size = 2;
    prey.size = 1;
    prey.lungeTime = DRAG_RULES.lungeSeconds;
    prey.vx = 540;
    const before = hunter.size;
    stepDragState(state, .01);
    expect(hunter.predations).toBe(1);
    expect(hunter.swallowFlash).toBeGreaterThan(.8);
    expect(hunter.score).toBeGreaterThanOrEqual(DRAG_RULES.predationScore);
    expect(hunter.size).toBeGreaterThan(before);
    expect(hunter.size - before).toBeLessThanOrEqual(.55);
    expect(prey.reform).toBeGreaterThan(DRAG_RULES.respawnSeconds - .02);
    expect(prey.lungeTime).toBe(0);
    const banked = prey.score = 3;
    advance(state, DRAG_RULES.respawnSeconds + .05);
    expect(prey.score).toBeGreaterThanOrEqual(banked);
    expect(prey.score).toBeLessThan(banked + .01);
    expect(prey.protection).toBeGreaterThan(2);
    expect(Math.abs(prey.x - state.camera.x)).toBeLessThan(DRAG_RULES.viewWidth / 2 - DRAG_RULES.dangerInset);
    expect(Math.abs(prey.y - state.camera.y)).toBeLessThan(DRAG_RULES.viewHeight / 2 - DRAG_RULES.dangerInset);
    hunter.x = prey.x;
    hunter.y = prey.y;
    hunter.size = 2;
    expect(canEatPlayer(hunter, prey)).toBe(false);
    const respawnX = prey.x;
    applyDragInput(state, prey.id, { x: 1, y: 0 });
    stepDragState(state, .05);
    expect(prey.reform).toBe(0);
    expect(prey.x).toBeGreaterThan(respawnX);
  });

  it("resolves simultaneous hunters deterministically by size then seat, independent of actor array order", () => {
    const winnerForOrder = (reverse: boolean) => {
      const state = createDragState(players(4), 63);
      state.phase = "live";
      state.patches.forEach((patch) => patch.drops.forEach((drop) => { drop.eaten = true; }));
      state.actors.forEach((actor, index) => {
        actor.x = index < 3 ? 0 : 500;
        actor.y = index < 3 ? 0 : 300;
        actor.size = index < 2 ? 2 : 1;
      });
      if (reverse) state.actors.reverse();
      stepDragState(state, .01);
      return state.actors.find(({ predations }) => predations > 0)?.id;
    };
    expect(winnerForOrder(false)).toBe("p1");
    expect(winnerForOrder(true)).toBe("p1");
  });

  it("offers harmless interactive practice, resets every advantage, then lands a shared GO after nine seconds", () => {
    const state = createDragState(players(4), 12);
    state.actors[0].size = 3;
    state.actors[0].score = 9;
    state.actors[0].x = 500;
    applyDragInput(state, "p1", { x: 1, y: 0, lunge: 1 });
    advance(state, DRAG_RULES.practice + .05);
    expect(state.phase).toBe("countdown");
    expect(state.actors.every((actor) => actor.size === DRAG_RULES.minimumSize && actor.score === 0 && actor.reform === 0)).toBe(true);
    expect(Math.max(...state.actors.map(({ x }) => Math.abs(x)))).toBeLessThanOrEqual(338);
    advance(state, DRAG_RULES.runway - DRAG_RULES.practice + .05);
    expect(state.phase).toBe("live");
    expect(state.goFlash).toBeGreaterThan(0);
  });

  it("sanitizes input and consumes one lunge sequence once in the current world direction", () => {
    const state = createDragState(players(4), 4);
    const actor = state.actors[0];
    actor.size = 2.5;
    expect(() => applyDragInput(state, actor.id, { x: NaN, y: 0, lunge: 1 })).not.toThrow();
    expect(() => applyDragInput(state, actor.id, { x: "right", y: 0, lunge: 1 })).not.toThrow();
    expect(actor.lastLunge).toBeNull();
    applyDragInput(state, actor.id, { x: 8, y: 8 });
    expect(Math.hypot(actor.input.x, actor.input.y)).toBeCloseTo(1);

    applyDragInput(state, actor.id, { x: 0, y: 1, lunge: 7 });
    expect(actor.vy).toBeLessThan(0);
    expect(actor.size).toBeGreaterThanOrEqual(DRAG_RULES.minimumSize);
    const spent = actor.size;
    actor.cooldown = 0;
    actor.lungeTime = 0;
    applyDragInput(state, actor.id, { x: 0, y: 1, lunge: 7 });
    expect(actor.size).toBe(spent);
    applyDragInput(state, actor.id, { x: 0, y: 1, lunge: 8 });
    expect(actor.size).toBeLessThan(spent);
  });

  it("uses diminishing size influence so one maximum blob cannot outweigh several newcomers", () => {
    expect(cameraInfluence(DRAG_RULES.maximumSize)).toBeGreaterThan(cameraInfluence(1));
    expect(cameraInfluence(DRAG_RULES.maximumSize)).toBeLessThan(cameraInfluence(1) * 3);
  });

  it("keeps small respawns substantially faster while a grown hunter can still burst to intercept", () => {
    expect(movementSpeed(DRAG_RULES.minimumSize)).toBeGreaterThan(movementSpeed(DRAG_RULES.maximumSize) * 1.5);
    const state = createDragState(players(4), 68);
    const hunter = state.actors[0];
    hunter.size = 2;
    applyDragInput(state, hunter.id, { x: 1, y: 0, lunge: 1 });
    expect(hunter.vx).toBeGreaterThan(movementSpeed(DRAG_RULES.minimumSize));
    expect(hunter.size).toBeGreaterThan(1 + DRAG_RULES.predationSizeAdvantage);
  });

  it("keeps the full restrained lunge silhouette inside the retained viewport", () => {
    const radius = blobRadius(DRAG_RULES.maximumSize);
    const scale = visualBlobScaleX(radius, DRAG_RULES.lungeStretch, DRAG_RULES.maximumPop);
    expect(radius * DRAG_RULES.contourMaxWobble * scale).toBeLessThanOrEqual(radius + DRAG_RULES.retentionPadding);
  });

  it("smooths a sudden heavy removal without snapping the opposite side", () => {
    const state = createDragState(players(4), 8);
    state.phase = "live";
    state.actors[0].x = 610;
    state.actors[0].size = DRAG_RULES.maximumSize;
    state.actors.slice(1).forEach((actor) => { actor.x = -80; });
    advance(state, 1.5);
    const before = { x: state.camera.x, vx: state.camera.vx };
    state.actors[0].reform = DRAG_RULES.respawnSeconds;
    state.actors[0].size = 1;
    stepDragState(state, .05);
    expect(Math.abs(state.camera.x - before.x)).toBeLessThanOrEqual(DRAG_RULES.cameraMaxSpeed * .05 + .001);
    expect(Math.abs(state.camera.vx - before.vx)).toBeLessThanOrEqual(DRAG_RULES.cameraMaxAcceleration * .05 + .001);
  });

  it("retains a warned maximum blob and lets it escape a worst-corner pull without a refreshed lunge", () => {
    const state = createDragState(players(4), 18);
    state.phase = "live";
    const actor = state.actors[0];
    actor.size = DRAG_RULES.maximumSize;
    actor.cooldown = DRAG_RULES.lungeCooldown;
    actor.lungeTime = DRAG_RULES.lungeSeconds;
    actor.vx = 311;
    actor.vy = 311;
    actor.input = { x: 1 / Math.sqrt(2), y: -1 / Math.sqrt(2) };
    state.camera.vx = -DRAG_RULES.cameraMaxSpeed / Math.sqrt(2);
    state.camera.vy = -DRAG_RULES.cameraMaxSpeed / Math.sqrt(2);
    state.actors.slice(1).forEach((other) => { other.x = -600; other.y = -250; other.size = DRAG_RULES.maximumSize; });
    actor.x = DRAG_RULES.viewWidth / 2 - blobRadius(actor.size) - 20;
    actor.y = DRAG_RULES.viewHeight / 2 - blobRadius(actor.size) - 20;
    retainActorInVisibleFrame(state, actor);

    advance(state, .1);
    actor.input = { x: -1 / Math.sqrt(2), y: 1 / Math.sqrt(2) };
    let cleared = false;
    for (let index = 0; index < Math.ceil(DRAG_RULES.warningSeconds / .05); index++) {
      stepDragState(state, .05);
      const extent = blobRadius(actor.size) + DRAG_RULES.retentionPadding;
      expect(Math.abs(actor.x - state.camera.x) + extent).toBeLessThanOrEqual(DRAG_RULES.viewWidth / 2 + .001);
      expect(Math.abs(actor.y - state.camera.y) + extent).toBeLessThanOrEqual(DRAG_RULES.viewHeight / 2 + .001);
      expect(actor.reform).toBe(0);
      if (!actor.warningActive) { cleared = true; break; }
    }
    expect(cleared).toBe(true);
    expect(actor.cooldown).toBeLessThan(DRAG_RULES.lungeCooldown);
  });

  it("reform time earns no points or food and death does not refresh lunge cooldown", () => {
    const state = createDragState(players(4), 9);
    state.phase = "live";
    const actor = state.actors[0];
    actor.score = 4;
    actor.food = 3;
    actor.cooldown = 2.4;
    actor.reform = DRAG_RULES.respawnSeconds;
    advance(state, 1);
    expect(actor.score).toBe(4);
    expect(actor.food).toBe(3);
    expect(actor.cooldown).toBeCloseTo(1.4, 1);
  });

  it("stops a mid-lunge disconnect immediately without refreshing its cooldown", () => {
    const state = createDragState(players(4), 23);
    const actor = state.actors[0];
    applyDragInput(state, actor.id, { x: 1, y: 0, lunge: 1 });
    const cooldown = actor.cooldown;
    const position = { x: actor.x, y: actor.y };
    expect(actor.lungeTime).toBeGreaterThan(0);
    neutralizeDragActor(actor);
    stepDragState(state, .05);
    expect({ x: actor.x, y: actor.y }).toEqual(position);
    expect(actor.lungeTime).toBe(0);
    expect(actor.cooldown).toBeCloseTo(cooldown - .05, 5);
  });

  it("rewards maintained growth while keeping minimum-size survival meaningful", () => {
    const state = createDragState(players(4), 31);
    state.phase = "live";
    state.actors[0].size = DRAG_RULES.maximumSize;
    advance(state, 10);
    expect(state.actors[0].score).toBeGreaterThan(state.actors[1].score * 1.8);
    expect(state.actors[1].score).toBeGreaterThan(.7);
  });

  it("returns every launch participant exactly once with shared places and excludes late spectators", () => {
    const state = createDragState(players(4), 2);
    state.actors[0].score = 8.2;
    state.actors[1].score = 8.2;
    state.actors[2].score = 4;
    state.actors.push({ ...state.actors[3], id: "late", name: "Late", spectator: true, score: 100 });
    const results = dragResults(state);
    expect(results.map(({ id }) => id).sort()).toEqual(["p1", "p2", "p3", "p4"]);
    expect(results.slice(0, 2).map(({ place }) => place)).toEqual([1, 1]);
  });
});

describe("Drag host surface", () => {
  it("renders protection as a contrasting two-layer dashed shield", () => {
    const state = createDragState(players(4), 70);
    state.actors[0].protection = 2;
    const c = recordingCanvas();
    const strokes: Array<{ style: string; width: number }> = [];
    c.stroke = () => strokes.push({ style: String(c.strokeStyle), width: c.lineWidth });

    renderDrag(c, state, 1280, 720);

    const underStroke = strokes.find(({ width }) => width === 8);
    const topStroke = strokes.find(({ style }) => style === "#fff6df");
    expect(underStroke?.style).toMatch(/^rgb\(/);
    expect(underStroke?.style).not.toBe(topStroke?.style);
    expect(topStroke?.width).toBe(3);
  });

  it("renders smooth bezier cells and bare food without pool rings or labels", () => {
    const state = createDragState(players(4), 72);
    const draws: TextDraw[] = [];
    const c = recordingCanvas(draws);
    const bezierCurveTo = vi.fn();
    const arc = vi.fn();
    c.bezierCurveTo = bezierCurveTo;
    c.arc = arc;
    renderDrag(c, state, 1280, 720);
    expect(bezierCurveTo.mock.calls.length).toBeGreaterThanOrEqual(4 * 12);
    expect(arc.mock.calls.every(([, , radius]) => Number(radius) < 50)).toBe(true);
    expect(draws.some(({ text }) => text === "INK COMING")).toBe(false);
  });

  it("stays below the host message budget with ten players and uses one public status batch", () => {
    const send = vi.fn();
    const host = createHost({ players: players(10), seed: 3, width: 1280, height: 720, send });
    for (let index = 0; index < 100; index++) host.tick(.05);
    expect(send.mock.calls.length).toBeLessThanOrEqual(26);
    expect(send.mock.calls.every(([, to]) => to === undefined)).toBe(true);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      t: "dragStates",
      frames: expect.objectContaining({ p1: expect.objectContaining({ t: "dragState" }), p10: expect.objectContaining({ t: "dragState" }) }),
    }));
  });

  it("coalesces a full-room sync storm into one public batch", () => {
    const send = vi.fn();
    const host = createHost({ players: players(10), seed: 3, width: 1280, height: 720, send });
    for (let frame = 0; frame < 120; frame++) {
      for (let index = 0; index < 10; index++) host.onInput(`p${index + 1}`, { t: "sync" });
      host.tick(1 / 60);
    }
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(send.mock.calls.length).toBeLessThanOrEqual(10);
    expect(send.mock.calls.every(([message]) => (message as { t?: string }).t === "dragStates")).toBe(true);
  });

  it("renders ten non-colour identities at a room-readable size without initial label overlap", () => {
    const state = createDragState(players(10), 6);
    const draws: TextDraw[] = [];
    renderDrag(recordingCanvas(draws), state, 1280, 720);
    const labels = draws.filter(({ text, font }) => /^PLAYER/.test(text) && font.includes("22px"));
    expect(labels).toHaveLength(10);
    expect(labels.every(({ font }) => Number(/(\d+)px/.exec(font)?.[1]) >= 22)).toBe(true);
    for (const label of labels) {
      const actor = state.actors.find(({ name }) => name.toUpperCase() === label.text)!;
      expect(Math.hypot(label.x - actor.x, label.y - actor.y)).toBeLessThan(blobRadius(actor.size) + 90);
    }
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const sameRow = Math.abs(labels[i].y - labels[j].y) < 38;
        if (sameRow) expect(Math.abs(labels[i].x - labels[j].x)).toBeGreaterThanOrEqual(220);
      }
    }
  });

  it("keeps co-located name and warning callouts bounded and attached to the pile", () => {
    const extent = blobRadius(DRAG_RULES.minimumSize) + DRAG_RULES.retentionPadding;
    const positions = [
      [0, 0],
      [-DRAG_RULES.viewWidth / 2 + extent, -DRAG_RULES.viewHeight / 2 + extent],
      [DRAG_RULES.viewWidth / 2 - extent, -DRAG_RULES.viewHeight / 2 + extent],
      [-DRAG_RULES.viewWidth / 2 + extent, DRAG_RULES.viewHeight / 2 - extent],
      [DRAG_RULES.viewWidth / 2 - extent, DRAG_RULES.viewHeight / 2 - extent],
    ];
    for (const [positionIndex, [x, y]] of positions.entries()) {
      const state = createDragState(players(10), 17);
      state.actors.forEach((actor) => {
        actor.x = x;
        actor.y = y;
        actor.warningActive = true;
        actor.warning = 1;
      });
      const draws: TextDraw[] = [];
      renderDrag(recordingCanvas(draws), state, 1280, 720);
      const callouts = draws.filter(({ text, font }) => (/^PLAYER/.test(text) && font.includes("22px")) || /^INSIDE /.test(text));
      expect(callouts).toHaveLength(20);
      const rects = callouts.map((draw) => ({
        x: draw.x,
        y: draw.y,
        width: draw.maxWidth === undefined ? draw.text.length * 13 + 14 : draw.maxWidth + 12,
        height: 36,
      }));
      for (const rect of rects) {
        expect(rect.x - rect.width / 2, `position ${positionIndex} left bound`).toBeGreaterThanOrEqual(-DRAG_RULES.viewWidth / 2);
        expect(rect.x + rect.width / 2, `position ${positionIndex} right bound`).toBeLessThanOrEqual(DRAG_RULES.viewWidth / 2);
        expect(rect.y - rect.height / 2, `position ${positionIndex} top bound`).toBeGreaterThanOrEqual(-DRAG_RULES.viewHeight / 2);
        expect(rect.y + rect.height / 2, `position ${positionIndex} bottom bound`).toBeLessThanOrEqual(DRAG_RULES.viewHeight / 2);
        expect(Math.hypot(rect.x - x, rect.y - y), `position ${positionIndex} detached callout`).toBeLessThan(160);
      }
    }
  });

  it("keeps all four rim name and warning labels inside the logical viewport", () => {
    const state = createDragState(players(4), 11);
    const radius = blobRadius(DRAG_RULES.maximumSize) + DRAG_RULES.retentionPadding;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    state.actors.forEach((actor, index) => {
      actor.size = DRAG_RULES.maximumSize;
      actor.x = corners[index][0] * (DRAG_RULES.viewWidth / 2 - radius);
      actor.y = corners[index][1] * (DRAG_RULES.viewHeight / 2 - radius);
      actor.warningActive = true;
      actor.warning = 1;
      retainActorInVisibleFrame(state, actor);
    });
    const draws: TextDraw[] = [];
    renderDrag(recordingCanvas(draws), state, 1280, 720);
    const required = draws.filter(({ text, font }) => (/^PLAYER/.test(text) && font.includes("22px")) || /^INSIDE /.test(text));
    expect(required).toHaveLength(8);
    for (const draw of required) {
      expect(draw.x).toBeGreaterThan(-DRAG_RULES.viewWidth / 2 + 9);
      expect(draw.x).toBeLessThan(DRAG_RULES.viewWidth / 2 - 9);
      expect(draw.y).toBeGreaterThan(-DRAG_RULES.viewHeight / 2 + 20);
      expect(draw.y).toBeLessThan(DRAG_RULES.viewHeight / 2 - 20);
    }
    for (const draw of required.filter(({ text }) => /^PLAYER/.test(text))) {
      const actor = state.actors.find(({ name }) => name.toUpperCase() === draw.text)!;
      expect(Math.hypot(draw.x - actor.x, draw.y - actor.y)).toBeLessThan(blobRadius(actor.size) + 90);
    }
  });

  it("makes late joiners spectate and neutralizes disconnected motion without granting recovery", () => {
    const send = vi.fn();
    const host = createHost({ players: players(4), seed: 3, width: 1280, height: 720, send });
    host.onInput("p1", { x: 1, y: 0 });
    host.onConnectionChange?.("p1", false);
    host.onJoin?.(player("late", 8, "Late"));
    send.mockClear();
    host.onInput("late", { t: "sync" });
    for (let index = 0; index < 4; index++) host.tick(.05);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      t: "dragStates",
      frames: expect.objectContaining({ late: expect.objectContaining({ phase: "spectating", interactive: false }) }),
    }));
    expect(host.results().some(({ id }) => id === "late")).toBe(false);
  });

  it("stops simulation and outbound work after destroy", () => {
    const send = vi.fn();
    const host = createHost({ players: players(4), seed: 3, width: 1280, height: 720, send });
    host.destroy?.();
    host.tick(2);
    expect(send).not.toHaveBeenCalled();
  });
});
