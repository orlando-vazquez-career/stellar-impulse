import { describe, expect, it } from 'vitest';
import { createSquad, createWorld, type PlayerId, type ResourceNode, type World } from '../index.js';
import { advanceCapture } from './mechanics.js';

const REQUIRED = 30;
/** A cleared node at (10, 10) with the given capture area and ships placed by hand. */
function scene(radius: number | undefined, ships: [PlayerId, number, number][]): { world: World; node: ResourceNode } {
  const world = createWorld();
  const node: ResourceNode = { id: 'n', kind: 'capture', guardianId: 'none', ownerId: null, x: 10, y: 10,
    progress: { p1: 0, p2: 0 }, ...(radius !== undefined ? { radius } : {}) };
  world.nodes = [node];
  world.squads = ships.map(([owner, x, y], index) => createSquad(`${owner}-${index}`, owner, 'interceptor', { x, y }));
  return { world, node };
}
const run = (world: World, node: ResourceNode, count: number): PlayerId | null => {
  let captor: PlayerId | null = null;
  for (let tick = 0; tick < count; tick += 1) captor = advanceCapture(world, node, REQUIRED);
  return captor;
};

describe('capture area', () => {
  it('captures from anywhere inside the disc of the node radius, and not from outside', () => {
    for (const [x, y, inside] of [[13, 10, true], [12, 12, true], [10, 7, true], [13, 11, false], [14, 10, false]] as const) {
      const { world, node } = scene(3, [['p1', x, y]]);
      run(world, node, 1);
      expect(node.progress.p1).toBe(inside ? 1 : 0);
    }
  });
  it('falls back to the rules radius when the node sets none', () => {
    const near = scene(undefined, [['p1', 11, 10]]);
    run(near.world, near.node, 1);
    expect(near.node.progress.p1).toBe(1);
    const far = scene(undefined, [['p1', 12, 10]]);
    run(far.world, far.node, 1);
    expect(far.node.progress.p1).toBe(0);
  });
});

describe('capture pace', () => {
  it('speeds up with the second and third ship and no further', () => {
    const pace = (count: number) => {
      const { world, node } = scene(3, Array.from({ length: count }, (_, index) => ['p1', 8 + index, 10] as [PlayerId, number, number]));
      run(world, node, 4);
      return node.progress.p1;
    };
    expect([1, 2, 3, 4].map(pace)).toEqual([4, 6, 8, 8]);
  });
  it('captures in half the time with three ships', () => {
    const { world, node } = scene(3, [['p1', 9, 10], ['p1', 10, 10], ['p1', 11, 10]]);
    expect(run(world, node, REQUIRED / 2 - 1)).toBeNull();
    expect(run(world, node, 1)).toBe('p1');
  });
  it('lets the larger side advance slowly and pushes the smaller one back', () => {
    const { world, node } = scene(3, [['p1', 9, 10], ['p1', 10, 10], ['p2', 11, 10]]);
    node.progress = { p1: 0, p2: 10 };
    run(world, node, 4);
    expect(node.progress).toEqual({ p1: 2, p2: 8 });
  });
  it('freezes an even dispute', () => {
    const { world, node } = scene(3, [['p1', 9, 10], ['p2', 11, 10]]);
    node.progress = { p1: 5, p2: 7 };
    expect(run(world, node, 10)).toBeNull();
    expect(node.progress).toEqual({ p1: 5, p2: 7 });
  });
  it('never hands the node to an outnumbered side that already filled its progress', () => {
    const { world, node } = scene(3, [['p1', 9, 10], ['p2', 10, 10], ['p2', 11, 10]]);
    node.progress = { p1: REQUIRED, p2: 0 };
    expect(run(world, node, 1)).toBeNull();
    expect(run(world, node, REQUIRED * 2 - 1)).toBe('p2');
    expect(node.progress.p1).toBe(0);
  });
  it('keeps the core at one pace and frozen in any dispute', () => {
    const { world } = scene(3, [['p1', 9, 10], ['p1', 10, 10], ['p1', 10, 11]]);
    world.guardians = [];
    Object.assign(world.core, { x: 10, y: 10 });
    advanceCapture(world, world.core, REQUIRED);
    expect(world.core.progress.p1).toBe(1);
    world.squads.push(createSquad('rival', 'p2', 'interceptor', { x: 11, y: 10 }));
    advanceCapture(world, world.core, REQUIRED);
    expect(world.core.progress).toEqual({ p1: 1, p2: 0 });
  });
});
