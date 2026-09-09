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

  it("cleans up pressed-state feedback when the controller unmounts", () => {
    const view = render(<KartController you={you} send={() => undefined} last={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Boost — tap for a burst of speed" }));
    expect(screen.getByRole("button", { name: "Boost — tap for a burst of speed" }).className).toContain("is-on");
    expect(() => view.unmount()).not.toThrow();
    expect(() => vi.runOnlyPendingTimers()).not.toThrow();
  });
});
