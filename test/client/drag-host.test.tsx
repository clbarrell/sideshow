import { describe, expect, it, vi } from "vitest";
import type { Player } from "../../src/shared/protocol";
import {
  DRAG_RULES,
  applyDragInput,
  blobRadius,
  cameraInfluence,
  createDragState,
  createHost,
  dragResults,
  neutralizeDragActor,
  renderDrag,
  retainActorInVisibleFrame,
  stepDragState,
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
      if (key === "fillText") return (text: string, x: number, y: number, maxWidth?: number) => draws.push({ text, x, y, maxWidth, font: String(Reflect.get(object, "font")) });
      return Reflect.get(object, key) ?? (() => undefined);
    },
    set(object, key, value) { Reflect.set(object, key, value); return true; },
  });
}

describe("Drag simulation", () => {
  it("is seeded and begins with two separated, fully visible food choices", () => {
    for (let seed = 0; seed < 80; seed++) {
      const first = createDragState(players(4), seed);
      const same = createDragState(players(4), seed);
      expect(first.patches).toEqual(same.patches);
      expect(first.patches).toHaveLength(2);
      expect(Math.hypot(first.patches[0].x - first.patches[1].x, first.patches[0].y - first.patches[1].y)).toBeGreaterThan(220);
      for (const patch of first.patches) {
        expect(Math.abs(patch.x - first.camera.x) + 112).toBeLessThan(DRAG_RULES.viewWidth / 2);
        expect(Math.abs(patch.y - first.camera.y) + 112).toBeLessThan(DRAG_RULES.viewHeight / 2);
        for (const drop of patch.drops) {
          expect(Math.abs(drop.x - first.camera.x) + drop.radius).toBeLessThan(DRAG_RULES.viewWidth / 2);
          expect(Math.abs(drop.y - first.camera.y) + drop.radius).toBeLessThan(DRAG_RULES.viewHeight / 2);
        }
      }
    }
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
      const extent = blobRadius(actor.size) + 20;
      expect(Math.abs(actor.x - state.camera.x) + extent).toBeLessThanOrEqual(DRAG_RULES.viewWidth / 2 + .001);
      expect(Math.abs(actor.y - state.camera.y) + extent).toBeLessThanOrEqual(DRAG_RULES.viewHeight / 2 + .001);
      expect(actor.reform).toBe(0);
      if (!actor.warningActive) { cleared = true; break; }
    }
    expect(cleared).toBe(true);
    expect(actor.cooldown).toBe(0);
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
    const labels = draws.filter(({ text }) => /^\d+ · Player/.test(text));
    expect(labels).toHaveLength(10);
    expect(labels.every(({ font }) => parseInt(font, 10) >= 30)).toBe(true);
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const sameRow = Math.abs(labels[i].y - labels[j].y) < 38;
        if (sameRow) expect(Math.abs(labels[i].x - labels[j].x)).toBeGreaterThanOrEqual(220);
      }
    }
  });

  it("resolves ten co-located name and warning callouts at centre and every retained rim corner", () => {
    const extent = blobRadius(DRAG_RULES.minimumSize) + 20;
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
      const callouts = draws.filter(({ text }) => /^\d+ · Player/.test(text) || /^INSIDE /.test(text));
      expect(callouts).toHaveLength(20);
      const rects = callouts.map((draw) => ({
        x: draw.x,
        y: draw.y,
        width: draw.maxWidth === undefined ? draw.text.length * 13 + 14 : draw.maxWidth + 12,
        height: 38,
      }));
      for (const rect of rects) {
        expect(rect.x - rect.width / 2, `position ${positionIndex} left bound`).toBeGreaterThanOrEqual(-DRAG_RULES.viewWidth / 2);
        expect(rect.x + rect.width / 2, `position ${positionIndex} right bound`).toBeLessThanOrEqual(DRAG_RULES.viewWidth / 2);
        expect(rect.y - rect.height / 2, `position ${positionIndex} top bound`).toBeGreaterThanOrEqual(-DRAG_RULES.viewHeight / 2);
        expect(rect.y + rect.height / 2, `position ${positionIndex} bottom bound`).toBeLessThanOrEqual(DRAG_RULES.viewHeight / 2);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const overlap = Math.abs(rects[i].x - rects[j].x) < (rects[i].width + rects[j].width) / 2 + 5
            && Math.abs(rects[i].y - rects[j].y) < 43;
          expect(overlap, `position ${positionIndex} callouts ${i} and ${j} overlap`).toBe(false);
        }
      }
    }
  });

  it("keeps all four rim name and warning labels inside the logical viewport", () => {
    const state = createDragState(players(4), 11);
    const radius = blobRadius(DRAG_RULES.maximumSize) + 20;
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
    const required = draws.filter(({ text }) => /^\d+ · Player/.test(text) || /^INSIDE /.test(text));
    expect(required).toHaveLength(8);
    for (const draw of required) {
      expect(draw.x).toBeGreaterThan(-DRAG_RULES.viewWidth / 2 + 9);
      expect(draw.x).toBeLessThan(DRAG_RULES.viewWidth / 2 - 9);
      expect(draw.y).toBeGreaterThan(-DRAG_RULES.viewHeight / 2 + 20);
      expect(draw.y).toBeLessThan(DRAG_RULES.viewHeight / 2 - 20);
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
