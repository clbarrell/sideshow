import { describe, expect, it } from "vitest";
import { drive, KART_RADIUS, separateBumpers, type DrivingBody } from "../../src/client/games/kart/physics";

const body = (): DrivingBody => ({ x: 0, y: 0, a: 0, v: 400, slip: 0, steer: 0 });

describe("kart handling and contact", () => {
  it("lets the nose lead momentum in corners and quickly regains grip when released", () => {
    const car = body();
    for (let i = 0; i < 30; i++) drive(car, 1, 1, false, false, 1 / 60);
    expect(car.a).toBeGreaterThan(0.9);
    expect(car.slip).toBeLessThan(-40);
    expect(car.slip).toBeGreaterThanOrEqual(-125);
    expect(car.steer).toBeLessThan(1);
    for (let i = 0; i < 30; i++) drive(car, 0, 1, false, false, 1 / 60);
    expect(Math.abs(car.slip)).toBeLessThan(10);
    expect(car.v).toBeGreaterThan(400);
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

  it("bumps only at the drawn bumper radius and separates exact overlaps", () => {
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
