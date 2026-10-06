import { MAP_ORIGIN_X, MAP_ORIGIN_Y, TILE_HEIGHT, TILE_WIDTH, sectorMap, sectorSurface } from '../../map/sector-map';
// Re-exports keep the live bindings, so they follow selectMap().
export { MAP_ORIGIN_X as ISO_ORIGIN_X, MAP_ORIGIN_Y as ISO_ORIGIN_Y, ISO_WORLD_WIDTH, ISO_WORLD_HEIGHT } from '../../map/sector-map';
import type { GridCell, GridPoint } from './grid';

export const TILE_HALF_WIDTH = TILE_WIDTH / 2;
export const TILE_HALF_HEIGHT = TILE_HEIGHT / 2;
/** Same yaw as the Espiral sketch bake: the camera looks at the layout, tiles stay upright diamonds. */
export const VIEW_YAW_RADIANS = -Math.PI / 6;
/** Extra world around both bases so the opening view is a wide window, not a crop of the map. */
const BASE_VIEW_PADDING = 0.08;
/** Closest the player may zoom from the opening view. */
export const VIEW_CLOSE_MULTIPLIER = 2.4;

function yawCell(x: number, y: number, radians: number) {
  const centerX = (sectorMap.width - 1) / 2;
  const centerY = (sectorMap.height - 1) / 2;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const deltaX = x - centerX;
  const deltaY = y - centerY;
  return { x: centerX + deltaX * cosine - deltaY * sine, y: centerY + deltaX * sine + deltaY * cosine };
}

function projectCell(x: number, y: number) {
  return { x: MAP_ORIGIN_X + (x - y) * TILE_HALF_WIDTH, y: MAP_ORIGIN_Y + (x + y) * TILE_HALF_HEIGHT };
}

export function cellToIso(x: number, y: number) {
  const viewed = yawCell(x, y, VIEW_YAW_RADIANS);
  return projectCell(viewed.x, viewed.y);
}

export function isoToCell(worldX: number, worldY: number): GridCell | null {
  const point = isoToPoint(worldX, worldY);
  if (!point) return null;
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function isoToPoint(worldX: number, worldY: number): GridPoint | null {
  const deltaX = (worldX - MAP_ORIGIN_X) / TILE_HALF_WIDTH;
  const deltaY = (worldY - MAP_ORIGIN_Y) / TILE_HALF_HEIGHT;
  const viewed = { x: (deltaX + deltaY) / 2, y: (deltaY - deltaX) / 2 };
  const grid = yawCell(viewed.x, viewed.y, -VIEW_YAW_RADIANS);
  const inside = grid.x >= 0 && grid.x <= sectorMap.width - 1 && grid.y >= 0 && grid.y <= sectorMap.height - 1;
  return inside ? grid : null;
}

/** Axis-aligned box that holds every projected map corner. The map is not cropped. */
export function projectedWorldBounds() {
  const lastX = sectorMap.width - 1;
  const lastY = sectorMap.height - 1;
  const corners = [cellToIso(0, 0), cellToIso(lastX, 0), cellToIso(lastX, lastY), cellToIso(0, lastY)];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

function paddedBaseBox() {
  const blue = cellToIso(sectorSurface.bases.p1.x, sectorSurface.bases.p1.y);
  const red = cellToIso(sectorSurface.bases.p2.x, sectorSurface.bases.p2.y);
  const left = Math.min(blue.x, red.x);
  const top = Math.min(blue.y, red.y);
  const width = Math.abs(blue.x - red.x);
  const height = Math.abs(blue.y - red.y);
  const padX = width * BASE_VIEW_PADDING;
  const padY = height * BASE_VIEW_PADDING;
  return { x: left - padX, y: top - padY, width: width + padX * 2, height: height + padY * 2 };
}

/** Opening camera zoom: both bases sit in the window, diamond tips fall off the screen. */
export function playerViewZoom(viewportWidth: number, viewportHeight: number) {
  if (viewportWidth <= 0 || viewportHeight <= 0) return 1;
  const box = paddedBaseBox();
  return Math.min(viewportWidth / box.width, viewportHeight / box.height);
}

export function playerViewCenter() {
  const blue = cellToIso(sectorSurface.bases.p1.x, sectorSurface.bases.p1.y);
  const red = cellToIso(sectorSurface.bases.p2.x, sectorSurface.bases.p2.y);
  return { x: (blue.x + red.x) / 2, y: (blue.y + red.y) / 2 };
}
