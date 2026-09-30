import { describe, expect, it } from 'vitest';
import type { MapSpec } from './types.js';
import { computeVisibility, MAX_VISIBILITY_RADIUS, unionExplored } from './visibility.js';

type VisionMap = Pick<MapSpec, 'width' | 'height' | 'opaque'>;

function mapOf(...rows: string[]): VisionMap {
  const width = rows[0]?.length ?? 0;
  if (rows.some((row) => row.length !== width)) throw new Error('Uneven fixture');
  return { width, height: rows.length, opaque: [...rows.join('')].map((cell) => cell === '#') };
}

const at = (mask: readonly boolean[], map: VisionMap, x: number, y: number): boolean => mask[y * map.width + x] === true;

describe('symmetric battlefield visibility', () => {
  it('uses Manhattan radius and clips at map borders', () => {
    const map = mapOf('.....', '.....', '.....', '.....', '.....');
    const mask = computeVisibility(map, [{ x: 0, y: 0 }], 2);
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) expect(at(mask, map, x, y)).toBe(x + y <= 2);
    }
    expect(computeVisibility(map, [{ x: 2, y: 2 }], 0).filter(Boolean)).toHaveLength(1);
    expect(() => computeVisibility(map, [{ x: 0, y: 0 }], MAX_VISIBILITY_RADIUS + 1)).toThrow();
    expect(() => computeVisibility(map, [{ x: -1, y: 0 }], 1)).toThrow();
  });

  it('shows a wall but hides cells directly behind it', () => {
    const map = mapOf('.......', '.......', '...#...', '.......', '.......');
    const mask = computeVisibility(map, [{ x: 1, y: 2 }], 6);
    expect(at(mask, map, 3, 2)).toBe(true);
    expect(at(mask, map, 4, 2)).toBe(false);
    expect(at(mask, map, 5, 2)).toBe(false);
    expect(at(mask, map, 4, 0)).toBe(true);
  });

  it('uses permissive diamond-wall corners and never casts from an opaque source', () => {
    const map = mapOf('.#.', '#..', '...');
    const mask = computeVisibility(map, [{ x: 0, y: 0 }], 4);
    expect(at(mask, map, 1, 0)).toBe(true);
    expect(at(mask, map, 0, 1)).toBe(true);
    expect(at(mask, map, 1, 1)).toBe(true);
    const opaqueSource = computeVisibility(map, [{ x: 1, y: 0 }], 4);
    expect(opaqueSource.filter(Boolean)).toHaveLength(1);
    expect(at(opaqueSource, map, 1, 0)).toBe(true);
  });

  it('is reciprocal between non-opaque cells across pillars, corners and gaps', () => {
    let seed = 0x7461736b;
    const generated = Array.from({ length: 4 }, () => {
      const rows = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed % 5 === 0 ? '#' : '.';
      }).join(''));
      return mapOf(...rows);
    });
    const fixtures = [
      mapOf('.......', '.......', '.......', '.......', '.......', '.......', '.......'),
      mapOf('.......', '..#.#..', '..#.#..', '.......', '..#.#..', '..#.#..', '.......'),
      mapOf('.......', '.##....', '.#.....', '...#...', '.....#.', '....##.', '.......'),
      mapOf('.......', '...#...', '...#...', '.......', '...#...', '...#...', '.......'),
      ...generated,
    ];
    for (const map of fixtures) {
      const floors = Array.from({ length: map.width * map.height }, (_, index) => index).filter((index) => !map.opaque[index]);
      const views = floors.map((index) => computeVisibility(map, [{ x: index % map.width, y: Math.floor(index / map.width) }], 12));
      for (let a = 0; a < floors.length; a += 1) {
        for (let b = 0; b < floors.length; b += 1) {
          expect(views[a]![floors[b]!], `fixture ${fixtures.indexOf(map)}, cells ${floors[a]} and ${floors[b]}`).toBe(views[b]![floors[a]!]);
        }
      }
    }
  });

  it('unions sources and explored history without aliasing or mutation', () => {
    const map = mapOf('.....', '.....', '.....');
    const source = { x: 0, y: 1 };
    const sources = [source, { x: 4, y: 1 }, source];
    const first = computeVisibility(map, sources, 1);
    const again = computeVisibility(map, sources, 1);
    expect(first).toEqual(again);
    expect(first).not.toBe(again);
    expect(at(first, map, 0, 1)).toBe(true);
    expect(at(first, map, 4, 1)).toBe(true);
    const history = Array<boolean>(map.width * map.height).fill(false);
    history[0] = true;
    const explored = unionExplored(history, first);
    expect(explored[0]).toBe(true);
    expect(explored).not.toBe(history);
    expect(explored).not.toBe(first);
    expect(history.filter(Boolean)).toHaveLength(1);
    expect(() => unionExplored([], first)).toThrow();
  });
});
