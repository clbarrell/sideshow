import { describe, expect, it } from "vitest";
import { BOOST_MAX_SPEED, drive, GRASS_MAX_SPEED, KART_RADIUS, NORMAL_MAX_SPEED, separateBumpers, type DrivingBody } from "../../src/client/games/kart/physics";

const body = (): DrivingBody => ({ x: 0, y: 0, a: 0, v: 400, slip: 0, steer: 0 });

describe("kart handling and contact", () => {
  it("lets the nose lead momentum in corners and quickly regains grip when released", () => {
    const car = body();
    for (let i = 0; i < 30; i++) drive(car, 1, 1, false, false, 1 / 60);
    expect(car.a).toBeGreaterThan(0.9);
    expect(car.slip).toBeLessThan(-40);
    expect(car.slip).toBeGreaterThanOrEqual(-210);
    expect(car.steer).toBeLessThan(1);
    for (let i = 0; i < 30; i++) drive(car, 0, 1, false, false, 1 / 60);
    expect(Math.abs(car.slip)).toBeLessThan(10);
    expect(car.v).toBeGreaterThan(400);
  });

  it("loads an automatic high-speed drift and rewards one clean release", () => {
    const car = body();
    let sliding = false;
    for (let i = 0; i < 45; i++) {
      const frame = drive(car, 1, 1, false, false, 1 / 60);
      sliding = sliding || frame.drifting;
    }
    expect(sliding).toBe(true);
    expect(car.driftCharge).toBeGreaterThan(0.3);
    expect(Math.abs(car.slip)).toBeGreaterThan(80);

    const release = drive(car, 0, 1, false, false, 1 / 60);
    expect(release.miniBoost).toBeGreaterThanOrEqual(0.18);
    expect(release.miniBoost).toBeLessThanOrEqual(0.36);
    expect(car.driftCharge).toBe(0);
    expect(drive(car, 0, 1, false, false, 1 / 60).miniBoost).toBe(0);
  });

  it("cannot farm drift rewards on grass, in reverse, or by rapidly wiggling", () => {
    const cases = [
      { car: body(), offRoad: true, throttle: 1 },
      { car: { ...body(), v: -120 }, offRoad: false, throttle: -1 },
    ];
    for (const scenario of cases) {
      for (let i = 0; i < 90; i++) drive(scenario.car, 1, scenario.throttle, false, scenario.offRoad, 1 / 60);
      expect(drive(scenario.car, 0, scenario.throttle, false, scenario.offRoad, 1 / 60).miniBoost).toBe(0);
    }

    const cuttingGrass = body();
    for (let i = 0; i < 45; i++) drive(cuttingGrass, 1, 1, false, false, 1 / 60);
    drive(cuttingGrass, 1, 1, false, true, 1 / 60);
    expect(cuttingGrass.driftCharge).toBe(0);
    expect(drive(cuttingGrass, 0, 1, false, false, 1 / 60).miniBoost).toBe(0);

    const wiggling = body();
    let rewards = 0;
    for (let i = 0; i < 180; i++) {
      rewards += drive(wiggling, i % 8 < 4 ? 1 : -1, 1, false, false, 1 / 60).miniBoost;
    }
    expect(rewards).toBe(0);
  });

  it("caps road, turbo, grass, and drift-exit speed", () => {
    const road = body(), turbo = body(), grass = body();
    for (let i = 0; i < 600; i++) {
      drive(road, 0, 1, false, false, 1 / 60);
      drive(turbo, 0, 1, true, false, 1 / 60);
      drive(grass, 0, 1, true, true, 1 / 60);
    }
    expect(road.v).toBeLessThanOrEqual(NORMAL_MAX_SPEED);
    expect(turbo.v).toBeLessThanOrEqual(BOOST_MAX_SPEED);
    expect(grass.v).toBeLessThanOrEqual(GRASS_MAX_SPEED * 1.45);

    for (let i = 0; i < 45; i++) drive(road, 1, 1, false, false, 1 / 60);
    drive(road, 0, 1, false, false, 1 / 60);
    expect(road.v).toBeLessThanOrEqual(580);
  });

  it("keeps equivalent handling across 30 and 60fps, with predictable reverse", () => {
    const slow = body(), fast = body();
    for (let i = 0; i < 30; i++) drive(slow, 0.5, 1, false, false, 1 / 30);
    for (let i = 0; i < 60; i++) drive(fast, 0.5, 1, false, false, 1 / 60);
    expect(Math.hypot(slow.x - fast.x, slow.y - fast.y)).toBeLessThan(15);
    const reversing = { ...body(), v: 0 };
    for (let i = 0; i < 60; i++) drive(reversing, 1, -1, false, false, 1 / 60);
    expect(reversing.v).toBe(-180);
    expect(reversing.a).toBeLessThan(0);
    expect(Math.abs(reversing.slip)).toBeLessThan(65);
  });

  it("keeps drift charge and release reward equivalent across 30 and 60fps", () => {
    const at30 = body(), at60 = body();
    for (let i = 0; i < 24; i++) drive(at30, 0.85, 1, false, false, 1 / 30);
    for (let i = 0; i < 48; i++) drive(at60, 0.85, 1, false, false, 1 / 60);
    const release30 = drive(at30, 0, 1, false, false, 1 / 30);
    const release60 = drive(at60, 0, 1, false, false, 1 / 60);
    expect(release30.miniBoost).toBeCloseTo(release60.miniBoost, 2);
    expect(Math.hypot(at30.x - at60.x, at30.y - at60.y)).toBeLessThan(24);
  });

  it("bumps only at the fixed collision radius and separates exact overlaps", () => {
    for (const angle of [0, Math.PI / 2, Math.PI]) {
      const a = { ...body(), a: angle };
      const b = { ...body(), x: KART_RADIUS * 2 + 1, a: -angle };
      expect(separateBumpers(a, b)).toBeNull();
      b.x -= 2;
      expect(separateBumpers(a, b)).not.toBeNull();
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(KART_RADIUS * 2);
    }
    const a = body(), b = body();
    separateBumpers(a, b);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBe(KART_RADIUS * 2);
  });
});
