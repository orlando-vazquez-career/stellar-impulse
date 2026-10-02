import { cycleFromSeconds } from './cycle';
import { createGameMap, type AsteroidGate, type GameMap, type MapMarker, type MarkerValue, type WormholeNetwork } from './game-map';
import type { TileCoord } from './grid';
import { isTerrain, type Terrain } from './terrain';

interface TiledProperty { readonly name: string; readonly value: MarkerValue }
interface TiledTile { readonly id: number; readonly properties?: readonly TiledProperty[] }
interface TiledTileset { readonly firstgid: number; readonly source?: string; readonly tiles?: readonly TiledTile[] }

interface TiledObject {
  readonly id: number;
  readonly type?: string;
  readonly class?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly properties?: readonly TiledProperty[];
}

interface TiledLayer {
  readonly name: string;
  readonly data?: readonly number[];
  readonly objects?: readonly TiledObject[];
}

export interface TiledMapJson {
  readonly width: number;
  readonly height: number;
  readonly tileheight: number;
  readonly layers: readonly TiledLayer[];
  readonly tilesets: readonly TiledTileset[];
}

export const LOGIC_LAYER = 'logica';
export const OBJECT_LAYER = 'objetos';
const FLIP_FLAGS_MASK = 0x1fffffff;
const DEFAULT_CYCLE_SECONDS = 90;
const DEFAULT_OPEN_SECONDS = 30;

export function loadTiledMap(json: TiledMapJson, ticksPerSecond: number): GameMap {
  const objects = findLayer(json, OBJECT_LAYER).objects ?? [];
  const toTile = (x: number, y: number): TileCoord => ({
    x: Math.floor(x / json.tileheight),
    y: Math.floor(y / json.tileheight),
  });
  return createGameMap({
    width: json.width,
    height: json.height,
    terrain: readTerrain(json),
    wormholes: readWormholes(objects, toTile, ticksPerSecond),
    gates: readGates(objects, json.tileheight, ticksPerSecond),
    markers: readMarkers(objects, toTile),
  });
}

function findLayer(json: TiledMapJson, name: string): TiledLayer {
  const layer = json.layers.find((candidate) => candidate.name === name);
  if (!layer) throw new Error(`Falta la capa "${name}" en el mapa exportado`);
  return layer;
}

function readTerrain(json: TiledMapJson): Terrain[] {
  const terrainByGid = buildTerrainByGid(json.tilesets);
  const data = findLayer(json, LOGIC_LAYER).data ?? [];
  return data.map((gid) => terrainByGid.get(gid & FLIP_FLAGS_MASK) ?? 'empty');
}

function buildTerrainByGid(tilesets: readonly TiledTileset[]): Map<number, Terrain> {
  const lookup = new Map<number, Terrain>();
  for (const tileset of tilesets) {
    if (tileset.source) throw new Error('Exporta el mapa con "Embed tilesets" activado');
    for (const tile of tileset.tiles ?? []) {
      const terrain = propertyOf(tile.properties, 'terrain');
      if (isTerrain(terrain)) lookup.set(tileset.firstgid + tile.id, terrain);
    }
  }
  return lookup;
}

function propertyOf(properties: readonly TiledProperty[] | undefined, name: string): MarkerValue | undefined {
  return properties?.find((property) => property.name === name)?.value;
}

function numberProperty(object: TiledObject, name: string, fallback: number): number {
  const value = propertyOf(object.properties, name);
  return typeof value === 'number' ? value : fallback;
}

function kindOf(object: TiledObject): string {
  return object.type || object.class || '';
}

function cycleOf(object: TiledObject, ticksPerSecond: number) {
  const cycleSeconds = numberProperty(object, 'cycleSeconds', DEFAULT_CYCLE_SECONDS);
  const openSeconds = numberProperty(object, 'openSeconds', DEFAULT_OPEN_SECONDS);
  return cycleFromSeconds(cycleSeconds, openSeconds, ticksPerSecond);
}

function readWormholes(
  objects: readonly TiledObject[],
  toTile: (x: number, y: number) => TileCoord,
  ticksPerSecond: number,
): WormholeNetwork[] {
  const groups = new Map<string, TiledObject[]>();
  for (const object of objects.filter((candidate) => kindOf(candidate) === 'agujero')) {
    const id = String(propertyOf(object.properties, 'pairId') ?? 'A');
    groups.set(id, [...(groups.get(id) ?? []), object]);
  }
  return [...groups.entries()].map(([id, members]) => {
    const ordered = [...members].sort((a, b) => a.id - b.id);
    const first = ordered[0];
    if (!first || ordered.length < 2) throw new Error(`El agujero de gusano "${id}" necesita al menos 2 extremos`);
    return { id, endpoints: ordered.map((object) => toTile(object.x, object.y)), cycle: cycleOf(first, ticksPerSecond) };
  });
}

function readGates(objects: readonly TiledObject[], tileSize: number, ticksPerSecond: number): AsteroidGate[] {
  return objects
    .filter((object) => kindOf(object) === 'asteroid_gate')
    .map((object) => ({ tiles: tilesCoveredBy(object, tileSize), cycle: cycleOf(object, ticksPerSecond) }));
}

function tilesCoveredBy(object: TiledObject, tileSize: number): TileCoord[] {
  const firstX = Math.floor(object.x / tileSize);
  const firstY = Math.floor(object.y / tileSize);
  const lastX = Math.max(firstX, Math.ceil((object.x + object.width) / tileSize) - 1);
  const lastY = Math.max(firstY, Math.ceil((object.y + object.height) / tileSize) - 1);
  const tiles: TileCoord[] = [];
  for (let y = firstY; y <= lastY; y++) {
    for (let x = firstX; x <= lastX; x++) tiles.push({ x, y });
  }
  return tiles;
}

function readMarkers(objects: readonly TiledObject[], toTile: (x: number, y: number) => TileCoord): MapMarker[] {
  const handledKinds = new Set(['agujero', 'asteroid_gate']);
  return objects
    .filter((object) => !handledKinds.has(kindOf(object)))
    .map((object) => ({
      kind: kindOf(object),
      tile: toTile(object.x, object.y),
      properties: Object.fromEntries((object.properties ?? []).map((property) => [property.name, property.value])),
    }));
}
