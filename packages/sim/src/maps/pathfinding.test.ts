import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_MAP } from './battlefield.js';
import { findPath, type PathMap, type PathResult } from './pathfinding.js';
import type { MapCell } from './types.js';

function grid(width: number, height: number, blocked: readonly MapCell[] = []): PathMap {
  const walkable = Array<boolean>(width * height).fill(true);
  for (const cell of blocked) walkable[cell.y * width + cell.x] = false;
  return { width, height, walkable };
}

/** Independent breadth-first distance oracle for unit-cost four-neighbor maps. */
function bfsDistance(map: PathMap, start: MapCell, goal: MapCell): number | null {
  const queue = [start.y * map.width + start.x];
  const distance = new Int32Array(map.width * map.height).fill(-1);
  distance[queue[0]!] = 0;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]!;
    if (index === goal.y * map.width + goal.x) return distance[index]!;
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    const neighbors = [
      y > 0 ? index - map.width : -1,
      x + 1 < map.width ? index + 1 : -1,
      y + 1 < map.height ? index + map.width : -1,
      x > 0 ? index - 1 : -1,
    ];
    for (const next of neighbors) {
      if (next < 0 || map.walkable[next] !== true || distance[next] !== -1) continue;
      distance[next] = distance[index]! + 1;
      queue.push(next);
    }
  }
  return null;
}

function expectValidPath(map: PathMap, start: MapCell, goal: MapCell, result: PathResult): void {
  expect(result.status).toBe('found');
  if (result.status !== 'found') return;
  let previous = start;
  for (const cell of result.path) {
    expect(Math.abs(cell.x - previous.x) + Math.abs(cell.y - previous.y)).toBe(1);
    expect(map.walkable[cell.y * map.width + cell.x]).toBe(true);
    previous = cell;
  }
  expect(previous).toEqual(goal);
}

describe('deterministic static-terrain pathfinding', () => {
  it('chooses the documented row-major tie-break on an open grid', () => {
    expect(findPath(grid(3, 3), { x: 0, y: 0 }, { x: 2, y: 2 })).toMatchObject({
      status: 'found',
      path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    });
  });

  it('finds shortest routes through a chokepoint with stable tie-breaking', () => {
    const map = grid(7, 7, Array.from({ length: 7 }, (_, y) => ({ x: 3, y })).filter((cell) => cell.y !== 4));
    const start = { x: 1, y: 1 };
    const goal = { x: 5, y: 1 };
    const first = findPath(map, start, goal);
    expectValidPath(map, start, goal, first);
    if (first.status !== 'found') return;
    expect(first.path.length).toBe(bfsDistance(map, start, goal));
    expect(first.path).toContainEqual({ x: 3, y: 4 });
    expect(findPath(map, start, goal)).toEqual(first);
    expect(first.expansions).toBeGreaterThan(0);
    expect(first.expansions).toBeLessThanOrEqual(map.width * map.height);
  });

  it('matches BFS across fixed seeded obstacle fields', () => {
    let seed = 0x51e1e;
    const next = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let fixture = 0; fixture < 24; fixture++) {
      const map = grid(16, 16);
      const mask = [...map.walkable];
      for (let index = 0; index < mask.length; index++) mask[index] = next() % 5 !== 0;
      mask[0] = true;
      mask[255] = true;
      const candidate = { ...map, walkable: mask };
      const start = { x: 0, y: 0 };
      const goal = { x: 15, y: 15 };
      const shortest = bfsDistance(candidate, start, goal);
      const result = findPath(candidate, start, goal);
      expect(result.expansions).toBeLessThanOrEqual(256);
      if (shortest === null) expect(result.status).toBe('unreachable');
      else {
        expectValidPath(candidate, start, goal, result);
        if (result.status === 'found') expect(result.path.length).toBe(shortest);
      }
    }
  });

  it('reports blocked, invalid and same-cell cases without consuming expansions', () => {
    const map = grid(3, 3, [{ x: 1, y: 1 }]);
    const start = { x: 0, y: 0 };
    expect(findPath(map, start, { x: 1, y: 1 })).toEqual({ status: 'blocked', expansions: 0 });
    expect(findPath(map, { x: 1, y: 1 }, start)).toEqual({ status: 'blocked', expansions: 0 });
    expect(findPath(map, start, start, { maxExpansions: 0 })).toEqual({ status: 'found', path: [], expansions: 0 });
    for (const goal of [{ x: -1, y: 0 }, { x: 3, y: 0 }, { x: 0.5, y: 0 }]) {
      expect(findPath(map, start, goal)).toEqual({ status: 'invalid', expansions: 0 });
    }
    for (const maxExpansions of [-1, 0.5, NaN, Infinity]) {
      expect(findPath(map, start, { x: 2, y: 2 }, { maxExpansions })).toEqual({ status: 'invalid', expansions: 0 });
    }
    expect(findPath({ ...map, walkable: [true] }, start, { x: 2, y: 2 })).toEqual({ status: 'invalid', expansions: 0 });
  });

  it('honors zero and exact expansion budgets, including failed searches', () => {
    const map = grid(5, 5);
    const start = { x: 0, y: 0 };
    const goal = { x: 4, y: 4 };
    const full = findPath(map, start, goal);
    expect(full.status).toBe('found');
    expect(findPath(map, start, goal, { maxExpansions: 0 })).toEqual({ status: 'budget_exceeded', expansions: 0 });
    expect(findPath(map, start, goal, { maxExpansions: full.expansions })).toEqual(full);
    expect(findPath(map, start, goal, { maxExpansions: full.expansions - 1 })).toEqual({
      status: 'budget_exceeded', expansions: full.expansions - 1,
    });
    const sealed = grid(5, 5, Array.from({ length: 5 }, (_, y) => ({ x: 2, y })));
    const failed = findPath(sealed, start, goal);
    expect(failed.status).toBe('unreachable');
    expect(findPath(sealed, start, goal, { maxExpansions: failed.expansions })).toEqual(failed);
    expect(findPath(sealed, start, goal, { maxExpansions: failed.expansions - 1 })).toEqual({
      status: 'budget_exceeded', expansions: failed.expansions - 1,
    });
  });

  it('does not mutate the map or inputs and caps large requested budgets at map cells', () => {
    const map = Object.freeze({ width: 4, height: 4, walkable: Object.freeze(Array<boolean>(16).fill(true)) });
    const start = Object.freeze({ x: 0, y: 0 });
    const goal = Object.freeze({ x: 3, y: 3 });
    const snapshot = JSON.stringify(map);
    const first = findPath(map, start, goal, { maxExpansions: 1_000_000 });
    expectValidPath(map, start, goal, first);
    expect(first.expansions).toBeLessThanOrEqual(16);
    expect(JSON.stringify(map)).toBe(snapshot);
    expect(findPath(map, start, goal, { maxExpansions: 1_000_000 })).toEqual(first);
  });

  it('handles the open 72 by 72 preset within the cell budget', () => {
    const start = BATTLEFIELD_MAP.bases.p1;
    const goal = BATTLEFIELD_MAP.bases.p2;
    const began = performance.now();
    const result = findPath(BATTLEFIELD_MAP, start, goal);
    const elapsedMs = performance.now() - began;
    expectValidPath(BATTLEFIELD_MAP, start, goal, result);
    if (result.status === 'found') expect(result.path.length).toBe(110);
    expect(result.expansions).toBeLessThanOrEqual(72 * 72);
    console.info(`pathfinding 72x72 open: ${result.expansions} expansions, ${elapsedMs.toFixed(2)} ms`);
  });
});
