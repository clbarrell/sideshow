import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KartController from "../../src/client/games/kart/controller";

const you = {
  id: "alex",
  name: "Alex",
  seat: 0,
  color: "#FF5A47",
  connected: true,
  ready: true,
  awayAt: null,
};

describe("kart controller", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("activates turbo through the button's standard click behavior", () => {
    const send = vi.fn();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    render(<KartController you={you} send={send} last={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Boost — tap for a burst of speed" }));
    act(() => vi.advanceTimersByTime(50));

    expect(send).toHaveBeenCalledWith({ s: 0, t: 0, b: true });
    expect(vibrate).toHaveBeenCalledWith([25, 18, 35]);
  });

  it("holds steering and throttle together and releases each axis independently", () => {
    const send = vi.fn();
    render(<KartController you={you} send={send} last={null} />);
    const left = screen.getByRole("button", { name: "Steer left" });
    const go = screen.getByRole("button", { name: "Drive forward" });

    fireEvent.pointerDown(left, { pointerId: 1 });
    fireEvent.pointerDown(go, { pointerId: 2 });
    expect(left.className).toContain("is-held");
    expect(go.className).toContain("is-held");
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ s: -1, t: 1, b: false });

    fireEvent.pointerUp(left, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ s: 0, t: 1, b: false });
    expect(left.className).not.toContain("is-held");
    expect(go.className).toContain("is-held");

    fireEvent.pointerCancel(go, { pointerId: 2 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ s: 0, t: 0, b: false });
  });

  it("can boost while steering and driving are still held", () => {
    const send = vi.fn();
    render(<KartController you={you} send={send} last={null} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Steer right" }), { pointerId: 1 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Drive forward" }), { pointerId: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Boost — tap for a burst of speed" }));
    act(() => vi.advanceTimersByTime(50));

    expect(send).toHaveBeenLastCalledWith({ s: 1, t: 1, b: true });
  });

  it("neutralizes a held control when pointer capture is lost", () => {
    const send = vi.fn();
    render(<KartController you={you} send={send} last={null} />);
    const right = screen.getByRole("button", { name: "Steer right" });

    fireEvent.pointerDown(right, { pointerId: 7 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ s: 1, t: 0, b: false });
    fireEvent.lostPointerCapture(right, { pointerId: 7 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ s: 0, t: 0, b: false });
  });

  it("immediately neutralizes held input when the phone loses focus", () => {
    const send = vi.fn();
    render(<KartController you={you} send={send} last={null} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Drive forward" }), { pointerId: 4 });

    fireEvent.blur(window);

    expect(send).toHaveBeenLastCalledWith({ s: 0, t: 0, b: false });
  });

  it("sends a final neutral frame when unmounted with a control held", () => {
    const send = vi.fn();
    const view = render(<KartController you={you} send={send} last={null} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Steer left" }), { pointerId: 8 });

    view.unmount();

    expect(send).toHaveBeenLastCalledWith({ s: 0, t: 0, b: false });
  });

  it("explains the landscape layout before play", () => {
    render(<KartController you={you} send={() => undefined} last={null} />);
    expect(screen.getByText("Rotate to race")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Steer left" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Drive forward" })).toBeTruthy();
    expect(screen.getByText(/Left thumb steers/)).toBeTruthy();
    const controls = screen.getByLabelText("Steering").parentElement!;
    expect(controls.children[0]).toBe(screen.getByLabelText("Steering"));
    expect(controls.children[2]).toBe(screen.getByLabelText("Drive"));
  });

  it("cleans up pressed-state feedback when the controller unmounts", () => {
    const view = render(<KartController you={you} send={() => undefined} last={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Boost — tap for a burst of speed" }));
    expect(screen.getByRole("button", { name: "Boost — tap for a burst of speed" }).className).toContain("is-on");
    expect(() => view.unmount()).not.toThrow();
    expect(() => vi.runOnlyPendingTimers()).not.toThrow();
  });
});
