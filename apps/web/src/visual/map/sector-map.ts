import { findTiledPath, TRAINING_MAPS, type TrainingMapId } from '@impulso/sim';
import { parseTiledTsx } from '../../../../../packages/sim/src/mapas/tsx-tileset';
import sectorSource from '../../../../../packages/sim/src/tiled-maps/sector-01 aaaa/sector-01.tmj?raw';
import espiralSource from '../../../../../packages/sim/src/tiled-maps/espiral-estelar/espiral-estelar.json?raw';

export type { TrainingMapId } from '@impulso/sim';

interface TiledObject { name?: string; gid?: number; x: number; y: number; width: number; height: number; visible?: boolean }
interface TileLayer { name: string; type?: string; data: number[]; visible: boolean; objects?: TiledObject[] }
interface TilesetTile {
  id: number; image?: string; imagewidth?: number; imageheight?: number;
  properties?: { name: string; value: unknown }[]; animation?: { tileid: number; duration: number }[];
}
interface Tileset {
  firstgid: number; columns: number; tilewidth: number; tileheight: number; image?: string; name?: string;
  source?: string; tiles?: TilesetTile[]; tileoffset?: { x: number; y: number };
}
interface TiledSector {
  orientation: string;
  width: number;
  height: number;
  layers: TileLayer[];
  tilesets: Tileset[];
}
export type { TiledObject, TileLayer, Tileset, TilesetTile, TiledSector };

/** Image files referenced by each map's tilesets, resolved by file name. */
const IMAGE_URLS: Record<TrainingMapId, Record<string, string>> = {
  'sector-01': byFileName(import.meta.glob('../../../../../packages/sim/src/tiled-maps/sector-01 aaaa/*.png', { eager: true, query: '?url', import: 'default' })),
  espiral: byFileName({
    ...import.meta.glob('../../../../../packages/sim/src/tiled-maps/espiral-estelar/tilesets/img/*.png', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob('../../../../../packages/sim/src/tiled-maps/espiral-estelar/assets-externos/sprites/*.png', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob('../../../../../packages/sim/src/tiled-maps/espiral-estelar/*.png', { eager: true, query: '?url', import: 'default' }),
  }),
};
const SOURCES: Record<TrainingMapId, string> = { 'sector-01': sectorSource, espiral: espiralSource };
const ESPIRAL_TSX = import.meta.glob('../../../../../packages/sim/src/tiled-maps/espiral-estelar/**/*.tsx', {
  eager: true, query: '?raw', import: 'default',
}) as Record<string, string>;
/** Tile layers that carry rules for the server, not art. */
export const HIDDEN_LAYERS = new Set(['logica', 'altura']);
export const DEFAULT_PLAYABLE_MAP: TrainingMapId = 'espiral';
const MAP_SOURCE_FILE: Record<TrainingMapId, string> = {
  espiral: 'espiral-estelar.json',
  'sector-01': 'sector-01.tmj',
};

function byFileName(files: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split('/').pop()!, String(url)]));
}

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const MAP_ORIGIN_Y = 64;

// Live bindings: every importer sees the map chosen by selectMap(). Espiral Estelar until a match picks another.
export let activeMapId: TrainingMapId = DEFAULT_PLAYABLE_MAP;
export let sectorMap = readTiledMap(SOURCES[DEFAULT_PLAYABLE_MAP], DEFAULT_PLAYABLE_MAP);
export let sectorSurface = TRAINING_MAPS[DEFAULT_PLAYABLE_MAP];
export let MAP_ORIGIN_X = sectorMap.height * TILE_WIDTH / 2;
export let ISO_WORLD_WIDTH = sectorMap.width * TILE_WIDTH;
export let ISO_WORLD_HEIGHT = (sectorMap.width + sectorMap.height) * TILE_HEIGHT / 2 + MAP_ORIGIN_Y + 48;

