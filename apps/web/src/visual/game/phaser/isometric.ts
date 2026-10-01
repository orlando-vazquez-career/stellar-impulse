import { MAP_ORIGIN_X, MAP_ORIGIN_Y, TILE_HEIGHT, TILE_WIDTH, sectorMap } from '../../map/sector-map';
import type { GridCell, GridPoint } from './grid';

export const TILE_HALF_WIDTH = TILE_WIDTH / 2;
export const TILE_HALF_HEIGHT = TILE_HEIGHT / 2;
export const ISO_ORIGIN_X = MAP_ORIGIN_X;
export const ISO_ORIGIN_Y = MAP_ORIGIN_Y;
export const ISO_WORLD_WIDTH = sectorMap.width * TILE_WIDTH;
export const ISO_WORLD_HEIGHT = (sectorMap.width + sectorMap.height) * TILE_HALF_HEIGHT + ISO_ORIGIN_Y + 48;

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
  return x >= 0 && x <= sectorMap.width - 1 && y >= 0 && y <= sectorMap.height - 1 ? { x, y } : null;
}
