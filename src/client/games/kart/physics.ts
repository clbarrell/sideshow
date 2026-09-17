// Kart contact uses this fixed world-space radius, without a visible ring.
// Identity labels may scale with the camera; contact geometry never does.
export const KART_RADIUS = 44;

export interface DrivingBody {
  x: number;
  y: number;
  a: number;
  v: number;
  slip: number;
  steer: number;
  drift?: number;
  driftCharge?: number;
  driftCooldown?: number;
  driftDirection?: number;
}

export interface DriveResult {
  drifting: boolean;
  charge: number;
  miniBoost: number;
}

export const NORMAL_MAX_SPEED = 540;
export const BOOST_MAX_SPEED = NORMAL_MAX_SPEED * 1.45;
export const GRASS_MAX_SPEED = 210;

export function drive(body: DrivingBody, steer: number, throttle: number, boosted: boolean, offRoad: boolean, dt: number): DriveResult {
  dt = Math.max(0, Math.min(dt, 0.1));
  const drift = body.drift ?? 0;
  const charge = body.driftCharge ?? 0;
  const cooldown = Math.max(0, (body.driftCooldown ?? 0) - dt);
  const driftDirection = body.driftDirection ?? 0;
  const steerDirection = Math.abs(steer) >= 0.35 ? Math.sign(steer) : 0;
  const switchedDirection = driftDirection !== 0 && steerDirection !== 0 && steerDirection !== driftDirection;
  const chargedSlide = drift >= 0.35 && charge >= 0.16;
  const cleanRelease = !offRoad && !boosted && throttle > 0.2 && body.v > 260 && cooldown <= 0 && chargedSlide &&
    (Math.abs(steer) <= 0.28 || switchedDirection);
  let miniBoost = 0;

  body.driftCooldown = cooldown;
  if (cleanRelease) {
    miniBoost = Math.min(0.36, 0.18 + charge * 0.18);
    body.v = Math.min(580, body.v + 35 + charge * 25);
    body.slip *= 0.52;
    body.drift = 0;
    body.driftCharge = 0;
    body.driftDirection = 0;
    body.driftCooldown = 0.75;
  } else {
    const canLoadSlide = !offRoad && !boosted && throttle > 0.35 && body.v > 300 && Math.abs(steer) >= 0.58 && cooldown <= 0;
    if (canLoadSlide && !switchedDirection) {
      body.driftDirection = driftDirection || steerDirection;
      body.drift = Math.min(1, drift + dt * 1.9);
      body.driftCharge = Math.min(1, charge + (body.drift > 0.24 ? dt * (0.48 + Math.abs(steer) * 0.28) : 0));
    } else if (switchedDirection) {
      // A direction needs to be held before it can load another slide. This
      // makes a deliberate countersteer valuable without rewarding wiggling.
      body.drift = 0;
      body.driftCharge = 0;
      body.driftDirection = steerDirection;
      body.driftCooldown = Math.max(cooldown, 0.24);
    } else {
      const invalidSurface = offRoad || boosted || throttle <= 0 || body.v <= 0;
      body.drift = invalidSurface ? 0 : Math.max(0, drift - dt * 2.4);
      body.driftCharge = invalidSurface ? 0 : Math.max(0, charge - dt * 0.8);
      if (body.drift < 0.05) body.driftDirection = steerDirection;
    }
  }

  const maxSpeed = (offRoad ? GRASS_MAX_SPEED : NORMAL_MAX_SPEED) * (boosted ? 1.45 : 1);
  body.v += (throttle > 0 ? 700 : 520) * throttle * dt;
  body.v *= Math.exp(-(offRoad ? 1.9 : 0.65) * dt);
  body.v = Math.max(-180, Math.min(maxSpeed, body.v));
  // A short steering settle gives corners weight without delaying a correction.
  body.steer += (steer - body.steer) * (1 - Math.exp(-12 * dt));
  const slide = body.drift ?? 0;
  const turn = body.steer * 2.7 * (1 - slide * 0.12) * Math.min(1, Math.abs(body.v) / 130) * dt * Math.sign(body.v || 1);
  body.a += turn;
  // Sustained fast steering progressively loosens the rear. Releasing or
  // countersteering makes the tyres bite and returns a small, capped reward.
  const grip = offRoad ? 5 : 9 - slide * 5.6;
  body.slip = (body.slip - body.v * turn * (1 + slide * 0.75)) * Math.exp(-grip * dt);
  body.slip = Math.max(-210, Math.min(210, body.slip));
  body.x += (Math.cos(body.a) * body.v - Math.sin(body.a) * body.slip) * dt;
  body.y += (Math.sin(body.a) * body.v + Math.cos(body.a) * body.slip) * dt;
  return { drifting: slide >= 0.35, charge: body.driftCharge ?? 0, miniBoost };
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
