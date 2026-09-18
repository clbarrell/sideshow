import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GetawayController from "../../src/client/games/getaway/controller";
import type { GetawayPhoneFrame } from "../../src/client/games/getaway/protocol";

const you = { id: "p1", name: "Alice", seat: 0, color: "#FF5A47", connected: true, ready: true, awayAt: null };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function frame(overrides: Partial<GetawayPhoneFrame> = {}): GetawayPhoneFrame {
  return {
    t: "getawayState",
    phase: "live",
    interactive: true,
    connected: true,
    crew: "Crimson",
    crewShape: "triangle",
    bags: 3,
    crewBanked: 5,
    crewPoints: 7.5,
    crewMultiplier: 1.5,
    remaining: 72,
    shoveReady: true,
    shoveCooldown: 0,
    protected: false,
    withdrawn: false,
    status: "Collect, escort, intercept",
    ...overrides,
  };
}

describe("Getaway phone", () => {
  it("cold-syncs neutral input and shows identity, crew haul, controls and status", () => {
    const send = vi.fn();
    render(<GetawayController you={you} send={send} last={frame()} connected />);
    expect(send).toHaveBeenCalledWith({ x: 0, y: 0, shove: false, sync: true });
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Crimson triangle")).toBeTruthy();
    expect(screen.getByText("Points")).toBeTruthy();
    expect(screen.getByText("7.5")).toBeTruthy();
    expect(screen.getByText("5 bags · ×1.5 smaller crew")).toBeTruthy();
    expect(screen.getByLabelText("3 of 5 bags carried")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Shove" })).toBeTruthy();
    expect(screen.getByText("Collect, escort, intercept")).toBeTruthy();
  });

  it("sends shove held and released so holding repeats only while controlled", () => {
    const send = vi.fn();
    render(<GetawayController you={you} send={send} last={frame()} connected />);
    const button = screen.getByRole("button", { name: "Shove" });
    fireEvent.pointerDown(button, { pointerId: 3 });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ shove: true }));
    fireEvent.pointerUp(button, { pointerId: 3 });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ shove: false }));
  });

  it("refreshes held input at a bounded rate and carries movement with a simultaneous shove", () => {
    vi.useFakeTimers();
    const send = vi.fn();
    render(<GetawayController you={you} send={send} last={frame()} connected />);
    const stick = screen.getByRole("application", { name: "MOVE" });
    Object.defineProperty(stick, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 300, height: 180, right: 300, bottom: 180, x: 0, y: 0, toJSON: () => ({}) }) });
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 40, clientY: 90 });
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 100, clientY: 90 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Shove" }), { pointerId: 2 });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ x: expect.any(Number), shove: true }));
    vi.advanceTimersByTime(250);
    const heldFrames = send.mock.calls.map(([value]) => value as GetawayInputLike).filter((value) => value.shove === true);
    expect(heldFrames.length).toBeGreaterThanOrEqual(3);
    expect(heldFrames.length).toBeLessThanOrEqual(6);
    expect(heldFrames.some(({ x }) => Math.abs(x) > 0.5)).toBe(true);
  });

  it("neutralizes held action on pointer cancel, blur, hidden state and unmount", () => {
    const send = vi.fn();
    const view = render(<GetawayController you={you} send={send} last={frame()} connected />);
    const button = screen.getByRole("button", { name: "Shove" });
    fireEvent.pointerDown(button, { pointerId: 4 });
    fireEvent.pointerCancel(button, { pointerId: 4 });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ shove: false }));
    fireEvent.pointerDown(button, { pointerId: 5 });
    fireEvent.blur(window);
    expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0, shove: false });
    fireEvent.pointerDown(button, { pointerId: 6 });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0, shove: false });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    fireEvent.pointerDown(button, { pointerId: 7 });
    view.unmount();
    expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0, shove: false });
  });

  it("answers a new projector sync token while remaining mounted", () => {
    const send = vi.fn();
    const view = render(<GetawayController you={you} send={send} last={frame({ syncToken: "host-a", interactive: false })} connected />);
    expect(send.mock.calls.filter(([value]) => (value as GetawayInputLike).sync === true)).toHaveLength(2);
    view.rerender(<GetawayController you={you} send={send} last={frame({ syncToken: "host-b", interactive: false })} connected />);
    expect(send.mock.calls.filter(([value]) => (value as GetawayInputLike).sync === true)).toHaveLength(3);
  });

  it("disables controls during the runway and explains an out-of-range roster", () => {
    const view = render(<GetawayController you={you} send={() => undefined} last={frame({ phase: "runway", interactive: false, remaining: 6 })} connected />);
    expect(screen.getByRole("button", { name: "Shove" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Starts in 6")).toBeTruthy();
    view.rerender(<GetawayController you={you} send={() => undefined} last={frame({ phase: "invalid", interactive: false, crew: null, crewShape: null, status: "GETAWAY NEEDS 4–10 PLAYERS · 3 JOINED" })} connected />);
    expect(screen.getByText("Roster blocked")).toBeTruthy();
    expect(screen.getByText("GETAWAY NEEDS 4–10 PLAYERS · 3 JOINED")).toBeTruthy();
  });

  it("shows reconnecting and keeps action disabled when the socket drops", () => {
    render(<GetawayController you={you} send={() => undefined} last={frame()} connected={false} />);
    expect(screen.getByText("RECONNECTING…")).toBeTruthy();
    expect(screen.getByText("Movement stopped immediately")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Shove" }).hasAttribute("disabled")).toBe(true);
  });
});

type GetawayInputLike = { x: number; y: number; shove?: boolean; sync?: boolean };
