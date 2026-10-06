import { describe, expect, it } from 'vitest';
import { createSectorWorld, createSquad, damageAgainst, statsFor, stepWorld } from './index.js';

describe('authoritative ship stats', () => {
  it.each([
    ['explorer', 4, 50, 0, 0, 0, 0, 2.5, 7],
    ['interceptor', 6, 100, 1, 6, 5, 1, 1.7, 4],
    ['frigate', 9, 200, 1, 8, 10, 2, 1.25, 4],
    ['bomber', 12, 150, 1, 30, 30, 3, 0.8, 4],
  ] as const)('uses the exact %s values', (kind, cost, maxHp, armor, damage, attackTicks, range, speed, vision) => {
    expect(statsFor(createSectorWorld(), 'p1', kind)).toMatchObject({ cost, maxHp, armor, damage, attackTicks, range, speed, vision });
  });
  it('applies counter before armor, with a minimum of one', () => {
    expect(damageAgainst('interceptor', 'bomber', 6, 1)).toBe(11);
    expect(damageAgainst('interceptor', 'frigate', 6, 1)).toBe(3.5);
    expect(damageAgainst('interceptor', 'frigate', 2, 3)).toBe(1);
    expect(damageAgainst('frigate', 'interceptor', 8, 1)).toBe(13);
    expect(damageAgainst('bomber', 'frigate', 30, 1)).toBe(44);
    expect(damageAgainst('bomber', 'guardian', 30, 0)).toBe(45);
  });
  it('fires a bomber every three seconds, splashes hostiles only, and records official kills', () => {
    let world = createSectorWorld(); world.guardians = []; world.economy = false; world.events = [];
    world.squads = [createSquad('b', 'p1', 'bomber', { x: 10, y: 10 }),
      createSquad('ally', 'p1', 'explorer', { x: 12, y: 10 }),
      createSquad('target', 'p2', 'frigate', { x: 13, y: 10 }),
      createSquad('splash', 'p2', 'explorer', { x: 13, y: 11 })];
    world.squads[0]!.attackTargetId = 'target';
    world.players.p2.statModifiers = [{ stat: 'damage', operation: 'set', value: 0 }];
    for (let i = 0; i < 29; i++) world = stepWorld(world);
    expect(world.squads[2]!.hp).toBe(200);
    world = stepWorld(world);
    expect(world.squads[2]!.hp).toBe(156);
    expect(world.squads[3]!.hp).toBe(35);
    expect(world.squads[1]!.hp).toBe(50);
  });
});
