import { describe, expect, it } from 'vitest';
import { applyCommand, createMatchWorld, createSquad, createWorld, prepareCampaignSector, statsFor, stepWorld, type World } from '@impulso/sim';
import { viewFor } from './index.js';

describe('per-player visibility boundary', () => {
  it('omits unseen enemies, guardians, nodes and private server data', () => {
    const world = createWorld();
    world.players.p2.metal = 999;
    world.players.p2.lastSequence = 4321;
    world.players.p1.baseUpgrades = { damage: 1, capacity: 2 };
    world.players.p2.baseUpgrades = { damage: 3, capacity: 3 };
    const view = viewFor(world, 'p1');
    expect(view.squads.map((unit) => unit.id)).toEqual(['p1-interceptor']);
    expect(view.guardians).toEqual([]);
    expect(view.nodes).toEqual([]);
    expect(view.players.p1.metal).toBe(0);
    expect(view.players.p2).not.toHaveProperty('metal');
    expect(view.players.p2).not.toHaveProperty('baseUpgrades');
    expect(view.players.p1.baseUpgrades).toEqual({ damage: 1, capacity: 2 });
    view.players.p1.baseUpgrades!.capacity = 99;
    expect(world.players.p1.baseUpgrades.capacity).toBe(2);
    // A player sees only its own order sequence, never the rival's.
    expect(view.players.p2).not.toHaveProperty('lastSequence');
    expect(JSON.stringify(view)).not.toContain('4321');
    expect(JSON.stringify(view)).not.toContain('seed');
    expect(view.core.progress).toEqual({ p1: 0, p2: 0 });
  });
  it('reveals enemies in vision but never reveals their intended destination', () => {
    const world = createWorld();
    Object.assign(world.squads[1]!, { x: 3, y: 17, target: { x: 19, y: 19 }, attackTargetId: 'scout' });
    const view = viewFor(world, 'p1');
    expect(view.squads).toHaveLength(2);
    expect(view.squads[1]).not.toHaveProperty('target');
    expect(view.squads[1]).not.toHaveProperty('attackTargetId');
    expect(view.squads[0]).toHaveProperty('target', null);
    expect(view.squads[0]).toHaveProperty('attackTargetId', null);
  });
  it('returns detached snapshots and symmetric initial visible areas', () => {
    const world = createWorld();
    const view = viewFor(world, 'p1');
    view.core.progress.p1 = 80;
    view.rules.visionRadius = 99;
    view.squads[0]!.hp = 0;
    view.players.p1.base.x = 11;
    view.obstacles[0]!.x = 0;
    expect(world.core.progress.p1).toBe(0);
    expect(world.rules.visionRadius).toBe(4);
    expect(world.squads[0]!.hp).toBe(100);
    expect(world.players.p1.base.x).toBe(2);
    expect(world.obstacles[0]!.x).toBe(4);
    expect(viewFor(world, 'p1').visibleCells.length).toBe(viewFor(world, 'p2').visibleCells.length);
  });
  it('extends vision for an explorer without exposing rival orders', () => {
    const world = createWorld();
    world.squads.push(createSquad('scout', 'p1', 'explorer', { x: 4, y: 10 }));
    expect(viewFor(world, 'p1').visibleCells).toContainEqual({ x: 10, y: 10 });
  });
  it('shows the owner the stance and the remaining route', () => {
    const world = createWorld();
    world.squads[0]!.stance = 'guard';
    world.squads[0]!.anchor = { x: 2, y: 17 };
    world.squads[0]!.route = [{ x: 3, y: 17 }];
    const view = viewFor(world, 'p1');
    expect(view.squads[0]).toMatchObject({ stance: 'guard', anchor: { x: 2, y: 17 }, route: [{ x: 3, y: 17 }] });
    expect(view.squads[0]).not.toHaveProperty('gather');
  });
});

describe('campaign view fields', () => {
  it('tells only the owner its last accepted order sequence', () => {
    const world = createWorld();
    world.players.p1.lastSequence = 7;
    world.players.p2.lastSequence = 3;
    const own = viewFor(world, 'p1');
    expect(own.players.p1.lastSequence).toBe(7);
    expect(own.players.p2).not.toHaveProperty('lastSequence');
    expect(viewFor(world, 'p2').players.p2.lastSequence).toBe(3);
  });
  it('shows how many rerolls the current augment offer allows', () => {
    const world = createMatchWorld('sector-01', 'skirmish', 7);
    prepareCampaignSector(world, { choice: 1, carried: { p1: [], p2: [] }, extraRerolls: { p1: 1 } });
    expect(viewFor(world, 'p1').augments!.offer).toMatchObject({ rerolls: 0, rerollLimit: 2 });
    expect(viewFor(world, 'p2').augments!.offer).toMatchObject({ rerolls: 0, rerollLimit: 1 });
  });
});

/** A running Espiral match with no guardians in the way and no augment offers. */
function match(): World {
  const world = createMatchWorld('espiral', 'skirmish', 7);
  world.augmentMatch!.started = true;
  for (const player of ['p1', 'p2'] as const) {
    world.augmentMatch!.players[player].offer = null;
    world.augmentMatch!.players[player].nextChoice = 3;
  }
  world.players.p1.metal = 200;
  world.players.p2.metal = 200;
  return world;
}
const produce = (world: World, player: 'p1' | 'p2', seq: number, kind: 'explorer' | 'frigate') => {
  const result = applyCommand(world, player, { seq, type: 'produce', kind });
  expect(result.accepted).toBe(true);
  return result.world;
};

