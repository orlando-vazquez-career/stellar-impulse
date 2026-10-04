import { describe, expect, it } from 'vitest';
import { advanceShip, CRUISE_SPEED, SHIP_SPACING } from './ship-motion';

describe('ship motion', () => {
  it('accelerates smoothly, brakes and arrives exactly', () => {
    let route = [{ x: 0, y: 0 }, { x: 4, y: 0 }];
    let speed = 0;
    const speeds: number[] = [];
    for (let frame = 0; frame < 100; frame++) {
      const next = advanceShip(route, speed, CRUISE_SPEED, 50, []);
      route = next.route;
      speed = next.speed;
      speeds.push(speed);
    }
    expect(speeds[0]).toBeLessThan(speeds[3]!);
    expect(Math.max(...speeds)).toBe(CRUISE_SPEED);
    expect(route).toEqual([{ x: 4, y: 0 }]);
    expect(speed).toBe(0);
  });

  it('keeps its hull clear of a blocker even after a delayed frame', () => {
    const blocker = { x: 1, y: 0 };
    const motion = advanceShip([{ x: 0, y: 0 }, { x: 5, y: 0 }], 10, 10, 5000, [blocker]);
    expect(motion.blocked).toBe(true);
    expect(Math.hypot(motion.route[0]!.x - blocker.x, motion.route[0]!.y - blocker.y)).toBeGreaterThanOrEqual(SHIP_SPACING);
    expect(motion.speed).toBe(0);
  });
});
