import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installAudioMocks(fetchOk = true) {
  const sources: Array<{
    buffer: unknown;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }> = [];
  const gains: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  let context: FakeAudioContext;
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    constructor() { context = this; }
    createGain() {
      const gain = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          setTargetAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }
    createBufferSource() {
      const source = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
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
  return { sources, gains, get context() { return context; } };
}

async function flushAudio() {
  // Fetch, arrayBuffer and decode each resolve in a separate microtask.
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

describe("game selection sound", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preloads all cues without autoplay or replaying an interaction made before loading", async () => {
    const { sources } = installAudioMocks();
    const { MenuSound } = await import("../../src/client/menu-sound");
    const sound = new MenuSound();
    sound.play("select");
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const cue of ["browse", "select", "launch"]) {
      expect(fetch).toHaveBeenCalledWith(`/audio/menu/${cue}.mp3`);
    }
    await flushAudio();
    expect(sources).toHaveLength(0);
    sound.play("select");
    expect(sources).toHaveLength(1);
    expect(sources[0].start).toHaveBeenCalledOnce();
    sound.destroy();
  });

  it("drops muted and suspended interactions instead of playing them later", async () => {
    const audio = installAudioMocks();
    const { MenuSound } = await import("../../src/client/menu-sound");
    const { setAudioMuted } = await import("../../src/client/audio");
    const sound = new MenuSound();
    await flushAudio();
    setAudioMuted(true);
    sound.play("select");
    setAudioMuted(false);
    audio.context.state = "suspended";
    sound.play("launch");
    audio.context.state = "running";
    await flushAudio();
    expect(audio.sources).toHaveLength(0);
    sound.play("browse");
    expect(audio.sources).toHaveLength(1);
    sound.destroy();
  });

  it("limits rapid browsing, releases ended voices, and prioritizes selection and launch", async () => {
    const audio = installAudioMocks();
    const { MenuSound } = await import("../../src/client/menu-sound");
    const sound = new MenuSound();
    await flushAudio();
    sound.play("browse");
    sound.play("browse");
    expect(audio.sources).toHaveLength(1);
    for (const time of [0.1, 0.2, 0.3]) {
      audio.context.currentTime = time;
      sound.play("browse");
    }
    expect(audio.sources).toHaveLength(3);
    audio.sources[0].onended?.();
    expect(audio.sources[0].disconnect).toHaveBeenCalledOnce();
    audio.context.currentTime = 0.4;
    sound.play("browse");
    expect(audio.sources).toHaveLength(4);
    sound.play("select");
    expect(audio.sources).toHaveLength(5);
    expect(audio.sources[0].stop).not.toHaveBeenCalled();
    for (const source of audio.sources.slice(1, 4)) expect(source.stop).toHaveBeenCalledOnce();
    sound.play("launch");
    expect(audio.sources).toHaveLength(6);
    expect(audio.sources[4].stop).toHaveBeenCalledOnce();
    sound.destroy();
    expect(audio.sources[5].stop).toHaveBeenCalledOnce();
    // The menu disconnects its own bus, preserving the shared master for games.
    expect(audio.gains[1].disconnect).toHaveBeenCalledOnce();
    expect(audio.gains[0].disconnect).not.toHaveBeenCalled();
    sound.play("select");
    expect(audio.sources).toHaveLength(6);
  });

  it("ignores in-flight loads after destruction", async () => {
    const { sources } = installAudioMocks();
    const { MenuSound } = await import("../../src/client/menu-sound");
    const sound = new MenuSound();
    sound.destroy();
    await flushAudio();
    expect(() => { sound.play("launch"); sound.destroy(); }).not.toThrow();
    expect(sources).toHaveLength(0);
  });

  it("keeps missing assets and unsupported audio silent", async () => {
    const { sources } = installAudioMocks(false);
    const { MenuSound } = await import("../../src/client/menu-sound");
    const sound = new MenuSound();
    await flushAudio();
    expect(() => {
      sound.play("browse");
      sound.play("select");
      sound.play("launch");
      sound.destroy();
    }).not.toThrow();
    expect(sources).toHaveLength(0);
    vi.stubGlobal("AudioContext", undefined);
    const unsupported = new MenuSound();
    expect(() => { unsupported.play("select"); unsupported.destroy(); }).not.toThrow();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