describe('hangar view', () => {
  it('shows the owner its ship in production and the paid orders behind it, and nothing of the rival hangar', () => {
    let world = produce(produce(produce(match(), 'p1', 1, 'frigate'), 'p1', 2, 'explorer'), 'p2', 1, 'frigate');
    world = stepWorld(stepWorld(world));
    const frigate = statsFor(world, 'p1', 'frigate');
    const own = viewFor(world, 'p1');
    expect(own.players.p1.production).toEqual({ kind: 'frigate', remainingTicks: frigate.buildTicks - 2, totalTicks: frigate.buildTicks, refund: frigate.cost });
    expect(own.players.p1.queue).toEqual([{ kind: 'explorer', refund: statsFor(world, 'p1', 'explorer').cost }]);
    expect(own.players.p2).not.toHaveProperty('production');
    expect(own.players.p2).not.toHaveProperty('queue');
    const rival = viewFor(world, 'p2');
    expect(rival.players.p2.queue).toEqual([]);
    expect(rival.players.p1).not.toHaveProperty('production');
    expect(rival.players.p1).not.toHaveProperty('queue');
  });
});

describe('core view', () => {
  /** The Core open, its guardian gone and only the given ships on the map. */
  function core(ships: [string, 'p1' | 'p2', number, number][], progress = { p1: 0, p2: 0 }): World {
    const world = match();
    world.guardians = world.guardians.filter((guardian) => guardian.objectiveId !== 'core');
    world.rules = { ...world.rules, coreOpenTick: 0 };
    world.squads = ships.map(([id, owner, dx, dy]) => createSquad(id, owner, 'interceptor', { x: world.core.x + dx, y: world.core.y + dy }, world));
    world.core.progress = { ...progress };
    return stepWorld(world);
  }

  it('carries the capture radius and stays locked until it opens', () => {
    const world = match();
    const view = viewFor(world, 'p1');
    expect(view.core.radius).toBe(2);
    expect(view.core).toMatchObject({ status: 'locked', captor: null, fraction: { p1: 0, p2: 0 }, remainingTicks: null });
  });

  it('names the side capturing it, how far it got and how long it still needs', () => {
    const world = core([['p1-a', 'p1', 1, 0]]);
    const view = viewFor(world, 'p1');
    const duration = world.rules.coreCaptureTicks;
    expect(view.core).toMatchObject({ status: 'capturing', captor: 'p1', remainingTicks: duration - 1 });
    expect(view.core.fraction!.p1).toBeCloseTo(1 / duration);
    expect(viewFor(world, 'p2').core).toMatchObject({ status: 'capturing', captor: 'p1' });
    expect(viewFor(core([]), 'p1').core).toMatchObject({ status: 'idle', captor: null, remainingTicks: null });
  });

  it('calls a frozen dispute contested even when one side is further along', () => {
    const world = core([['p1-a', 'p1', 1, 0], ['p2-a', 'p2', -1, 0]], { p1: 40, p2: 5 });
    expect(world.core.progress).toEqual({ p1: 40, p2: 5 });
    expect(viewFor(world, 'p1').core).toMatchObject({ status: 'contested', captor: null, remainingTicks: null });
  });

  it('hands the captor to the side that arrives once the other leaves', () => {
    const world = core([['p2-a', 'p2', 0, 1]], { p1: 60, p2: 0 });
    expect(viewFor(world, 'p1').core).toMatchObject({ status: 'capturing', captor: 'p2' });
    expect(world.core.progress.p1).toBeLessThan(60);
  });

  it('never reports a capture fraction above one, even in a sudden-death dispute', () => {
    const world = core([['p1-a', 'p1', 1, 0], ['p2-a', 'p2', -1, 0]], { p1: 200, p2: 0 });
    world.suddenDeath = true;
    const view = viewFor(world, 'p1');
    expect(view.coreFraction).toBeLessThanOrEqual(1);
    expect(view.core.fraction!.p1).toBeLessThanOrEqual(1);
    expect(view.core.fraction!.p1).toBeGreaterThan(0);
  });

  it('keeps an unseen Core guardian out of the view and never says whether it still stands', () => {
    const guarded = match();
    guarded.rules = { ...guarded.rules, coreOpenTick: 0 };
    guarded.squads = [createSquad('p2-a', 'p2', 'interceptor', { x: guarded.core.x + 1, y: guarded.core.y }, guarded)];
    const view = viewFor(stepWorld(guarded), 'p1');
    expect(view.guardians.some((guardian) => guardian.objectiveId === 'core')).toBe(false);
    expect(JSON.stringify(view)).not.toContain('guarded');
    expect(view.core).toMatchObject({ status: 'idle', captor: null });
  });
});

describe('view size', () => {
  // Rooms send this view to every player ten times a second. The client draws the terrain from
  // its own copy of the map, so repeating it only floods slow clients until the heartbeat drops them.
  it('leaves the static terrain out of the view a room sends every tick', () => {
    const view = viewFor(createMatchWorld('espiral', 'skirmish', 7), 'p1');
    expect(view).not.toHaveProperty('walkable');
    expect(view).not.toHaveProperty('level');
    expect(JSON.stringify(view).length).toBeLessThan(16_000);
  });
});
