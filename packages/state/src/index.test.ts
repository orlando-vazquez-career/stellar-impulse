import { describe, expect, it } from 'vitest';
import { createWorld } from '@impulso/sim';
import { viewFor } from './index.js';

describe('per-player visibility boundary', () => {
  it('omits unseen enemies, guardians, nodes and private server data', () => {
    const world = createWorld();
    world.players.p2.metal = 999;
    world.players.p2.lastSequence = 4321;
    const view = viewFor(world, 'p1');
    expect(view.squads.map((unit) => unit.id)).toEqual(['p1-interceptor']);
    expect(view.guardians).toEqual([]);
    expect(view.nodes).toEqual([]);
    expect(view.players.p1.metal).toBe(0);
    expect(view.players.p2).not.toHaveProperty('metal');
    expect(JSON.stringify(view)).not.toContain('lastSequence');
    expect(JSON.stringify(view)).not.toContain('seed');
    expect(view.core.progress).toEqual({ p1: 0, p2: 0 });
  });
  it('reveals enemies in vision but never reveals their intended destination', () => {
    const world = createWorld();
    Object.assign(world.squads[1]!, { x: 2, y: 10, target: { x: 11, y: 11 } });
    const view = viewFor(world, 'p1');
    expect(view.squads).toHaveLength(2);
    expect(view.squads[1]).not.toHaveProperty('target');
    expect(view.squads[0]).toHaveProperty('target', null);
  });
  it('returns detached snapshots and symmetric initial visible areas', () => {
    const world = createWorld();
    const view = viewFor(world, 'p1');
    view.core.progress.p1 = 80;
    view.rules.visionRadius = 99;
    view.squads[0]!.hp = 0;
    view.players.p1.base.x = 11;
    expect(world.core.progress.p1).toBe(0);
    expect(world.rules.visionRadius).toBe(4);
    expect(world.squads[0]!.hp).toBe(120);
    expect(world.players.p1.base.x).toBe(1);
    expect(viewFor(world, 'p1').visibleCells.length).toBe(viewFor(world, 'p2').visibleCells.length);
  });
});
