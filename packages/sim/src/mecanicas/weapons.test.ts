import { expect, it } from 'vitest';
import { cloneWorld, createSquad, createWorld } from '../index.js';
import { resolveCombat } from '../maps/mechanics.js';

it('records actual shots and preserves per-ship reload while moving or retargeting', () => {
  const world = createWorld(); world.guardians = []; world.obstacles = [];
  world.squads = [createSquad('hunter', 'p1', 'interceptor', { x: 8, y: 8 }),
    createSquad('enemy', 'p2', 'explorer', { x: 9, y: 8 })];
  world.tick = 5; resolveCombat(world);
  expect(world.squads[0]).toMatchObject({ nextAttackTick: 10, lastShot: { tick: 5, from: { x: 8, y: 8 }, to: { x: 9, y: 8 }, splashRadius: 0 } });
  world.squads[0]!.x = 9; world.squads[1]!.x = 10; world.tick = 9;
  resolveCombat(world);
  expect(world.squads[0]!.lastShot?.tick).toBe(5);
  const clone = cloneWorld(world);
  clone.squads[0]!.lastShot!.from.x = 0;
  expect(world.squads[0]!.lastShot!.from.x).toBe(8);
  world.tick = 10; resolveCombat(world);
  expect(world.squads[0]!.lastShot?.tick).toBe(10);
});

it('a loaded weapon fires as soon as a target enters range, outside the global combat beat', () => {
  const world = createWorld(); world.guardians = []; world.obstacles = [];
  world.squads = [createSquad('hunter', 'p1', 'interceptor', { x: 8, y: 8 }),
    createSquad('enemy', 'p2', 'explorer', { x: 9, y: 8 })];
  world.tick = 5; resolveCombat(world);
  world.squads[1]!.x = 12; world.tick = 10; resolveCombat(world);
  expect(world.squads[0]!.lastShot!.tick).toBe(5);
  world.squads[1]!.x = 9; world.tick = 11; resolveCombat(world);
  expect(world.squads[0]).toMatchObject({ nextAttackTick: 16, lastShot: { tick: 11 } });
});

it('initial reload starts when a ship is launched instead of borrowing the global firing phase', () => {
  const world = createWorld(); world.guardians = []; world.obstacles = []; world.tick = 7;
  world.squads = [createSquad('hunter', 'p1', 'interceptor', { x: 8, y: 8 }, world),
    createSquad('enemy', 'p2', 'explorer', { x: 9, y: 8 })];
  world.tick = 10; resolveCombat(world);
  expect(world.squads[0]!.lastShot).toBeUndefined();
  world.tick = 12; resolveCombat(world);
  expect(world.squads[0]).toMatchObject({ nextAttackTick: 17, lastShot: { tick: 12 } });
});
