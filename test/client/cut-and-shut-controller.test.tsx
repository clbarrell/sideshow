import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CutAndShutController from "../../src/client/games/cut-and-shut/controller";
import type { CutAndShutFrame } from "../../src/client/games/cut-and-shut/protocol";

const you = { id: "p1", name: "Alice", seat: 0, color: "#ff5a47", connected: true, ready: true, awayAt: null };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function frame(overrides: Partial<CutAndShutFrame> = {}): CutAndShutFrame {
  return {
    t: "cutAndShutState",
    phase: "planning",
    round: 1,
    rounds: 4,
    seconds: 18,
    road: { shape: "bend", rotation: 0 },
    inputSeq: 0,
    safeCouriers: 3,
    survivors: 3,
    teamScore: 3,
    message: "Turn your road.",
    ...overrides,
  };
}

function previewRotation() {
  return screen.getByRole("img", { name: /road orientation/ }).getAttribute("data-rotation");
}

describe("Cut & Shut phone", () => {
  it("syncs on mount and turns only its assigned road", () => {
    const send = vi.fn();
    render(<CutAndShutController you={you} send={send} last={frame()} connected />);

    expect(send).toHaveBeenCalledWith({ t: "sync" });
    expect(screen.getByRole("button", { name: "Turn road" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn road" }));
    expect(send).toHaveBeenLastCalledWith({ t: "rotate", round: 1, seq: 1, rotation: 1 });
    expect(previewRotation()).toBe("1");
    expect(screen.queryByText(/correct|destination|courier 1/i)).toBeNull();
  });

  it("keeps rapid optimistic turns while an older host snapshot arrives", () => {
    const send = vi.fn();
    const view = render(<CutAndShutController you={you} send={send} last={frame()} connected />);
    const turn = screen.getByRole("button", { name: "Turn road" });
    fireEvent.click(turn);
    fireEvent.click(turn);
    fireEvent.click(turn);

    expect(send.mock.calls.slice(-3).map(([input]) => input)).toEqual([
      { t: "rotate", round: 1, seq: 1, rotation: 1 },
      { t: "rotate", round: 1, seq: 2, rotation: 2 },
      { t: "rotate", round: 1, seq: 3, rotation: 3 },
    ]);
    view.rerender(<CutAndShutController you={you} send={send} last={frame({ inputSeq: 0, road: { shape: "bend", rotation: 0 } })} connected />);
    expect(previewRotation()).toBe("3");

    view.rerender(<CutAndShutController you={you} send={send} last={frame({ inputSeq: 3, road: { shape: "bend", rotation: 3 } })} connected />);
    expect(previewRotation()).toBe("3");
  });

  it("drops pending optimism at a new round and keeps input sequences monotonic", () => {
    const send = vi.fn();
    const view = render(<CutAndShutController you={you} send={send} last={frame()} connected />);
    fireEvent.click(screen.getByRole("button", { name: "Turn road" }));

    view.rerender(<CutAndShutController you={you} send={send} last={frame({ round: 2, road: { shape: "bend", rotation: 0 }, inputSeq: 1 })} connected />);
    expect(previewRotation()).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Turn road" }));
    expect(send).toHaveBeenLastCalledWith({ t: "rotate", round: 2, seq: 2, rotation: 1 });
  });

  it("clears a dropped pending turn across reconnect and does not restore older phases", () => {
    const send = vi.fn();
    const view = render(<CutAndShutController you={you} send={send} last={frame()} connected />);
    fireEvent.click(screen.getByRole("button", { name: "Turn road" }));
    expect(previewRotation()).toBe("1");

    view.rerender(<CutAndShutController you={you} send={send} last={frame()} connected={false} />);
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn road" })).toBeNull();

    view.rerender(<CutAndShutController you={you} send={send} last={frame({ inputSeq: 0, road: { shape: "bend", rotation: 0 } })} connected />);
    expect(send).toHaveBeenLastCalledWith({ t: "sync" });
    expect(previewRotation()).toBe("0");
    view.rerender(<CutAndShutController you={you} send={send} last={frame({ phase: "runway" })} connected />);
    expect(screen.getByRole("button", { name: "Turn road" })).toBeTruthy();
  });

  it("gives spectators no road and disables the button outside planning", () => {
    const send = vi.fn();
    const view = render(<CutAndShutController you={you} send={send} last={frame({ phase: "march" })} connected />);
    expect(screen.getByRole("button", { name: "Turn road" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("3 of 6 couriers are on the road.")).toBeTruthy();

    view.rerender(<CutAndShutController you={you} send={send} last={frame({ phase: "spectator", road: null })} connected />);
    expect(screen.getByText("Watching this round")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn road" })).toBeNull();
  });
});
