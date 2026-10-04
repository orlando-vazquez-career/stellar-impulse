import { describe, expect, it } from 'vitest';
import {
  applyCommand, BUILD_TICKS, createSectorWorld, createWorld, FLEET_CAP, runTrainingRival, stepWorld,
  STARTING_METAL, UNIT_COSTS, type AiMemory, type World,
  fleetCapacity, baseDamage, baseUpgradeCost, createSquad,
} from './index.js';

const produce = (seq: number, kind: 'interceptor' | 'frigate' | 'bomber' | 'explorer') => ({ seq, type: 'produce', kind });
const run = (world: World, ticks: number) => {
  let next = world;
  for (let tick = 0; tick < ticks; tick += 1) next = stepWorld(next);
  return next;
};

describe('sector economy', () => {
  it('retires a selected owned ship immediately, frees housing and keeps its Metal spent', () => {
    let world = createSectorWorld();
    world.players.p1.metal = 100;
    while (world.squads.filter((unit) => unit.ownerId === 'p1').length < FLEET_CAP)
      world.squads.push(createSquad(`p1-extra-${world.squads.length}`, 'p1', 'explorer', { x: 3, y: 3 }));
    expect(applyCommand(world, 'p1', produce(1, 'explorer'))).toMatchObject({ accepted: false, reason: 'fleet_full' });
    const retired = applyCommand(world, 'p1', { seq: 1, type: 'disband', squadIds: ['p1-explorer'] });
    expect(retired.accepted).toBe(true);
    expect(retired.world.squads.find((unit) => unit.id === 'p1-explorer'))
      .toMatchObject({ hp: 0, target: null, route: [], attackTargetId: null });
    expect(retired.world.players.p1.metal).toBe(100);
    expect(world.squads.find((unit) => unit.id === 'p1-explorer')!.hp).toBeGreaterThan(0);
    expect(applyCommand(retired.world, 'p1', produce(2, 'explorer')).accepted).toBe(true);
    expect(applyCommand(retired.world, 'p1', { seq: 2, type: 'disband', squadIds: ['p1-explorer'] }))
      .toMatchObject({ accepted: false, reason: 'squad_destroyed' });
  });

  it('rejects retiring another playerâ€™s ship atomically and rejects stale orders', () => {
    const world = createSectorWorld();
    const refused = applyCommand(world, 'p1', { seq: 1, type: 'disband', squadIds: ['p1-explorer', 'p2-explorer'] });
    expect(refused).toMatchObject({ accepted: false, reason: 'not_owner' });
    expect(refused.world).toBe(world);
    expect(world.players.p1.lastSequence).toBe(0);
    const accepted = applyCommand(world, 'p1', { seq: 1, type: 'disband', squadIds: ['p1-explorer', 'p1-interceptor'] });
    expect(accepted.world.squads.filter((unit) => unit.ownerId === 'p1' && unit.hp > 0)).toHaveLength(0);
    expect(applyCommand(accepted.world, 'p1', { seq: 1, type: 'disband', squadIds: ['p1-interceptor'] }))
      .toMatchObject({ accepted: false, reason: 'stale_sequence' });
  });

  it('charges escalating costs for capacity, permits production over the old cap and enforces the upgrade limit', () => {
    let world = createSectorWorld();
    expect(applyCommand(world, 'p1', { seq: 1, type: 'upgrade_base', upgrade: 'capacity' }))
      .toMatchObject({ accepted: false, reason: 'insufficient_metal' });
    expect(world.players.p1.lastSequence).toBe(0);
    world.players.p1.metal = 100;
    for (let level = 1; level <= 3; level++) {
      const before = world;
      world = applyCommand(world, 'p1', { seq: level, type: 'upgrade_base', upgrade: 'capacity' }).world;
      expect(before.players.p1.baseUpgrades?.capacity ?? 0).toBe(level - 1);
      expect(fleetCapacity(world.players.p1.baseUpgrades)).toBe(12 + level * 4);
    }
    expect(world.players.p1.metal).toBe(40);
    expect(baseUpgradeCost('capacity', world.players.p1.baseUpgrades)).toBeNull();
    expect(applyCommand(world, 'p1', { seq: 4, type: 'upgrade_base', upgrade: 'capacity' }))
      .toMatchObject({ accepted: false, reason: 'upgrade_maxed', world });
    while (world.squads.filter((unit) => unit.ownerId === 'p1').length < FLEET_CAP)
      world.squads.push(createSquad(`extra-${world.squads.length}`, 'p1', 'explorer', { x: 3, y: 3 }));
    expect(applyCommand(world, 'p1', produce(4, 'explorer')).accepted).toBe(true);
  });

  it('arms the base and increases actual damage while leaving allies and distant enemies untouched', () => {
    const world = createSectorWorld();
    world.players.p1.metal = 100;
    const upgraded = applyCommand(world, 'p1', { seq: 1, type: 'upgrade_base', upgrade: 'damage' }).world;
    expect(upgraded.players.p1.metal).toBe(88);
    expect(baseDamage(upgraded.players.p1.baseUpgrades)).toBe(10);
    expect(baseDamage(world.players.p1.baseUpgrades)).toBe(0);
    const second = applyCommand(upgraded, 'p1', { seq: 2, type: 'upgrade_base', upgrade: 'damage' }).world;
    expect(second.players.p1.metal).toBe(64);
    second.guardians = [];
    const base = second.players.p1.base;
    const near = createSquad('near', 'p2', 'interceptor', { x: base.x + 3, y: base.y });
    const far = createSquad('far', 'p2', 'interceptor', { x: base.x + 5, y: base.y });
    const ally = createSquad('ally', 'p1', 'explorer', { x: base.x, y: base.y + 3 });
    second.squads = [near, far, ally];
    second.tick = second.rules.attackEveryTicks - 1;
    const fired = stepWorld(second);
    expect(fired.squads.find((unit) => unit.id === 'near')!.hp).toBe(81);
    expect(fired.squads.find((unit) => unit.id === 'far')!.hp).toBe(100);
    expect(fired.squads.find((unit) => unit.id === 'ally')!.hp).toBe(50);
    expect(near.hp).toBe(100);
  });
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
    // The sector now travels at 6 ticks/cell instead of 4: allow the same travel budget.
    expect(rivalNodes(play('hard', 300))).toBeGreaterThan(rivalNodes(play('medium', 300)));
  });
});
