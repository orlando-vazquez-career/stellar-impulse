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
  it('starts each side with a scout and one combat ship, guarded nodes and opening Metal', () => {
    const world = createSectorWorld();
    for (const player of ['p1', 'p2'] as const) {
      expect(world.squads.filter((squad) => squad.ownerId === player).map((squad) => squad.kind).sort())
        .toEqual(['explorer', 'interceptor']);
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
    expect(before.squads.filter((squad) => squad.ownerId === 'p1')).toHaveLength(2);
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

describe('guardians', () => {
  it('charge a ship inside their zone and return to their post afterwards', () => {
    let world = createSectorWorld();
    const guardian = world.guardians.find((unit) => unit.objectiveId === 'metal-3')!;
    const post = { x: guardian.x, y: guardian.y };
    const ship = world.squads.find((squad) => squad.id === 'p1-interceptor')!;
    // Park the ship three cells from the post along the walkable corridor.
    const cell = [...Array(world.width * world.height).keys()]
      .map((index) => ({ x: index % world.width, y: Math.floor(index / world.width) }))
      .find((candidate) => world.surface!.walkable[candidate.y * world.width + candidate.x]
        && Math.abs(candidate.x - post.x) + Math.abs(candidate.y - post.y) === 3)!;
    ship.x = cell.x;
    ship.y = cell.y;
    world = run(world, 30);
    const moved = world.guardians.find((unit) => unit.id === guardian.id)!;
    expect(Math.abs(moved.x - post.x) + Math.abs(moved.y - post.y)).toBeGreaterThan(0);
    world.squads = world.squads.filter((squad) => squad.id !== 'p1-interceptor');
    world = run(world, 60);
    expect(world.guardians.find((unit) => unit.id === guardian.id)).toMatchObject(post);
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

describe('rival difficulty', () => {
  const play = (difficulty: 'easy' | 'medium' | 'hard', ticks: number) => {
    let world = createSectorWorld();
    // The idle human already holds two Metal nodes, so raids have a target.
    world.guardians = world.guardians.filter((guardian) => guardian.objectiveId !== 'metal-1' && guardian.objectiveId !== 'metal-2');
    for (const node of world.nodes) if (node.id === 'metal-1' || node.id === 'metal-2') node.ownerId = 'p1';
    let memories: ReadonlyMap<string, AiMemory> = new Map();
    for (let tick = 0; tick < ticks; tick += 1) {
      const rival = runTrainingRival(world, memories, difficulty);
      memories = rival.memories;
      world = stepWorld(rival.world);
    }
    return world;
  };
  const rivalShips = (world: World) => world.squads.filter((squad) => squad.ownerId === 'p2' && squad.hp > 0).length;
  const rivalNodes = (world: World) => world.nodes.filter((node) => node.kind === 'metal' && node.ownerId === 'p2').length;

  it('keeps the easy rival small, slow and away from the player nodes', () => {
    const world = play('easy', 900);
    expect(rivalShips(world)).toBeLessThanOrEqual(6);
    expect(world.nodes.filter((node) => node.ownerId === 'p1' && node.kind === 'metal')).toHaveLength(2);
  });

  it('lets harder rivals build more and expand faster', () => {
    expect(rivalShips(play('medium', 600))).toBeGreaterThan(rivalShips(play('easy', 600)));
    expect(rivalNodes(play('hard', 200))).toBeGreaterThan(rivalNodes(play('medium', 200)));
  });
});
