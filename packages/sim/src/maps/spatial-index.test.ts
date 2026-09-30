import { describe, expect, it } from 'vitest';
import { createSpatialIndex, type SpatialPoint } from './spatial-index.js';

const map = { width: 9, height: 7 };
const center = { x: 4, y: 3 };

describe('spatial index', () => {
  it('matches a brute-force Manhattan query across buckets and dense cells', () => {
    const points: SpatialPoint[] = Array.from({ length: 60 }, (_, index) => ({
      id: `unit-${String(index).padStart(2, '0')}`, x: (index * 7) % map.width, y: (index * 11) % map.height,
    }));
    const index = createSpatialIndex(map, points, 2);
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        for (let radius = 0; radius <= 5; radius += 1) {
          const expected = points.filter((point) => Math.abs(point.x - x) + Math.abs(point.y - y) <= radius)
            .map((point) => point.id).sort();
          expect(index.queryManhattan({ x, y }, radius).map((point) => point.id)).toEqual(expected);
        }
      }
    }
  });

  it('has stable ID order independent of insertion order and bucket size', () => {
    const points = [
      { id: 'z', x: 4, y: 3 }, { id: 'a', x: 4, y: 3 }, { id: 'm', x: 5, y: 3 },
    ];
    const expected = ['a', 'm', 'z'];
    expect(createSpatialIndex(map, points, 1).queryManhattan(center, 1).map((point) => point.id)).toEqual(expected);
    expect(createSpatialIndex(map, [...points].reverse(), 8).queryManhattan(center, 1).map((point) => point.id)).toEqual(expected);
    expect(createSpatialIndex(map, [], 2).queryManhattan(center, 5)).toEqual([]);
  });

  it('snapshots coordinates and returns immutable results without mutable input references', () => {
    const point = { id: 'own', x: 4, y: 3 };
    const mutableGrid = { width: 9, height: 7 };
    const index = createSpatialIndex(mutableGrid, [point]);
    point.x = 0;
    mutableGrid.width = 1;
    mutableGrid.height = 1;
    const first = index.queryManhattan(center, 0);
    const second = index.queryManhattan(center, 0);
    expect(first).toEqual([{ id: 'own', x: 4, y: 3 }]);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(point);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
  });

  it('rejects malformed indexes and queries', () => {
    expect(() => createSpatialIndex(map, [{ id: 'a', x: -1, y: 0 }])).toThrow();
    expect(() => createSpatialIndex(map, [{ id: 'a', x: 1, y: 1 }, { id: 'a', x: 2, y: 2 }])).toThrow();
    expect(() => createSpatialIndex(map, [], 0)).toThrow();
    const index = createSpatialIndex(map, []);
    expect(() => index.queryManhattan({ x: 9, y: 0 }, 1)).toThrow();
    expect(() => index.queryManhattan(center, -1)).toThrow();
  });
});