/** Switch the map every client module draws and plans on. Call before mounting the scene or inspector. */
export function selectMap(id: TrainingMapId): void {
  if (id === activeMapId) return;
  activeMapId = id;
  sectorMap = readTiledMap(SOURCES[id], id);
  sectorSurface = TRAINING_MAPS[id];
  MAP_ORIGIN_X = sectorMap.height * TILE_WIDTH / 2;
  ISO_WORLD_WIDTH = sectorMap.width * TILE_WIDTH;
  ISO_WORLD_HEIGHT = (sectorMap.width + sectorMap.height) * TILE_HEIGHT / 2 + MAP_ORIGIN_Y + 48;
}

/** URL of a tileset image of the active map, or null when the file is not in the repository. */
export function mapImageUrl(image: string | undefined): string | null {
  if (!image) return null;
  return IMAGE_URLS[activeMapId][image.split('/').pop()!] ?? null;
}

export function activeMapSourceFile(): string {
  return MAP_SOURCE_FILE[activeMapId];
}

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

export function routeAcrossSector(start: { x: number; y: number }, target: { x: number; y: number }, occupied: Point[] = []) {
  const walkable = [...sectorSurface.walkable];
  for (const point of occupied) {
    const x = Math.round(point.x), y = Math.round(point.y);
    if (x !== start.x || y !== start.y) walkable[y * sectorSurface.width + x] = false;
  }
  const result = findTiledPath({ ...sectorSurface, walkable }, start, target);
  return result.status === 'found' ? [start, ...result.path] : [];
}

function readTiledMap(raw: string, mapId: TrainingMapId): TiledSector {
  const map = JSON.parse(raw) as TiledSector;
  if (mapId !== 'espiral') return map;
  return {
    ...map,
    tilesets: map.tilesets.map((tileset) => {
      if (!tileset.source) return tileset;
      const xml = tsxXml(tileset.source);
      if (!xml) return tileset;
      return parseTiledTsx({
        xml,
        firstgid: tileset.firstgid,
        tsxPathFromMap: tileset.source.replaceAll('\\', '/'),
      });
    }),
  };
}

function tsxXml(source: string): string | undefined {
  const needle = source.replaceAll('\\', '/');
  const matches = Object.entries(ESPIRAL_TSX).filter(([path]) => path.replaceAll('\\', '/').endsWith(needle));
  const preferred = matches.find(([path]) => {
    const normalized = path.replaceAll('\\', '/');
    return normalized.endsWith(`/espiral-estelar/${needle}`);
  });
  return (preferred ?? matches[0])?.[1];
}

type Point = { x: number; y: number };

function clearSegment(from: Point, to: Point, occupied: Point[] = []) {
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
    if (occupied.some((point) => Math.hypot(x - point.x, y - point.y) < 0.9)) return false;
  }
  return true;
}

/** Free-angle movement on flat ground; legal ramp crossings follow the Tiled path. */
export function planSectorMove(start: Point, target: Point, occupied: Point[] = []): Point[] {
  const startCell = { x: Math.round(start.x), y: Math.round(start.y) };
  const targetCell = { x: Math.round(target.x), y: Math.round(target.y) };
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)
    || target.x < 0 || target.y < 0 || target.x > sectorMap.width - 1 || target.y > sectorMap.height - 1
    || Math.hypot(target.x - start.x, target.y - start.y) < 0.02
    || occupied.some((point) => Math.hypot(target.x - point.x, target.y - point.y) < 0.9)) return [];
  const route = routeAcrossSector(startCell, targetCell, occupied);
  if (!route.length) return [];
  if (clearSegment(start, target, occupied)) return [start, target];
  // Keep the open start-cell centre when traffic forces a detour. Omitting it can
  // make a fractional start cut into a nearby hull on the first diagonal segment.
  const entry = occupied.length && Math.hypot(start.x - startCell.x, start.y - startCell.y) > 0.02
    && clearSegment(start, startCell, occupied) ? [startCell] : [];
  const points = [start, ...entry, ...route.slice(1, -1), target];
  const smoothed: Point[] = [start];
  for (let anchor = 0; anchor < points.length - 1;) {
    let next = points.length - 1;
    while (next > anchor + 1 && !clearSegment(points[anchor]!, points[next]!, occupied)) next--;
    smoothed.push(points[next]!);
    anchor = next;
  }
  return smoothed;
}
