import { describe, expect, it } from "vitest";
import { advanceCheckpoint, buildTrack, CHECKPOINT_EVERY, ROAD_HALF, TRACK_SAMPLES, validateTrack } from "../../src/client/games/kart/track";

function signature(seed: number) {
  const track = buildTrack(seed);
  return `${track.family}:${track.pts.slice(0, 12).map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join("|")}`;
}

describe("kart track generation", () => {
  it("is deterministic while producing visibly distinct closed course families", () => {
    expect(signature(23)).toBe(signature(23));
    const tracks = Array.from({ length: 16 }, (_, seed) => buildTrack(seed));
    expect(new Set(tracks.map((track) => track.family))).toEqual(new Set(["oval", "kidney", "peanut", "s-bend"]));
    expect(new Set(tracks.map((_, seed) => signature(seed))).size).toBe(16);
  });

  it("keeps generated roads finite, evenly sampled, drivable, and clear of other branches", () => {
    for (let seed = 0; seed < 64; seed++) {
      const track = buildTrack(seed);
      const report = validateTrack(track);
      expect(track.pts, `seed ${seed}`).toHaveLength(TRACK_SAMPLES);
      expect(report.valid, `seed ${seed}: ${JSON.stringify(report)}`).toBe(true);
      expect(report.maxTurn).toBeLessThanOrEqual(0.19);
      expect(report.minBranchClearance).toBeGreaterThanOrEqual(ROAD_HALF * 2 + 36);
      expect(report.maxSpacingError).toBeLessThanOrEqual(0.035);
    }
  });

  it("places ordered checkpoints and turbo pads on sampled road positions", () => {
    for (let seed = 0; seed < 12; seed++) {
      const track = buildTrack(seed);
      expect(track.checkpoints).toEqual(Array.from({ length: TRACK_SAMPLES / CHECKPOINT_EVERY }, (_, i) => i * CHECKPOINT_EVERY));
      expect(track.boostPads).toEqual([36, 96, 156, 196]);
      for (const index of [...track.checkpoints, ...track.boostPads]) {
        expect(track.pts[index]).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
      }
    }
  });

  it("advances race progress only through the outstanding checkpoint", () => {
    const track = buildTrack(7);
    const wrong = track.pts[track.checkpoints[3]];
    expect(advanceCheckpoint(track, 0, 0, wrong.x, wrong.y)).toEqual({ lap: 0, checkpoint: 0, crossed: false });

    let progress = { lap: 0, checkpoint: 0 };
    for (let i = 0; i < track.checkpoints.length; i++) {
      const point = track.pts[track.checkpoints[progress.checkpoint]];
      const next = advanceCheckpoint(track, progress.lap, progress.checkpoint, point.x, point.y);
      expect(next.crossed).toBe(true);
      progress = { lap: next.lap, checkpoint: next.checkpoint };
    }
    expect(progress).toEqual({ lap: 1, checkpoint: 0 });
  });
});
