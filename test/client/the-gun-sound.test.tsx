import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeSource {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

function installAudioMocks() {
  const sources: FakeSource[] = [];
  const outputs: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    resume = vi.fn();
    createGain() {
      const output = {
        gain: {
          value: 0,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          setTargetAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
        },
        connect() { return this; },
        disconnect: vi.fn(),
      };
      outputs.push(output);
      return output;
    }
    createOscillator() {
      const source = {
        type: "sine",
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect(node: unknown) { return node; },
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return { sources, outputs };
}

describe("The Gun sound runtime", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("plays completely offline, caps pile-up voices, prioritizes finish, and cleans up", async () => {
    const { sources, outputs } = installAudioMocks();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { TheGunSound } = await import("../../src/client/games/the-gun/sound");
    const sound = new TheGunSound("host");
    for (let index = 0; index < 9; index++) sound.play("shove");
    expect(sources).toHaveLength(4);
    sound.play("finish");
    expect(sources.slice(0, 4).every((source) => source.stop.mock.calls.length >= 2)).toBe(true);
    expect(sources).toHaveLength(5);
    expect(fetchSpy).not.toHaveBeenCalled();
    sound.destroy();
    expect(sources[4].stop.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(outputs.some((output) => output.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it("ignores play after teardown", async () => {
    const { sources } = installAudioMocks();
    const { TheGunSound } = await import("../../src/client/games/the-gun/sound");
    const sound = new TheGunSound("phone");
    sound.destroy();
    expect(() => sound.play("shot")).not.toThrow();
    expect(sources).toHaveLength(0);
  });
});
