import { describe, expect, it } from 'vitest';
import * as simulation from '../../../src/index.js';
import { applyCommand, DURATION_MODES, findTiledPath, stepWorld, TRAINING_MAPS, type World } from '../../../src/index.js';
import type { SectorLeido } from '../../../src/mapas/leer-tiled.js';

const maps = TRAINING_MAPS as Record<string, SectorLeido>;
const mirror = (cell: { x: number; y: number }, width: number) => ({ x: width - 1 - cell.x, y: cell.y });

describe('movement laboratory map', () => {
  it('defines a compact, horizontally mirrored practice layout', () => {
    const map = maps['movement-lab'];
    expect(map).toBeDefined();
    if (!map) return;

    expect([map.width, map.height]).toEqual([31, 31]);
    expect(map.bases).toEqual({ p1: { x: 3, y: 15 }, p2: { x: 27, y: 15 } });
    expect(map.core).toMatchObject({ x: 15, y: 15 });
    expect(map.metals).toHaveLength(2);
    expect(map.captures).toHaveLength(2);
    for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) {
      expect(map.walkable[y * map.width + x], `walkability at ${x},${y}`).toBe(map.walkable[y * map.width + map.width - 1 - x]);
    }
    expect(map.bases.p2).toEqual(mirror(map.bases.p1, map.width));
    for (const goals of [map.metals, map.captures]) {
      expect(new Set(goals.map((cell) => `${cell.x},${cell.y}`)))
        .toEqual(new Set(goals.map((cell) => mirror(cell, map.width)).map((cell) => `${cell.x},${cell.y}`)));
    }
  });

  it('keeps narrow gates, a wide crossing, and detour rocks connected from both starts', () => {
    const map = maps['movement-lab'];
    expect(map).toBeDefined();
    if (!map) return;
    const open = (x: number, y: number) => map.walkable[y * map.width + x];

    expect(open(14, 7)).toBe(false);
    expect(open(14, 8)).toBe(true);
    expect(open(14, 9)).toBe(false);
    for (const y of [14, 15, 16]) for (const x of [14, 15, 16]) expect(open(x, y)).toBe(true);
    expect(open(14, 22)).toBe(true);
    expect(open(14, 23)).toBe(false);
    expect(open(8, 15)).toBe(false);
    expect(open(22, 15)).toBe(false);

    for (const goal of [map.core, ...map.metals, ...map.captures]) {
      const p1 = findTiledPath(map, map.bases.p1, goal);
      const p2 = findTiledPath(map, map.bases.p2, mirror(goal, map.width));
      expect(p1.status).toBe('found');
      expect(p2.status).toBe('found');
      if (p1.status === 'found' && p2.status === 'found') expect(p1.path.length).toBe(p2.path.length);
    }
  });

  it('constructs a world on the movement laboratory map', () => {
    const createMovementSandboxWorld = (simulation as unknown as {
      createMovementSandboxWorld?: () => World;
    }).createMovementSandboxWorld;
    expect(createMovementSandboxWorld).toBeTypeOf('function');
    if (!createMovementSandboxWorld) return;
    const world = createMovementSandboxWorld();
    expect([world.width, world.height]).toEqual([31, 31]);
  });

  it('starts without an economy or Metal balance', () => {
    const world = simulation.createMovementSandboxWorld();
    expect(world.economy).toBe(false);
    expect([world.players.p1.metal, world.players.p2.metal]).toEqual([0, 0]);
  });

  it('starts without neutral guardians', () => {
    expect(simulation.createMovementSandboxWorld().guardians).toEqual([]);
  });

  it('starts without capture or resource objectives', () => {
    expect(simulation.createMovementSandboxWorld().nodes).toEqual([]);
  });

  it('rejects combat orders in the movement sandbox', () => {
    const world = simulation.createMovementSandboxWorld();
    const result = applyCommand(world, 'p1', {
      seq: 1, type: 'attack', squadId: 'p1-interceptor', targetId: 'p2-interceptor',
    });
    expect(result).toMatchObject({ accepted: false, reason: 'invalid_command' });
  });

  it('rejects fleet-management orders in the movement sandbox', () => {
    const result = applyCommand(simulation.createMovementSandboxWorld(), 'p1', {
      seq: 1, type: 'disband', squadIds: ['p1-interceptor'],
    });
    expect(result).toMatchObject({ accepted: false, reason: 'invalid_command' });
  });

  it('keeps the core locked as simulation ticks pass', () => {
    let world = simulation.createMovementSandboxWorld();
    world.rules = { ...world.rules, coreOpenTick: 1, coreCaptureTicks: 1 };
    world.squads = world.squads.map((squad, index) => index === 0
      ? { ...squad, x: world.core.x, y: world.core.y, route: [], target: null, attackTargetId: null }
      : squad);
    for (let tick = 0; tick < 10; tick += 1) world = stepWorld(world);
    expect(world.core.open).toBe(false);
  });

  it('does not start sudden death at the match duration limit', () => {
    const world = simulation.createMovementSandboxWorld();
    world.duration = 'skirmish';
    world.tick = DURATION_MODES.skirmish.suddenDeathTick - 1;
    expect(stepWorld(world).suddenDeath).toBeUndefined();
  });

  it('does not resolve combat during movement-only ticks', () => {
    const world = simulation.createMovementSandboxWorld();
    const attacker = world.squads.find((squad) => squad.id === 'p1-interceptor')!;
    const target = world.squads.find((squad) => squad.id === 'p2-interceptor')!;
    attacker.x = world.core.x;
    attacker.y = world.core.y;
    attacker.attackTargetId = target.id;
    attacker.nextAttackTick = 0;
    target.x = attacker.x + 1;
    target.y = attacker.y;
    const originalHp = target.hp;
    expect(stepWorld(world).squads.find((squad) => squad.id === target.id)?.hp).toBe(originalHp);
  });

  it('moves a squad through the map around an obstruction', () => {
    const initial = simulation.createMovementSandboxWorld();
    const ship = initial.squads.find((squad) => squad.id === 'p1-interceptor')!;
    const order = applyCommand(initial, 'p1', {
      seq: 1, type: 'move', squadId: ship.id, x: 10, y: 15,
    });
    expect(order.accepted).toBe(true);
    if (!order.accepted) return;

    let world = order.world;
    for (let tick = 0; tick < 400; tick += 1) {
      const current = world.squads.find((squad) => squad.id === ship.id)!;
      if (current.x === 10 && current.y === 15) break;
      world = stepWorld(world);
    }
    const moved = world.squads.find((squad) => squad.id === ship.id)!;
    expect({ x: moved.x, y: moved.y }).toEqual({ x: 10, y: 15 });
  });
});
