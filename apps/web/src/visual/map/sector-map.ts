import { findTiledPath, leerSuperficie } from '@impulso/sim';
import source from '../../../../../packages/sim/src/tiled-maps/sector-01 aaaa/sector-01.tmj?raw';

interface TileLayer { name: string; data: number[]; visible: boolean }
interface Tileset { firstgid: number; columns: number; tilewidth: number; tileheight: number; image: string }
interface TiledSector {
  orientation: string;
  width: number;
  height: number;
  layers: TileLayer[];
  tilesets: Tileset[];
}

export const sectorMap = JSON.parse(source) as TiledSector;
export const sectorSurface = leerSuperficie(sectorMap);
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const MAP_ORIGIN_X = sectorMap.height * TILE_WIDTH / 2;
export const MAP_ORIGIN_Y = 64;

export function cellToPixel(cell: { x: number; y: number }) {
  return { x: MAP_ORIGIN_X + (cell.x - cell.y) * TILE_WIDTH / 2,
    y: MAP_ORIGIN_Y + (cell.x + cell.y) * TILE_HEIGHT / 2 };
}

export function cellAtPixel(x: number, y: number) {
  const dx = (x - MAP_ORIGIN_X) / (TILE_WIDTH / 2);
  const dy = (y - MAP_ORIGIN_Y) / (TILE_HEIGHT / 2);
  const cellX = Math.round((dx + dy) / 2);
  const cellY = Math.round((dy - dx) / 2);
  return cellX >= 0 && cellY >= 0 && cellX < sectorMap.width && cellY < sectorMap.height
    ? { x: cellX, y: cellY } : null;
}

export function routeAcrossSector(start: { x: number; y: number }, target: { x: number; y: number }) {
  const result = findTiledPath(sectorSurface, start, target);
  return result.status === 'found' ? [start, ...result.path] : [];
}

type Point = { x: number; y: number };

function clearSegment(from: Point, to: Point) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 20);
  const first = Math.round(from.y) * sectorSurface.width + Math.round(from.x);
  const height = sectorSurface.level[first];
  for (let step = 0; step <= steps; step++) {
    const x = from.x + (to.x - from.x) * step / Math.max(steps, 1);
    const y = from.y + (to.y - from.y) * step / Math.max(steps, 1);
    const col = Math.round(x);
    const row = Math.round(y);
    if (col < 0 || row < 0 || col >= sectorMap.width || row >= sectorMap.height) return false;
    const index = row * sectorMap.width + col;
    if (!sectorSurface.walkable[index] || sectorSurface.level[index] !== height) return false;
  }
  return true;
}

/** Free-angle movement on flat ground; legal ramp crossings follow the Tiled path. */
export function planSectorMove(start: Point, target: Point): Point[] {
  const startCell = { x: Math.round(start.x), y: Math.round(start.y) };
  const targetCell = { x: Math.round(target.x), y: Math.round(target.y) };
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)
    || target.x < 0 || target.y < 0 || target.x > sectorMap.width - 1 || target.y > sectorMap.height - 1
    || Math.hypot(target.x - start.x, target.y - start.y) < 0.02) return [];
  const route = routeAcrossSector(startCell, targetCell);
  if (!route.length) return [];
  if (clearSegment(start, target)) return [start, target];
  const points = [start, ...route.slice(1, -1), target];
  const smoothed: Point[] = [start];
  for (let anchor = 0; anchor < points.length - 1;) {
    let next = points.length - 1;
    while (next > anchor + 1 && !clearSegment(points[anchor]!, points[next]!)) next--;
    smoothed.push(points[next]!);
    anchor = next;
  }
  return smoothed;
}
