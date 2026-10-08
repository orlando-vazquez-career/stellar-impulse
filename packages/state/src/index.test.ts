import { describe, expect, it } from 'vitest';
import { createMatchWorld, createSquad, createWorld, prepareCampaignSector } from '@impulso/sim';
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
