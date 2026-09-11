import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LastMarbleController from "../../src/client/games/last-marble/controller";
import { setAudioMuted } from "../../src/client/audio";
import { isLastMarbleStatusFrame } from "../../src/client/games/last-marble/protocol";

const you = {
  id: "alex",
  name: "Alex",
  seat: 0,
  color: "#FF5A47",
  connected: true,
  ready: true,
  awayAt: null,
};

describe("Last Marble controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setAudioMuted(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects malformed host frames before they can trigger controller effects", () => {
    expect(isLastMarbleStatusFrame({ t: "lastMarbleStatus", phase: "ghost", heat: 1, heats: 5, interactive: true })).toBe(false);
    expect(isLastMarbleStatusFrame({ t: "lastMarbleStatus", phase: "playing", heat: 6, heats: 5, interactive: true })).toBe(false);
    expect(isLastMarbleStatusFrame({ t: "lastMarbleStatus", phase: "playing", heat: 1, heats: 5, interactive: true, impact: Infinity })).toBe(false);
    expect(isLastMarbleStatusFrame({ t: "lastMarbleStatus", phase: "playing", heat: 1, heats: 5, interactive: true, impact: 1.1 })).toBe(false);
  });

  it("coalesces thumbstick motion to 20Hz", () => {
    const send = vi.fn();
    const last = { t: "lastMarbleStatus", phase: "playing", heat: 1, heats: 5, interactive: true };
    const { container } = render(<LastMarbleController you={you} send={send} last={last} />);
    const stick = container.querySelector(".stick")!;

    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 178, clientY: 100 });
    act(() => vi.advanceTimersByTime(50));

    expect(send).toHaveBeenLastCalledWith({ x: 1, y: 0 });
  });

  it("requests one fresh host status whenever the controller remounts", () => {
    const send = vi.fn();
    const first = render(<LastMarbleController you={you} send={send} last={null} />);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith({ t: "sync" });
    first.unmount();

    const second = render(<LastMarbleController you={you} send={send} last={null} />);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ t: "sync" });
    second.unmount();
  });

  it("immediately sends neutral input when the phone loses focus", () => {
    const send = vi.fn();
    const last = { t: "lastMarbleStatus", phase: "playing", heat: 1, heats: 5, interactive: true };
    const { container } = render(<LastMarbleController you={you} send={send} last={last} />);
    const stick = container.querySelector(".stick")!;
    fireEvent.pointerDown(stick, { pointerId: 2, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(stick, { pointerId: 2, clientX: 98, clientY: 20 });

    fireEvent.blur(window);

    expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  });

  it("neutralizes motion if the browser loses pointer capture", () => {
    const send = vi.fn();
    const last = { t: "lastMarbleStatus", phase: "playing", heat: 1, heats: 5, interactive: true };
    const { container } = render(<LastMarbleController you={you} send={send} last={last} />);
    const stick = container.querySelector(".stick")!;
    fireEvent.pointerDown(stick, { pointerId: 3, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(stick, { pointerId: 3, clientX: 108, clientY: 30 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 1, y: 0 });

    fireEvent.lostPointerCapture(stick, { pointerId: 3 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  });

  it("replaces the stick with a look-up state after elimination", () => {
    render(
      <LastMarbleController
        you={you}
        send={() => undefined}
        last={{ t: "lastMarbleStatus", phase: "out", heat: 2, heats: 5, interactive: false, message: "P2 knocked you out" }}
      />,
    );

    expect(screen.getByText("OUT THIS HEAT")).toBeTruthy();
    expect(screen.getByText("P2 knocked you out")).toBeTruthy();
    expect(screen.queryByLabelText("Move your marble")).toBeNull();
  });

  it("keeps the same mounted stick through preparation and the next GO", () => {
    const send = vi.fn();
    const frame = { t: "lastMarbleStatus", phase: "playing", heat: 1, heats: 5, interactive: true };
    const view = render(<LastMarbleController you={you} send={send} last={frame} />);
    const stick = screen.getByRole("application");
    view.rerender(<LastMarbleController you={you} send={send} last={{ ...frame, phase: "intermission", nextHeatIn: 3 }} />);
    expect(screen.getByRole("application")).toBe(stick);
    expect(screen.getByText("SET YOUR THUMB · GO IN 3")).toBeTruthy();
    fireEvent.pointerDown(stick, { pointerId: 5, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stick, { pointerId: 5, clientX: 178, clientY: 100 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 1, y: 0 });
    view.rerender(<LastMarbleController you={you} send={send} last={{ ...frame, heat: 2 }} />);
    expect(screen.getByRole("application")).toBe(stick);
  });

  it("gives eliminated players an honest upper bound until their next heat", () => {
    render(<LastMarbleController you={you} send={vi.fn()} last={{ t: "lastMarbleStatus", phase: "out", heat: 1, heats: 5, interactive: false, nextHeatIn: 36 }} />);
    expect(screen.getByText("Next heat in at most 36s")).toBeTruthy();
  });

  it("gives local haptic feedback only for host-confirmed impacts", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    render(
      <LastMarbleController
        you={you}
        send={() => undefined}
        last={{ t: "lastMarbleStatus", phase: "playing", heat: 1, heats: 5, interactive: true, impact: 0.6 }}
      />,
    );

    expect(vibrate).toHaveBeenCalledWith(38);
  });

  it("keeps phone sound mutable without adding a gameplay button", () => {
    render(
      <LastMarbleController
        you={you}
        send={() => undefined}
        last={{ t: "lastMarbleStatus", phase: "playing", heat: 1, heats: 5, interactive: true }}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Sound on" });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Sound off" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("vibrates on host-confirmed GO and elimination phase edges", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    const view = render(
      <LastMarbleController
        you={you}
        send={() => undefined}
        last={{ t: "lastMarbleStatus", phase: "runway", heat: 1, heats: 5, interactive: true }}
      />,
    );
    view.rerender(
      <LastMarbleController
        you={you}
        send={() => undefined}
        last={{ t: "lastMarbleStatus", phase: "playing", heat: 1, heats: 5, interactive: true }}
      />,
    );
    expect(vibrate).toHaveBeenCalledWith([20, 25, 45]);
    view.rerender(
      <LastMarbleController
        you={you}
        send={() => undefined}
        last={{ t: "lastMarbleStatus", phase: "out", heat: 1, heats: 5, interactive: false }}
      />,
    );
    expect(vibrate).toHaveBeenCalledWith([35, 20, 55]);
  });

  it("clearly tells late joiners they are spectating the current match", () => {
    render(
      <LastMarbleController
        you={you}
        send={() => undefined}
        last={{ t: "lastMarbleStatus", phase: "spectating", heat: 3, heats: 5, interactive: false }}
      />,
    );

    expect(screen.getByText("MATCH IN PROGRESS")).toBeTruthy();
    expect(screen.getByText(/You’ll play when the next game starts/)).toBeTruthy();
  });
});
