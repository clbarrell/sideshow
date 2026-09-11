export const TRACK_SAMPLES = 240;
export const ROAD_HALF = 160;
export const CHECKPOINT_EVERY = 12;
export const BOOST_PAD_SAMPLES = [36, 96, 156, 196] as const;

export type TrackFamily = "oval" | "kidney" | "peanut" | "s-bend";

export interface TrackPoint {
  x: number;
  y: number;
}

export interface KartTrack {
  family: TrackFamily;
  pts: TrackPoint[];
  checkpoints: number[];
  boostPads: number[];
}

export interface TrackValidation {
  valid: boolean;
  maxTurn: number;
  minBranchClearance: number;
  maxSpacingError: number;
}

export interface CheckpointProgress {
  lap: number;
  checkpoint: number;
  crossed: boolean;
}

const FAMILIES: TrackFamily[] = ["oval", "kidney", "peanut", "s-bend"];
const DENSE_SAMPLES = 1_440;
const MIN_BRANCH_CLEARANCE = ROAD_HALF * 2 + 36;
const MAX_SAMPLE_TURN = 0.19;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shape(family: TrackFamily, angle: number, variation: number): TrackPoint {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  switch (family) {
    case "kidney": {
      const r = 1 + (0.16 + variation * 0.03) * Math.cos(angle) - 0.12 * Math.cos(angle * 2);
      return { x: c * r, y: s * r * 0.74 };
    }
    case "peanut": {
      const r = 1 + (0.22 + variation * 0.035) * Math.cos(angle * 2);
      return { x: c * r, y: s * r * 0.78 };
    }
    case "s-bend":
      return {
        x: c + (0.18 + variation * 0.025) * Math.sin(angle * 2),
        y: s * 0.72 + 0.08 * Math.sin(angle * 3),
      };
    default:
      return { x: c, y: s * (0.68 + variation * 0.035) };
  }
}

function resampleClosed(points: TrackPoint[], count: number): TrackPoint[] {
  const cumulative = [0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cumulative[cumulative.length - 1];
  const result: TrackPoint[] = [];
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const target = total * i / count;
    while (cumulative[segment + 1] < target) segment += 1;
    const a = points[segment % points.length];
    const b = points[(segment + 1) % points.length];
    const length = cumulative[segment + 1] - cumulative[segment];
    const mix = length > 0 ? (target - cumulative[segment]) / length : 0;
    result.push({ x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix });
  }
  return result;
}

function generatedPoints(seed: number, family: TrackFamily) {
  const rnd = mulberry32(seed ^ 0x91e10da5);
  const rotation = (rnd() - 0.5) * 0.46;
  const scale = 1_430 + rnd() * 120;
  const xScale = 0.96 + rnd() * 0.08;
  const yScale = 0.96 + rnd() * 0.08;
  const phase = rnd() * Math.PI * 2;
  const variation = rnd() * 2 - 1;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dense: TrackPoint[] = [];
  for (let i = 0; i < DENSE_SAMPLES; i++) {
    const point = shape(family, i / DENSE_SAMPLES * Math.PI * 2 + phase, variation);
    const x = point.x * scale * xScale;
    const y = point.y * scale * yScale;
    dense.push({ x: x * cos - y * sin, y: x * sin + y * cos });
  }
  return resampleClosed(dense, TRACK_SAMPLES);
}

function pointSegmentDistance(point: TrackPoint, a: TrackPoint, b: TrackPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function cross(a: TrackPoint, b: TrackPoint, c: TrackPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentDistance(a: TrackPoint, b: TrackPoint, c: TrackPoint, d: TrackPoint) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (((abC <= 0 && abD >= 0) || (abC >= 0 && abD <= 0)) &&
      ((cdA <= 0 && cdB >= 0) || (cdA >= 0 && cdB <= 0))) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b),
  );
}

export function validateTrack(track: Pick<KartTrack, "pts">): TrackValidation {
  const { pts } = track;
  if (pts.length !== TRACK_SAMPLES || pts.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return { valid: false, maxTurn: Infinity, minBranchClearance: 0, maxSpacingError: Infinity };
  }

  const spacings = pts.map((point, i) => {
    const next = pts[(i + 1) % pts.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const averageSpacing = spacings.reduce((sum, spacing) => sum + spacing, 0) / spacings.length;
  const maxSpacingError = Math.max(...spacings.map((spacing) => Math.abs(spacing - averageSpacing))) / averageSpacing;

  let maxTurn = 0;
  for (let i = 0; i < pts.length; i++) {
    const previous = pts[(i - 1 + pts.length) % pts.length];
    const point = pts[i];
    const next = pts[(i + 1) % pts.length];
    const ax = point.x - previous.x;
    const ay = point.y - previous.y;
    const bx = next.x - point.x;
    const by = next.y - point.y;
    maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)));
  }

  let minBranchClearance = Infinity;
  const localSegmentWindow = CHECKPOINT_EVERY * 2;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const gap = Math.min(j - i, pts.length - (j - i));
      if (gap < localSegmentWindow) continue;
      minBranchClearance = Math.min(minBranchClearance, segmentDistance(
        pts[i], pts[(i + 1) % pts.length], pts[j], pts[(j + 1) % pts.length],
      ));
    }
  }

  return {
    valid: maxTurn <= MAX_SAMPLE_TURN && minBranchClearance >= MIN_BRANCH_CLEARANCE && maxSpacingError <= 0.035,
    maxTurn,
    minBranchClearance,
    maxSpacingError,
  };
}

function assembleTrack(seed: number, family: TrackFamily): KartTrack {
  return {
    family,
    pts: generatedPoints(seed, family),
    checkpoints: Array.from({ length: TRACK_SAMPLES / CHECKPOINT_EVERY }, (_, i) => i * CHECKPOINT_EVERY),
    boostPads: [...BOOST_PAD_SAMPLES],
  };
}

export function buildTrack(seed: number): KartTrack {
  const family = FAMILIES[(seed >>> 0) % FAMILIES.length];
  const track = assembleTrack(seed, family);
  if (validateTrack(track).valid) return track;

  // The oval is a deterministic safety net for an extreme numerical edge.
  // Seeded scale, rotation, phase and aspect still keep fallback rounds varied.
  return assembleTrack(seed ^ 0x5f356495, "oval");
}

export function advanceCheckpoint(
  track: Pick<KartTrack, "pts" | "checkpoints">,
  lap: number,
  checkpoint: number,
  x: number,
  y: number,
  radius = 260,
): CheckpointProgress {
  const sample = track.pts[track.checkpoints[checkpoint]];
  if (!sample || Math.hypot(sample.x - x, sample.y - y) >= radius) {
    return { lap, checkpoint, crossed: false };
  }
  const next = checkpoint + 1;
  return next >= track.checkpoints.length
    ? { lap: lap + 1, checkpoint: 0, crossed: true }
    : { lap, checkpoint: next, crossed: true };
}
