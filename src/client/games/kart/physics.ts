// The visible rubber bumper and the simulation share this world-space radius.
// Identity labels may scale with the camera; contact geometry never does.
export const KART_RADIUS = 44;

export interface DrivingBody {
  x: number;
  y: number;
  a: number;
  v: number;
  slip: number;
  steer: number;
}

export function drive(body: DrivingBody, steer: number, throttle: number, boosted: boolean, offRoad: boolean, dt: number) {
  const maxSpeed = (offRoad ? 210 : 540) * (boosted ? 1.45 : 1);
  body.v += (throttle > 0 ? 700 : 520) * throttle * dt;
  body.v *= Math.exp(-(offRoad ? 1.9 : 0.65) * dt);
  body.v = Math.max(-180, Math.min(maxSpeed, body.v));
  // A short steering settle gives corners weight without delaying a correction.
  body.steer += (steer - body.steer) * (1 - Math.exp(-12 * dt));
  const turn = body.steer * 2.7 * Math.min(1, Math.abs(body.v) / 130) * dt * Math.sign(body.v || 1);
  body.a += turn;
  // Preserve a little sideways momentum as the nose turns, then let the tyres
  // bite. No drift button or skill-gated turbo: everyone gets the same handling.
  body.slip = (body.slip - body.v * turn) * Math.exp(-(offRoad ? 5 : 9) * dt);
  body.slip = Math.max(-125, Math.min(125, body.slip));
  body.x += (Math.cos(body.a) * body.v - Math.sin(body.a) * body.slip) * dt;
  body.y += (Math.sin(body.a) * body.v + Math.cos(body.a) * body.slip) * dt;
}

export function separateBumpers(a: DrivingBody, b: DrivingBody) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= KART_RADIUS * 2) return null;
  const nx = distance > 0 ? dx / distance : 1;
  const ny = distance > 0 ? dy / distance : 0;
  const push = (KART_RADIUS * 2 - distance) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  return { nx, ny };
}
