import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeSource {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
  playbackRate: { value: number };
}

function installAudioMocks(options: { fetchOk?: boolean } = {}) {
  const sources: FakeSource[] = [];
  const disconnects: ReturnType<typeof vi.fn>[] = [];

  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};

    createGain() {
      const disconnect = vi.fn();
      disconnects.push(disconnect);
      return {
        gain: {
          value: 0,
          setTargetAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect() {
          return this;
        },
        disconnect,
      };
    }

    createBufferSource() {
      const source: FakeSource & { buffer: unknown; connect: (node: unknown) => unknown } = {
        buffer: null,
        playbackRate: { value: 1 },
        connect: (node) => node,
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    }

    decodeAudioData() {
      return Promise.resolve({ duration: 0.7 });
    }
  }

  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: options.fetchOk ?? true,
    status: options.fetchOk === false ? 404 : 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }));
  return { sources, disconnects };
}

describe("Last Marble sound runtime", () => {
  beforeEach(() => vi.resetModules());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preloads the complete local cue set and caps impact polyphony", async () => {
    const { sources } = installAudioMocks();
    const { LastMarbleSound } = await import("../../src/client/games/last-marble/sound");
    const sound = new LastMarbleSound("host");

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    sound.impact(1);
    sound.impact(0.8);
    sound.impact(0.6);
    sound.impact(0.4);
    await vi.waitFor(() => expect(sources).toHaveLength(3));
    expect(sources.every((source) => source.playbackRate.value >= 0.9 && source.playbackRate.value <= 1.12)).toBe(true);
  });

  it("stops active sources and disconnects its bus on teardown", async () => {
    const { sources, disconnects } = installAudioMocks();
    const { LastMarbleSound } = await import("../../src/client/games/last-marble/sound");
    const sound = new LastMarbleSound("phone");

    sound.fall();
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sound.destroy();

    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(disconnects.some((disconnect) => disconnect.mock.calls.length > 0)).toBe(true);
  });

  it("keeps gameplay safe when every audio asset is unavailable", async () => {
    installAudioMocks({ fetchOk: false });
    const { LastMarbleSound } = await import("../../src/client/games/last-marble/sound");
    const sound = new LastMarbleSound("host");

    expect(() => {
      sound.countdown();
      sound.go();
      sound.crack();
      sound.impact();
      sound.fall();
      sound.win(true);
      sound.destroy();
    }).not.toThrow();
    await Promise.resolve();
  });
});
