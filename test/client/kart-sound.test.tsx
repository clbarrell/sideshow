import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeSource {
  loop: boolean;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

function installAudioMocks() {
  const sources: FakeSource[] = [];
  const gains: Array<{
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  }> = [];
  const resume = vi.fn().mockResolvedValue(undefined);
  const destination = {};

  class FakeAudioContext {
    state = "suspended";
    currentTime = 0;
    destination = destination;
    resume = resume;

    createGain() {
      const gain = {
        value: 0,
        setTargetAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      };
      gains.push(gain);
      return {
        gain,
        connect() {
          return this;
        },
        disconnect: vi.fn(),
      };
    }

    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        playbackRate: { setTargetAtTime: vi.fn() },
        connect(node: unknown) {
          return node;
        },
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    }

    decodeAudioData() {
      return Promise.resolve({ duration: 1.35 });
    }
  }

  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }));
  return { sources, gains, resume };
}

describe("kart sound runtime", () => {
  beforeEach(() => vi.resetModules());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preloads every cue, caps boost polyphony, and stops loops on teardown", async () => {
    const { sources, gains } = installAudioMocks();
    const { KartSound } = await import("../../src/client/games/kart/sound");
    const sound = new KartSound("host");

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(sources.filter((source) => source.loop)).toHaveLength(2));

    sound.boost();
    sound.boost();
    sound.boost();
    await vi.waitFor(() => expect(sources).toHaveLength(4));
    const firstBoostGain = gains.at(-2)!;
    expect(firstBoostGain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 0);
    expect(firstBoostGain.setValueAtTime).toHaveBeenNthCalledWith(2, 0.27, 1.03);
    expect(firstBoostGain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.27, 0.14);
    expect(firstBoostGain.linearRampToValueAtTime).toHaveBeenNthCalledWith(2, 0.0001, 1.35);

    sound.destroy();
    expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
  });

  it("unlocks from a gesture and persists mute state", async () => {
    const { resume } = installAudioMocks();
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const audio = await import("../../src/client/audio");

    audio.unlockAudio();
    audio.setAudioMuted(true);

    expect(resume).toHaveBeenCalledOnce();
    expect(audio.isAudioMuted()).toBe(true);
    expect(values.get("sideshow:muted")).toBe("true");
  });
});
