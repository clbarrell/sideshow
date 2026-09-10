import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SplitController from "../../src/client/games/split/controller";

const you = { id: "alex", name: "Alex", seat: 2, color: "#52E0B0", connected: true, ready: true, awayAt: null };

describe("Split controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("is a portrait, single-stick controller with glance-light survivor instructions", () => {
    render(<SplitController you={you} send={() => undefined} last={null} />);
    expect(screen.getByText("Inside the frame")).toBeTruthy();
    expect(screen.getByText("DRAG TO MOVE")).toBeTruthy();
    expect(screen.getByText("Stick only · stay linked · ties are safe")).toBeTruthy();
    expect(screen.getByText("Turn phone upright")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turn sound off" })).toBeTruthy();
  });

  it("switches to an edge compass and reports the host-authoritative target and cooldown", () => {
    render(<SplitController you={you} send={() => undefined} last={{
      t: "splitState", role: "edge", phase: "live", status: "Frame recharging · 2.2s",
      remaining: 31, grace: 0, cut: null, target: "NW", cooldown: 2.2, queued: false, connected: true,
    }} />);
    expect(screen.getByText("You are the edge")).toBeTruthy();
    expect(screen.getByLabelText("Frame target NW")).toBeTruthy();
    expect(screen.getByLabelText("Frame target NW").querySelector("b")?.textContent).toBe("3");
    expect(screen.getByText("AIM · PUSH HARD")).toBeTruthy();
  });

  it("coalesces joystick movement and immediately neutralizes on phone blur", () => {
    const send = vi.fn();
    render(<SplitController you={you} send={send} last={null} />);
    const stick = screen.getByText("DRAG TO MOVE").parentElement!;
    Object.defineProperty(stick, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0, toJSON() {} }),
    });
    Object.defineProperty(stick, "setPointerCapture", { configurable: true, value: vi.fn() });
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 178, clientY: 100 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 1, y: 0 });
    fireEvent.blur(window);
    expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  });

  it("shows the shared cut warning on the phone without requiring a second control", () => {
    render(<SplitController you={you} send={() => undefined} last={{
      t: "splitState", role: "survivor", phase: "cut", status: "Join the bigger group",
      remaining: 38, grace: 0, cut: 2.4, target: null, cooldown: 0, queued: false, connected: true,
    }} />);
    expect(screen.getByText("Cut in 3")).toBeTruthy();
    expect(screen.getByText("Join the bigger group")).toBeTruthy();
  });
});
