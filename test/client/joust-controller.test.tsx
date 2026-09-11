import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JoustController from "../../src/client/games/joust/controller";

const you = {
  id: "pip",
  name: "Pip",
  seat: 2,
  color: "#52E0B0",
  connected: true,
  ready: true,
  awayAt: null,
};

describe("joust controller", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("coalesces simultaneous drift and a one-shot flap at 20Hz", () => {
    const send = vi.fn();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    render(<JoustController you={you} send={send} last={null} connected />);

    const stick = screen.getByRole("application", { name: "Drift left or right" });
    vi.spyOn(stick, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 200, width: 300, height: 200, toJSON: () => ({}),
    });
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 178, clientY: 100 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Flap upward" }), { pointerId: 2 });
    act(() => vi.advanceTimersByTime(50));

    expect(send).toHaveBeenLastCalledWith({ x: 1, flap: 1 });
    expect(vibrate).toHaveBeenCalledWith(32);

    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(stick, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 0 });
  });

  it("keeps horizontal thrust full under diagonal dragging and ignores vertical dragging", () => {
    const send = vi.fn();
    render(<JoustController you={you} send={send} last={null} connected />);
    const lane = screen.getByRole("application", { name: "Drift left or right" });
    fireEvent.pointerDown(lane, { pointerId: 4, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(lane, { pointerId: 4, clientX: 100, clientY: 240 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 0 });
    fireEvent.pointerMove(lane, { pointerId: 4, clientX: 178, clientY: 240 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 1 });
    expect(lane.querySelector("i")?.style.transform).toBe("translateX(65px)");
  });

  it("replaces controls while disconnected and resumes with a neutral frame", () => {
    const send = vi.fn();
    const view = render(<JoustController you={you} send={send} last={null} connected={false} />);

    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Flap upward" })).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    expect(send).not.toHaveBeenCalled();

    view.rerender(<JoustController you={you} send={send} last={null} connected />);
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 0 });
  });

  it("neutralizes drift on lost capture, blur, and unmount", () => {
    const send = vi.fn();
    const view = render(<JoustController you={you} send={send} last={null} connected />);
    const stick = screen.getByRole("application", { name: "Drift left or right" });
    vi.spyOn(stick, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 200, width: 300, height: 200, toJSON: () => ({}),
    });

    fireEvent.pointerDown(stick, { pointerId: 7, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stick, { pointerId: 7, clientX: 22, clientY: 100 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: -1 });

    fireEvent.lostPointerCapture(stick, { pointerId: 7 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 0 });

    fireEvent.pointerDown(stick, { pointerId: 8, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stick, { pointerId: 8, clientX: 178, clientY: 100 });
    fireEvent.blur(window);
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 0 });
    expect(() => view.unmount()).not.toThrow();
  });

  it("shows colour-independent seat identity, guidance, and audio control", () => {
    render(<JoustController you={you} send={() => undefined} last={null} connected />);
    const root = screen.getByText("Pip").closest("main")!;
    expect(root.dataset.seat).toBe("3");
    expect(root.dataset.pattern).toBe("2");
    expect(screen.getByText("Bump from above · touch rival eggs +1")).toBeTruthy();
    expect(screen.getByText("Turn to take wing")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turn sound off" }).getAttribute("aria-pressed")).toBe("true");
  });
});
