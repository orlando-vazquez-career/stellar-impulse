import { describe, expect, it } from 'vitest';
import { applyCommand, createSectorWorld, createSquad, createWorld, findTiledPath, stepWorld, type World } from '../index.js';
import { assignArrival } from './orders.js';

function field(): World {
  const world = createWorld();
  world.obstacles = [];
  world.guardians = [];
  world.nodes = [];
  world.surface = { width: 20, height: 20, walkable: Array(400).fill(true), level: Array(400).fill(0), ramp: Array(400).fill(null) };
  world.squads = [createSquad('lead', 'p1', 'interceptor', { x: 3, y: 3 }),
    createSquad('parked', 'p1', 'interceptor', { x: 4, y: 3 })];
  return world;
}

describe('ship traffic', () => {
  it.each(['sector-01', 'espiral'] as const)('two allied ships crossing head-on on %s both arrive', (map) => {
    let world: World = createSectorWorld(map);
    world.guardians = [];
    const route = (findTiledPath(world.surface!, world.players.p1.base, world.core) as { path: { x: number; y: number }[] }).path;
    const [a, b] = world.squads.filter((squad) => squad.ownerId === 'p1');
    const from = route[3]!;
    const to = route[Math.min(route.length - 1, 20)]!;
    Object.assign(a!, from);
    Object.assign(b!, to);
    world = applyCommand(world, 'p1', { seq: 1, type: 'move', squadId: a!.id, x: to.x, y: to.y }).world;
    world = applyCommand(world, 'p1', { seq: 2, type: 'move', squadId: b!.id, x: from.x, y: from.y }).world;
    for (let tick = 0; tick < 1500; tick++) world = stepWorld(world);
    expect(world.squads.find((squad) => squad.id === a!.id)).toMatchObject(to);
    expect(world.squads.find((squad) => squad.id === b!.id)).toMatchObject(from);
  });

  it('routes around an allied ship and reaches its destination without sharing cells', () => {
    let world = applyCommand(field(), 'p1', { type: 'move', seq: 1, squadId: 'lead', x: 7, y: 3 }).world;
    let detoured = false;
    for (let tick = 0; tick < 60; tick++) {
      world = stepWorld(world);
      const [lead, parked] = world.squads;
      detoured ||= lead!.y !== 3;
      expect(lead!.x !== parked!.x || lead!.y !== parked!.y).toBe(true);
    }
    expect(detoured).toBe(true);
    expect(world.squads[0]).toMatchObject({ x: 7, y: 3, target: null });
  });

  it('atomically swaps allies in a single-cell corridor only on their shared cadence', () => {
    let world = field();
    world.surface!.walkable = world.surface!.walkable.map((_, index) => Math.floor(index / 20) === 3
      && (index % 20 === 3 || index % 20 === 4));
    world.squads[1]!.kind = 'explorer';
    world = applyCommand(world, 'p1', { seq: 1, type: 'move', squadId: 'lead', x: 4, y: 3 }).world;
    world = applyCommand(world, 'p1', { seq: 2, type: 'move', squadId: 'parked', x: 3, y: 3 }).world;
    const replay = world;
    for (let tick = 0; tick < 6; tick++) {
      world = stepWorld(world);
      const [a, b] = world.squads;
      expect(a!.x).not.toBe(b!.x);
      if (tick < 5) expect(a!.x).toBe(3);
    }
    expect(world.squads[0]).toMatchObject({ x: 4, y: 3, target: null });
    expect(world.squads[1]).toMatchObject({ x: 3, y: 3, target: null });
    let repeated = replay;
    for (let tick = 0; tick < 6; tick++) repeated = stepWorld(repeated);
    expect(repeated).toEqual(world);
  });

  it.each(['enemy', 'guardian'] as const)('keeps a %s blocking a narrow corridor', (blocker) => {
    let world = field();
    world.surface!.walkable = world.surface!.walkable.map((_, index) => Math.floor(index / 20) === 3);
    if (blocker === 'enemy') world.squads[1]!.ownerId = 'p2';
    else {
      world.squads.pop();
      world.guardians = [{ id: 'guard', objectiveId: 'core', x: 4, y: 3, hp: 1000, maxHp: 1000, damage: 0 }];
    }
    world.squads[0]!.damage = 0;
    world = applyCommand(world, 'p1', { seq: 1, type: 'move', squadId: 'lead', x: 5, y: 3 }).world;
    for (let tick = 0; tick < 60; tick++) world = stepWorld(world);
    expect(world.squads[0]).toMatchObject({ x: 3, y: 3, target: { x: 5, y: 3 } });
  });

  it('waits at an occupied destination and resumes the same order after it frees up', () => {
    let world = applyCommand(field(), 'p1', { type: 'move', seq: 1, squadId: 'lead', x: 4, y: 3 }).world;
    for (let tick = 0; tick < 9; tick++) world = stepWorld(world);
    expect(world.squads[0]).toMatchObject({ x: 3, y: 3, target: { x: 4, y: 3 } });
    world.squads[1]!.hp = 0;
    for (let tick = 0; tick < 9; tick++) world = stepWorld(world);
    expect(world.squads[0]).toMatchObject({ x: 4, y: 3, target: null });
  });

  it('reserves the cell a ship leaves until its interpolated step finishes', () => {
    let world = field();
    world.squads[1]!.x = 2;
    world = applyCommand(world, 'p1', { type: 'move', seq: 1, squadId: 'lead', x: 4, y: 3 }).world;
    world = applyCommand(world, 'p1', { type: 'move', seq: 2, squadId: 'parked', x: 3, y: 3 }).world;
    for (let tick = 0; tick < 3; tick++) world = stepWorld(world);
    expect(world.squads[0]).toMatchObject({ x: 4, y: 3 });
    expect(world.squads[1]).toMatchObject({ x: 2, y: 3 });
    for (let tick = 0; tick < 3; tick++) world = stepWorld(world);
    expect(world.squads[1]).toMatchObject({ x: 3, y: 3 });
  });

  it('gives a full fleet distinct arrival seats even at a blocked map edge', () => {
    const seats = assignArrival(Array.from({ length: 12 }, (_, index) => `ship-${index}`), { x: 0, y: 0 },
      { width: 20, height: 20, blocked: new Set(['1,0', '1,1']) });
    expect(seats.size).toBe(12);
    expect(new Set([...seats.values()].map((cell) => `${cell.x},${cell.y}`)).size).toBe(12);
    expect([...seats.values()].every((cell) => cell.x >= 0 && cell.y >= 0)).toBe(true);
  });
});
