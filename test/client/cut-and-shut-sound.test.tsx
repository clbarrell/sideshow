import { beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({
  context: null as unknown as {
    currentTime: number;
    createGain: ReturnType<typeof vi.fn>;
    createOscillator: ReturnType<typeof vi.fn>;
  },
  output: { gain: { value: 0 }, disconnect: vi.fn() },
}));

vi.mock("../../src/client/audio", () => ({
  audioBus: () => ({ context: audio.context, gain: audio.output }),
}));

import { CutAndShutSound } from "../../src/client/games/cut-and-shut/sound";

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

describe("Cut & Shut sound", () => {
  beforeEach(() => {
    audio.context = {
      currentTime: 0,
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
      })),
      createOscillator: vi.fn(() => oscillator()),
    };
    audio.output.disconnect.mockClear();
  });

  it("caps cue polyphony at four live voices", () => {
    const sound = new CutAndShutSound();
    for (const cue of ["offer", "stitch", "step", "fail", "result", "offer"] as const) sound.play(cue);
    expect(audio.context.createOscillator).toHaveBeenCalledTimes(4);
    const first = audio.context.createOscillator.mock.results[0].value as ReturnType<typeof oscillator>;
    first.onended?.();
    sound.play("result");
    expect(audio.context.createOscillator).toHaveBeenCalledTimes(5);
  });

  it("stops every live source and disconnects its bus on teardown", () => {
    const sound = new CutAndShutSound();
    sound.play("fold");
    sound.play("step");
    const nodes = audio.context.createOscillator.mock.results.map((result) => result.value as ReturnType<typeof oscillator>);
    sound.destroy();
    expect(nodes.every((node) => node.stop.mock.calls.length >= 1)).toBe(true);
    expect(audio.output.disconnect).toHaveBeenCalledOnce();
  });

  it("preempts all lower-priority voices so the fold cue always plays", () => {
    const sound = new CutAndShutSound();
    for (let index = 0; index < 4; index += 1) sound.play("stitch");
    const prior = audio.context.createOscillator.mock.results.map((result) => result.value as ReturnType<typeof oscillator>);
    sound.play("fold");
    expect(audio.context.createOscillator).toHaveBeenCalledTimes(5);
    expect(prior.every((node) => node.stop.mock.calls.length >= 1)).toBe(true);
  });
});
