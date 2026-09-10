import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LogRunnerController from "../../src/client/games/log-runner/controller";
import { applyLogRunnerInput, createLogRunnerState } from "../../src/client/games/log-runner/host";

const you = {
  id: "pip",
  name: "Pip",
  seat: 2,
  color: "#52E0B0",
  connected: true,
  ready: true,
  awayAt: null,
};

const runnerFrame = {
  t: "logRunnerStatus" as const,
  role: "runner" as const,
  phase: "live" as const,
  interactive: true,
  remaining: 72,
  cooldown: 0,
  queued: false,
  status: "Read the river",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Log Runner controller", () => {
  it("shows exactly two huge independent runner actions and consumes jump once", () => {
    const send = vi.fn();
    render(<LogRunnerController you={you} send={send} last={runnerFrame} connected />);
    send.mockClear();
    const jump = screen.getByRole("button", { name: "Jump over low obstacles" });
    const duck = screen.getByRole("button", { name: "Duck under high obstacles" });
    expect(screen.getAllByRole("button").filter((button) => button !== screen.getByRole("button", { name: /sound/i }))).toHaveLength(2);

    fireEvent.pointerDown(jump, { pointerId: 1 });
    fireEvent.pointerDown(duck, { pointerId: 2 });
    expect(send.mock.calls).toEqual(expect.arrayContaining([
      [{ jump: expect.any(Number) }],
      [{ duck: expect.any(Number) }],
    ]));
    expect(send.mock.calls.filter(([value]) => (value as { jump?: number }).jump !== undefined)).toHaveLength(1);
  });

  it("does not repeat a discrete duck across release, blur, disconnect, or unmount", () => {
    const send = vi.fn();
    const view = render(<LogRunnerController you={you} send={send} last={runnerFrame} connected />);
    const duck = screen.getByRole("button", { name: "Duck under high obstacles" });
    fireEvent.pointerDown(duck, { pointerId: 4 });
    fireEvent.pointerUp(duck, { pointerId: 4 });
    fireEvent.blur(window);
    view.rerender(<LogRunnerController you={you} send={send} last={runnerFrame} connected={false} />);
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    expect(send.mock.calls.filter(([value]) => (value as { duck?: number }).duck !== undefined)).toHaveLength(1);
    expect(() => view.unmount()).not.toThrow();
  });

  it("switches eliminated players to one attributed branch control with readable cooldown", () => {
    const send = vi.fn();
    const bankFrame = { ...runnerFrame, role: "bank" as const, cooldown: 4.2, status: "Branch cooling" };
    const view = render(<LogRunnerController you={you} send={send} last={bankFrame} connected />);
    expect(screen.queryByRole("button", { name: "Jump over low obstacles" })).toBeNull();
    expect(screen.getByRole("button", { name: "Throw branch" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("5")).toBeTruthy();

    view.rerender(<LogRunnerController you={you} send={send} last={{ ...bankFrame, cooldown: 0, queued: true, status: "Branch queued in a fair gap" }} connected />);
    expect(screen.getByText("QUEUED")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Throw branch" }).hasAttribute("disabled")).toBe(true);

    view.rerender(<LogRunnerController you={you} send={send} last={{ ...bankFrame, cooldown: 0, status: "Branch ready" }} connected />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Throw branch" }), { pointerId: 9 });
    expect(send).toHaveBeenLastCalledWith({ branch: expect.any(Number) });
  });

  it("supports keyboard activation without duplicating a single click", () => {
    const send = vi.fn();
    render(<LogRunnerController you={you} send={send} last={runnerFrame} connected />);
    send.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Jump over low obstacles" }), { detail: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Duck under high obstacles" }), { detail: 0 });
    expect(send.mock.calls).toEqual([[{ jump: expect.any(Number) }], [{ duck: expect.any(Number) }]]);
  });

  it("accepts the first action after a full controller remount against retained host replay state", () => {
    let now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const state = createLogRunnerState([you], 3);
    state.phase = "live";
    state.runway = 0;
    state.obstacles = [
      { id: 1, kind: "low", source: "course", ownerId: null, spawnedAt: 0, impactAt: 2, resolved: false, phraseId: "reload" },
      { id: 2, kind: "low", source: "course", ownerId: null, spawnedAt: 0, impactAt: 4, resolved: false, phraseId: "reload" },
    ];
    const send = vi.fn((value: unknown) => applyLogRunnerInput(state, you.id, value));
    const first = render(<LogRunnerController you={you} send={send} last={runnerFrame} connected />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Jump over low obstacles" }), { pointerId: 1 });
    expect(state.runners[0].answers.get(1)).toBe("jump");
    const retainedSequence = state.runners[0].jumpSequence;
    first.unmount();

    now += 1;
    render(<LogRunnerController you={you} send={send} last={runnerFrame} connected />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Jump over low obstacles" }), { pointerId: 2 });
    expect(state.runners[0].jumpSequence).toBeGreaterThan(retainedSequence);
    expect(state.runners[0].answers.get(2)).toBe("jump");
  });

  it("keeps colour-independent seat identity, landscape guidance, and a sound toggle", () => {
    render(<LogRunnerController you={you} send={() => undefined} last={runnerFrame} connected />);
    const root = screen.getByText("Pip").closest("main")!;
    expect(root.dataset.seat).toBe("3");
    expect(root.dataset.pattern).toBe("2");
    expect(screen.getByText("Turn sideways to run")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sound/i })).toBeTruthy();
  });
});
