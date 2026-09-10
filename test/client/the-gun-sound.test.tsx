import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeSource {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
  buffer?: unknown;
}

const expectedPaths = [
  "/audio/the-gun/countdown.mp3",
  "/audio/the-gun/go.mp3",
  "/audio/the-gun/warning.mp3",
  "/audio/the-gun/drop.mp3",
  "/audio/the-gun/pickup.mp3",
  "/audio/the-gun/shot.mp3",
  "/audio/the-gun/reload.mp3",
  "/audio/the-gun/empty.mp3",
  "/audio/the-gun/shove.mp3",
  "/audio/the-gun/death.mp3",
  "/audio/the-gun/respawn.mp3",
  "/audio/the-gun/finish.mp3",
];

function installAudioMocks(options: { fetchOk?: boolean; deferred?: boolean; decodeReject?: boolean } = {}) {
  const bufferSources: FakeSource[] = [];
  const oscillators: FakeSource[] = [];
  const outputs: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  const fetchResolvers: Array<(response: unknown) => void> = [];

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
    createBufferSource() {
      const source: FakeSource & { connect: (node: unknown) => unknown; playbackRate: { value: number } } = {
        buffer: null,
        playbackRate: { value: 1 },
        connect: (node) => node,
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      bufferSources.push(source);
      return source;
    }
    createOscillator() {
      const source: FakeSource & { connect: (node: unknown) => unknown; type: OscillatorType; frequency: object } = {
        type: "sine",
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: (node) => node,
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      oscillators.push(source);
      return source;
    }
    decodeAudioData() {
      return options.decodeReject ? Promise.reject(new Error("decode failed")) : Promise.resolve({ duration: 0.48 });
    }
  }

  const response = {
    ok: options.fetchOk ?? true,
    status: options.fetchOk === false ? 404 : 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  };
  const fetchMock = vi.fn().mockImplementation(() => options.deferred
    ? new Promise((resolve) => fetchResolvers.push(resolve))
    : Promise.resolve(response));
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("fetch", fetchMock);
  return {
    bufferSources,
    oscillators,
    outputs,
    resolveFetches() { fetchResolvers.splice(0).forEach((resolve) => resolve(response)); },
  };
}

describe("The Gun sound runtime", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("maps and preloads every committed local cue, caps voices, prioritizes finish, and cleans up", async () => {
    const { bufferSources, oscillators, outputs } = installAudioMocks();
    const { THE_GUN_CUE_PATHS, TheGunSound } = await import("../../src/client/games/the-gun/sound");
    expect(Object.values(THE_GUN_CUE_PATHS)).toEqual(expectedPaths);
    const sound = new TheGunSound("host");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(12));
    expect(vi.mocked(fetch).mock.calls.map(([path]) => path)).toEqual(expectedPaths);

    sound.play("shove");
    sound.play("shove");
    sound.play("shove");
    sound.play("shove");
    sound.play("warning");
    sound.play("reload");
    sound.play("respawn");
    sound.play("empty");
    await vi.waitFor(() => expect(bufferSources).toHaveLength(6));
    expect(oscillators).toHaveLength(0);

    sound.play("shot");
    await vi.waitFor(() => expect(bufferSources).toHaveLength(7));
    expect(bufferSources.slice(0, 6).filter((source) => source.stop.mock.calls.length === 1)).toHaveLength(1);

    sound.play("finish");
    await vi.waitFor(() => expect(bufferSources).toHaveLength(8));
    expect(bufferSources.slice(0, 7).every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    sound.destroy();
    expect(bufferSources[7].stop).toHaveBeenCalledOnce();
    expect(outputs.filter((output) => output.disconnect.mock.calls.length > 0)).toHaveLength(11);
  });

  it("falls back procedurally when a local asset cannot decode", async () => {
    const { bufferSources, oscillators } = installAudioMocks({ decodeReject: true });
    const { TheGunSound } = await import("../../src/client/games/the-gun/sound");
    const sound = new TheGunSound("phone");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(12));
    sound.play("shot");
    await vi.waitFor(() => expect(oscillators).toHaveLength(1));
    expect(bufferSources).toHaveLength(0);
    expect(oscillators[0].start).toHaveBeenCalledOnce();
    sound.destroy();
    expect(oscillators[0].stop.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("lets finish invalidate lower-priority pending samples", async () => {
    const { bufferSources, oscillators, resolveFetches } = installAudioMocks({ deferred: true });
    const { TheGunSound } = await import("../../src/client/games/the-gun/sound");
    const sound = new TheGunSound("host");
    sound.play("shove");
    sound.play("warning");
    sound.play("finish");
    resolveFetches();
    await vi.waitFor(() => expect(bufferSources).toHaveLength(1));
    expect(oscillators).toHaveLength(0);
    sound.destroy();
  });

  it("does not start a pending sample after teardown", async () => {
    const { bufferSources, oscillators, resolveFetches } = installAudioMocks({ deferred: true });
    const { TheGunSound } = await import("../../src/client/games/the-gun/sound");
    const sound = new TheGunSound("host");
    sound.play("shot");
    sound.destroy();
    resolveFetches();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(bufferSources).toHaveLength(0);
    expect(oscillators).toHaveLength(0);
  });
});
