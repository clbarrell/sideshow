import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TheGunController from "../../src/client/games/the-gun/controller";
import type { TheGunStatusFrame } from "../../src/client/games/the-gun/protocol";

const you = { id: "pip", name: "Pip", seat: 2, color: "#52E0B0", connected: true, ready: true, awayAt: null };
const frame: TheGunStatusFrame = {
  t: "theGunStatus", phase: "live", interactive: true, armed: false, loaded: false,
  reload: 0, respawn: 0, remaining: 91, status: "SHOVE — the gun is loose",
};

describe("The Gun controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("coalesces movement at 20Hz and sends simultaneous jump/action once", () => {
    const send = vi.fn();
    render(<TheGunController you={you} send={send} last={frame} connected />);
    send.mockClear();
    const stick = screen.getByRole("application", { name: "Move left or right" });
    vi.spyOn(stick, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 200, width: 300, height: 200, toJSON: () => ({}) });
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 178, clientY: 100 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Jump" }), { pointerId: 2 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Shove" }), { pointerId: 3 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 1, jump: expect.any(Number), action: expect.any(Number) });
    act(() => vi.advanceTimersByTime(50));
    expect(send.mock.calls.filter(([value]) => (value as { action?: number }).action !== undefined)).toHaveLength(1);
  });

  it("changes the context action to FIRE and exposes reload without requiring the phone", () => {
    const armed = { ...frame, armed: true, loaded: true, status: "LOADED — one shot" };
    const view = render(<TheGunController you={you} send={vi.fn()} last={armed} connected />);
    expect(screen.getByRole("button", { name: "Fire" })).toBeTruthy();
    expect(screen.getByText("LOADED")).toBeTruthy();
    view.rerender(<TheGunController you={you} send={vi.fn()} last={{ ...armed, loaded: false, reload: 2.2, status: "RELOADING — keep moving" }} connected />);
    expect(screen.getByRole("button", { name: "Fire" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("2.2")).toBeTruthy();
  });

  it("animates a press but waits for host acceptance before haptic success", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    const send = vi.fn();
    const view = render(<TheGunController you={you} send={send} last={{ ...frame, actionState: "protected" }} connected />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Shove" }), { pointerId: 3 });
    expect(screen.getByRole("button", { name: "Shove" }).className).toContain("is-active");
    expect(screen.getByText("PROTECTED — MOVE / JUMP")).toBeTruthy();
    expect(vibrate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 0, action: expect.any(Number) });
    view.rerender(<TheGunController you={you} send={send} last={{ ...frame, actionState: "cooldown", cue: "shove" }} connected />);
    expect(vibrate).toHaveBeenCalledWith(36);
    expect(screen.getByText("RECOVERING")).toBeTruthy();
  });

  it("neutralizes held movement on blur, disconnect, and unmount", () => {
    const send = vi.fn();
    const view = render(<TheGunController you={you} send={send} last={frame} connected />);
    const stick = screen.getByRole("application", { name: "Move left or right" });
    vi.spyOn(stick, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 200, width: 300, height: 200, toJSON: () => ({}) });
    fireEvent.pointerDown(stick, { pointerId: 4, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stick, { pointerId: 4, clientX: 22, clientY: 100 });
    act(() => vi.advanceTimersByTime(50));
    fireEvent.blur(window);
    expect(send).toHaveBeenLastCalledWith({ x: 0 });
    view.rerender(<TheGunController you={you} send={send} last={frame} connected={false} />);
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    expect(() => view.unmount()).not.toThrow();
  });

  it("keeps seat/glyph identity, landscape guidance, status, and sound control", () => {
    render(<TheGunController you={you} send={() => undefined} last={frame} connected />);
    const root = screen.getByText("Pip").closest("main")!;
    expect(root.dataset.seat).toBe("3");
    expect(root.dataset.pattern).toBe("2");
    expect(screen.getByText("Turn sideways to fight")).toBeTruthy();
    expect(screen.getByText("SHOVE — the gun is loose")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sound/i })).toBeTruthy();
  });
});
