import { MAP_ORIGIN_X, MAP_ORIGIN_Y, TILE_HEIGHT, TILE_WIDTH, sectorMap } from '../../map/sector-map';
// Re-exports keep the live bindings, so they follow selectMap().
export { MAP_ORIGIN_X as ISO_ORIGIN_X, MAP_ORIGIN_Y as ISO_ORIGIN_Y, ISO_WORLD_WIDTH, ISO_WORLD_HEIGHT } from '../../map/sector-map';
import type { GridCell, GridPoint } from './grid';

export const TILE_HALF_WIDTH = TILE_WIDTH / 2;
export const TILE_HALF_HEIGHT = TILE_HEIGHT / 2;

export function cellToIso(x: number, y: number) {
  return { x: MAP_ORIGIN_X + (x - y) * TILE_HALF_WIDTH, y: MAP_ORIGIN_Y + (x + y) * TILE_HALF_HEIGHT };
}

export function isoToCell(worldX: number, worldY: number): GridCell | null {
  const point = isoToPoint(worldX, worldY);
  if (!point) return null;
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function isoToPoint(worldX: number, worldY: number): GridPoint | null {
  const dx = (worldX - MAP_ORIGIN_X) / TILE_HALF_WIDTH;
  const dy = (worldY - MAP_ORIGIN_Y) / TILE_HALF_HEIGHT;
  const x = (dx + dy) / 2;
  const y = (dy - dx) / 2;
  return x >= 0 && x <= sectorMap.width - 1 && y >= 0 && y <= sectorMap.height - 1 ? { x, y } : null;
}
