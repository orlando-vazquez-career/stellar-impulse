import { expect, it } from 'vitest';
import { createWorld } from '@impulso/sim';
import { viewFor } from './index.js';

it('projects reload and confirmed shots without leaking pursuit memory or hidden impact positions', () => {
  const world = createWorld(); world.tick = 7;
  const unit = world.squads[0]!;
  unit.attackMemory = { x: 18, y: 1, seenAt: 5 };
  unit.nextAttackTick = 10;
  unit.lastShot = { tick: 5, from: { x: 2, y: 17 }, to: { x: 3, y: 17 }, splashRadius: 0 };
  const visible = viewFor(world, 'p1').squads[0]!;
  expect(visible.attackCooldown).toEqual({ remainingTicks: 3, durationTicks: 5 });
  expect(visible.lastShot).toEqual(unit.lastShot);
  expect(visible).not.toHaveProperty('attackMemory');
  expect(visible).not.toHaveProperty('nextAttackTick');
  visible.lastShot!.to.x = 4;
  expect(unit.lastShot.to.x).toBe(3);
  unit.lastShot.to = { x: 18, y: 1 };
  expect(viewFor(world, 'p1').squads[0]).not.toHaveProperty('lastShot');
});
