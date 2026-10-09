import { describe, expect, it } from 'vitest';
import { applyCommand, canSee, cloneWorld, createSectorWorld, createSquad, createWorld, stepWorld, type World } from '../index.js';

function arena(): World {
  const world = createWorld();
  world.obstacles = []; world.guardians = []; world.nodes = []; world.economy = false;
  world.players.p1.base = { x: 0, y: 19 }; world.players.p2.base = { x: 19, y: 0 };
  world.squads = [createSquad('hunter', 'p1', 'interceptor', { x: 2, y: 8 }),
    { ...createSquad('enemy', 'p2', 'explorer', { x: 3, y: 8 }), hp: 10000, maxHp: 10000 }];
  return world;
}
function ticks(world: World, count: number): World {
  for (let i = 0; i < count; i++) world = stepWorld(world);
  return world;
}
const ordered = () => applyCommand(arena(), 'p1', { seq: 1, type: 'attack', squadId: 'hunter', targetId: 'enemy' }).world;

describe('attack pursuit', () => {
  it('follows a retreating opponent after an idle ship engages it', () => {
    let world = ticks(arena(), 5);
    expect(world.squads[0]!.attackTargetId).toBe('enemy');
    world.squads[1]!.x = 4;
    world = stepWorld(world);
    expect(world.squads[0]).toMatchObject({ x: 3, y: 8, attackTargetId: 'enemy' });
    world = ticks(world, 4);
    expect(world.squads[0]!.lastShot?.tick).toBe(10);
  });

  it('searches the last observed cell and resumes the same attack after a one-second vision gap', () => {
    let world = ordered();
    world.squads[1]!.x = 8;
    expect(canSee(world, 'p1', world.squads[1]!)).toBe(false);
    const initial = cloneWorld(world);
    world = ticks(world, 10);
    expect(world.squads[0]).toMatchObject({ x: 3, y: 8, attackTargetId: 'enemy', attackMemory: { x: 3, y: 8, seenAt: 0 } });
    expect(initial.squads[0]).toMatchObject({ x: 2, y: 8, attackMemory: { seenAt: 0 } });
    world.squads[1]!.x = 4;
    world = ticks(world, 5);
    expect(world.squads[0]).toMatchObject({ attackTargetId: 'enemy', lastShot: { tick: 11, to: { x: 4, y: 8 } } });
  });

  it('ignores hidden movement and eventually abandons an unobserved target', () => {
    const first = ordered(), second = cloneWorld(first);
    first.squads[1]!.x = 9;
    Object.assign(second.squads[1]!, { x: 16, y: 1 });
    const a = ticks(first, 30), b = ticks(second, 30);
    expect(a.squads[0]).toEqual(b.squads[0]);
    expect(a.squads[0]).toMatchObject({ x: 3, y: 8 });
    expect(ticks(a, 21).squads[0]).toMatchObject({ attackTargetId: null, attackMemory: undefined });
  });

  it.each(['move', 'stop', 'enqueue'] as const)('a new %s order cancels remembered pursuit', (type) => {
    const command = type === 'stop' ? { seq: 2, type, squadId: 'hunter' }
      : { seq: 2, type, squadId: 'hunter', x: 1, y: 8 };
    const result = applyCommand(ordered(), 'p1', command);
    expect(result.accepted).toBe(true);
    expect(result.world.squads[0]).toMatchObject({ attackTargetId: null, attackMemory: undefined });
  });

  it('releases destroyed targets identically with and without corpse cleanup', () => {
    const full = ordered(), cleaned = cloneWorld(full);
    full.squads[1]!.hp = 0; cleaned.squads.pop();
    expect(stepWorld(full).squads[0]).toEqual(stepWorld(cleaned).squads[0]);
    expect(stepWorld(full).squads[0]!.attackTargetId).toBeNull();
  });

  it('fires while moving without replacing the player destination', () => {
    // The enemy sits beside the first (immediate) step of a northbound route.
    const field = arena();
    Object.assign(field.squads[1]!, { x: 1, y: 7 });
    const world = applyCommand(field, 'p1', { seq: 1, type: 'move', squadId: 'hunter', x: 2, y: 1 }).world;
    expect(ticks(world, 5).squads[0]).toMatchObject({ x: 2, y: 7, target: { x: 2, y: 1 }, attackTargetId: null, lastShot: { tick: 5 } });
  });

  it('never shoots an unseen diagonal opponent even when weapon range reaches it', () => {
    const world = createSectorWorld(); world.guardians = []; world.economy = false;
    world.squads = [createSquad('bomber', 'p1', 'bomber', { x: 10, y: 10 }),
      createSquad('enemy', 'p2', 'explorer', { x: 13, y: 13 })];
    expect(canSee(world, 'p1', world.squads[1]!)).toBe(false);
    const after = ticks(world, 30);
    expect(after.squads[0]!.lastShot).toBeUndefined();
    expect(after.squads[1]!.hp).toBe(50);
  });
});
