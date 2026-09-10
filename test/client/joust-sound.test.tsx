import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeSource {
  loop: boolean;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

function installAudioMocks(fetchOk = true) {
  const sources: FakeSource[] = [];
  const gains: Array<{
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    setTargetAtTime: ReturnType<typeof vi.fn>;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
  }> = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    resume = vi.fn();
    createGain() {
      const gain = {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      };
      gains.push(gain);
      return {
        gain,
        connect() { return this; },
        disconnect: vi.fn(),
      };
    }
    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        connect(node: unknown) { return node; },
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    }
    decodeAudioData() { return Promise.resolve({ duration: 1 }); }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: fetchOk,
    status: fetchOk ? 200 : 404,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }));
  return { sources, gains };
}

describe("joust sound runtime", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preloads the host mix, caps repeated voices, and stops every source", async () => {
    const { sources, gains } = installAudioMocks();
    const { JoustSound } = await import("../../src/client/games/joust/sound");
    const sound = new JoustSound("host");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    await vi.waitFor(() => expect(sources.filter((source) => source.loop)).toHaveLength(1));
    expect(gains.some((gain) => gain.linearRampToValueAtTime.mock.calls.some(([value]) => value === 0.16))).toBe(true);

    sound.flap();
    sound.flap();
    sound.flap();
    sound.flap();
    await vi.waitFor(() => expect(sources).toHaveLength(4));
    expect(gains.filter((gain) => gain.linearRampToValueAtTime.mock.calls.some(([value]) => value === 0.07))).toHaveLength(3);
    sound.destroy();
    expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
  });

  it("keeps the game playable when every audio asset is missing", async () => {
    const { sources } = installAudioMocks(false);
    const { JoustSound } = await import("../../src/client/games/joust/sound");
    const sound = new JoustSound("phone");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(() => {
      sound.flap();
      sound.bump();
      sound.crack();
      sound.egg("steal");
      sound.destroy();
    }).not.toThrow();
    expect(sources).toHaveLength(0);
  });
});
