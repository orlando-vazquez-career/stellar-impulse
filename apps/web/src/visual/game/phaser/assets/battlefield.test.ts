import { describe, expect, it } from 'vitest';
import map from './battlefield.json';
import { CELL_SIZE, GRID_COLUMNS, GRID_ROWS } from '../grid';

describe('Tiled battlefield', () => {
  it('keeps a square orthogonal grid aligned with the tactical coordinates', () => {
    expect(map.orientation).toBe('orthogonal');
    expect(map.tilewidth).toBe(CELL_SIZE);
    expect(map.tileheight).toBe(CELL_SIZE);
    expect(map.width).toBe(GRID_COLUMNS);
    expect(map.height).toBe(GRID_ROWS);
    expect(map.layers[0]?.data).toHaveLength(GRID_COLUMNS * GRID_ROWS);
    expect(map.layers[0]?.data.every((gid) => gid >= 1 && gid <= map.tilesets[0]!.tilecount)).toBe(true);
  });
});
