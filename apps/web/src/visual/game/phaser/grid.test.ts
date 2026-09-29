import { describe, expect, it } from 'vitest';
import { buildRoute, CELL_SIZE, GRID_COLUMNS, GRID_ROWS, gridToWorld, worldToGrid } from './grid';

describe('expanded tactical grid', () => {
  it('round trips every cell center and excludes points outside the field', () => {
    expect(GRID_COLUMNS).toBe(72);
    expect(GRID_ROWS).toBe(72);
    for (let x = 0; x < GRID_COLUMNS; x += 1) {
      for (let y = 0; y < GRID_ROWS; y += 1) {
        const point = gridToWorld(x, y);
        expect(worldToGrid(point.x, point.y)).toEqual({ x, y });
      }
    }
    expect(worldToGrid(0, 0)).toEqual({ x: 0, y: 0 });
    expect(worldToGrid(-1, 0)).toBeNull();
    expect(worldToGrid(GRID_COLUMNS * CELL_SIZE, 0)).toBeNull();
  });

  it('builds a contiguous route and refuses out-of-bounds targets', () => {
    expect(buildRoute({ x: 2, y: 3 }, { x: 4, y: 4 })).toEqual([
      { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 },
    ]);
    expect(buildRoute({ x: 2, y: 3 }, { x: 72, y: 4 })).toEqual([]);
    expect(buildRoute({ x: 2, y: 3 }, { x: 4, y: 3 }, [{ x: 3, y: 3 }])).toEqual([
      { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 },
    ]);
  });
});
