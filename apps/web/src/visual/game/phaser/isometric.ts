import { GRID_COLUMNS, GRID_ROWS, type GridCell, type GridPoint } from './grid';

export const TILE_HALF_WIDTH = 48;
export const TILE_HALF_HEIGHT = 24;
export const ISO_ORIGIN_X = GRID_ROWS * TILE_HALF_WIDTH;
export const ISO_ORIGIN_Y = 72;
export const ISO_WORLD_WIDTH = (GRID_COLUMNS + GRID_ROWS) * TILE_HALF_WIDTH;
export const ISO_WORLD_HEIGHT = (GRID_COLUMNS + GRID_ROWS) * TILE_HALF_HEIGHT + ISO_ORIGIN_Y + 72;

export function cellToIso(x: number, y: number) {
  return { x: ISO_ORIGIN_X + (x - y) * TILE_HALF_WIDTH, y: ISO_ORIGIN_Y + (x + y) * TILE_HALF_HEIGHT };
}

export function isoToCell(worldX: number, worldY: number): GridCell | null {
  const point = isoToPoint(worldX, worldY);
  if (!point) return null;
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function isoToPoint(worldX: number, worldY: number): GridPoint | null {
  const dx = (worldX - ISO_ORIGIN_X) / TILE_HALF_WIDTH;
  const dy = (worldY - ISO_ORIGIN_Y) / TILE_HALF_HEIGHT;
  const x = (dx + dy) / 2;
  const y = (dy - dx) / 2;
  return x >= 0 && x <= GRID_COLUMNS - 1 && y >= 0 && y <= GRID_ROWS - 1 ? { x, y } : null;
}
