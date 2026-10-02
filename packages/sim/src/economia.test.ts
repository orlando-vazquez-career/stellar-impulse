import { describe, expect, it } from 'vitest';
import {
  applyCommand, BUILD_TICKS, createSectorWorld, createWorld, FLEET_CAP, runTrainingRival, stepWorld,
  STARTING_METAL, UNIT_COSTS, type AiMemory, type World,
} from './index.js';

const produce = (seq: number, kind: 'interceptor' | 'frigate' | 'bomber' | 'explorer') => ({ seq, type: 'produce', kind });
const run = (world: World, ticks: number) => {
  let next = world;
  for (let tick = 0; tick < ticks; tick += 1) next = stepWorld(next);
  return next;
};

describe('sector economy', () => {
  it('starts each side with one ship of every class, guarded nodes and opening Metal', () => {
    const world = createSectorWorld();
    for (const player of ['p1', 'p2'] as const) {
      expect(world.squads.filter((squad) => squad.ownerId === player).map((squad) => squad.kind).sort())
        .toEqual(['bomber', 'explorer', 'frigate', 'interceptor']);
      expect(world.players[player].metal).toBe(STARTING_METAL);
    }
    expect(world.guardians.filter((guardian) => guardian.objectiveId.startsWith('metal-'))).toHaveLength(6);
    expect(world.guardians.some((guardian) => guardian.id === world.core.guardianId)).toBe(true);
  });

  it('charges Metal, builds for the listed ticks and launches the ship beside the base', () => {
    const world = createSectorWorld();
    const ordered = applyCommand(world, 'p1', produce(1, 'interceptor'));
    expect(ordered.accepted).toBe(true);
    expect(ordered.world.players.p1.metal).toBe(STARTING_METAL - UNIT_COSTS.interceptor);
    expect(applyCommand(ordered.world, 'p1', produce(2, 'explorer'))).toMatchObject({ accepted: false, reason: 'production_busy' });
    const before = run(ordered.world, BUILD_TICKS.interceptor - 1);
    expect(before.squads.filter((squad) => squad.ownerId === 'p1')).toHaveLength(4);
    const launched = stepWorld(before);
    const ship = launched.squads.find((squad) => squad.id === 'p1-interceptor-1');
    expect(ship).toBeDefined();
    expect(Math.max(Math.abs(ship!.x - launched.players.p1.base.x), Math.abs(ship!.y - launched.players.p1.base.y))).toBeLessThanOrEqual(4);
    expect(launched.production.p1).toBeNull();
  });

  it('refuses ships it cannot pay for or house, and stays off in the legacy drill', () => {
    const world = createSectorWorld();
    expect(applyCommand(world, 'p1', produce(1, 'bomber'))).toMatchObject({ accepted: false, reason: 'insufficient_metal' });
    const crowded = createSectorWorld();
    crowded.players.p1.metal = 999;
    while (crowded.squads.filter((squad) => squad.ownerId === 'p1').length < FLEET_CAP) {
      crowded.squads.push({ ...crowded.squads[0]!, id: `p1-extra-${crowded.squads.length}` });
    }
    expect(applyCommand(crowded, 'p1', produce(1, 'explorer'))).toMatchObject({ accepted: false, reason: 'fleet_full' });
    expect(applyCommand(createWorld(), 'p1', produce(1, 'explorer'))).toMatchObject({ accepted: false, reason: 'invalid_command' });
  });

  it('pays base income and repairs ships parked at home', () => {
    const world = createSectorWorld();
    const damaged = world.squads.find((squad) => squad.id === 'p1-interceptor')!;
    damaged.hp = 50;
    world.guardians = [];
    const later = run(world, 40);
    expect(later.players.p1.metal).toBe(STARTING_METAL + 2);
    expect(later.squads.find((squad) => squad.id === 'p1-interceptor')!.hp).toBeGreaterThan(50);
  });
});

describe('training rival', () => {
  it('builds, takes Metal nodes and wins the core against an idle opponent', () => {
    let world = createSectorWorld();
    let memories: ReadonlyMap<string, AiMemory> = new Map();
    for (let tick = 0; tick < 3000 && world.winner === null; tick += 1) {
      const rival = runTrainingRival(world, memories);
      memories = rival.memories;
      world = stepWorld(rival.world);
    }
    expect(world.built.p2).toBeGreaterThan(0);
    expect(world.nodes.filter((node) => node.kind === 'metal' && node.ownerId === 'p2').length).toBeGreaterThanOrEqual(3);
    expect(world.winner).toBe('p2');
  });
});
