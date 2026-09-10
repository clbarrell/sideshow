import { beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({
  context: null as unknown as {
    currentTime: number;
    createBufferSource: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    createOscillator: ReturnType<typeof vi.fn>;
  },
  output: { gain: { value: 0 }, disconnect: vi.fn() },
  loadAudio: vi.fn(),
}));

vi.mock("../../src/client/audio", () => ({
  audioBus: () => ({ context: audio.context, gain: audio.output }),
  loadAudio: audio.loadAudio,
}));

import { isSplitAudioFrame, SplitSound } from "../../src/client/games/split/sound";

function oscillator() {
  return {
    type: "sine" as OscillatorType,
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
}

describe("Split audio", () => {
  beforeEach(() => {
    audio.context = {
      currentTime: 0,
      createBufferSource: vi.fn(),
      createGain: vi.fn(() => ({
        gain: {
          value: 0,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
      })),
      createOscillator: vi.fn(() => oscillator()),
    };
    audio.output.disconnect.mockClear();
    audio.loadAudio.mockReset().mockRejectedValue(new Error("missing optional sample"));
  });

  it("accepts only own known bounded gameplay cues", () => {
    expect(isSplitAudioFrame({ t: "splitAudio", cue: "cut" })).toBe(true);
    expect(isSplitAudioFrame({ t: "splitAudio", cue: "music" })).toBe(false);
    expect(isSplitAudioFrame({ t: "splitAudio", cue: "toString" })).toBe(false);
    expect(isSplitAudioFrame(null)).toBe(false);
  });

  it("caps procedural fallback polyphony for each voice's full lifetime and cleans up", async () => {
    const sound = new SplitSound("host");
    sound.play("countdown");
    sound.play("go");
    sound.play("cut");
    sound.play("push");
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.context.createOscillator).toHaveBeenCalledTimes(3);

    sound.play("ko");
    await Promise.resolve();
    expect(audio.context.createOscillator).toHaveBeenCalledTimes(3);

    const nodes = audio.context.createOscillator.mock.results.map((result) => result.value as ReturnType<typeof oscillator>);
    nodes.forEach((node) => node.onended?.());
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    sound.play("ko");
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.context.createOscillator).toHaveBeenCalledTimes(4);

    sound.destroy();
    expect(audio.output.disconnect).toHaveBeenCalledOnce();
  });
});
