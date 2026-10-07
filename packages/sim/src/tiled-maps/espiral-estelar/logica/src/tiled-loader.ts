import { terrainForZone, type CollisionType, type ZoneProperties } from './collision';
import { cycleFromSeconds } from './cycle';
import { createGameMap, type AsteroidGate, type GameMap, type MapMarker, type MarkerValue, type WormholeNetwork } from './game-map';
import type { TileCoord } from './grid';
import { isTerrain, TERRAINS, type Terrain } from './terrain';

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
/** Capa de objetos interactivos de la especificación (anillos, tormentas, planetoides). Es opcional. */
export const INTERACTIVE_LAYER = 'Objects_Interactive';
const ZONE_KINDS = new Set(['OBSTACLE_RING', 'ENVIRONMENTAL_HAZARD', 'SOLID_BLOCKER']);
const RING_INNER_RATIO = 0.55;
const FLIP_FLAGS_MASK = 0x1fffffff;
const DEFAULT_CYCLE_SECONDS = 90;
const DEFAULT_OPEN_SECONDS = 30;
const GATE_KINDS = new Set(['asteroid_gate', 'valla_laser']);

export function loadTiledMap(json: TiledMapJson, ticksPerSecond: number): GameMap {
  const objects = [OBJECT_LAYER, INTERACTIVE_LAYER].flatMap((name) => optionalLayer(json, name)?.objects ?? []);
  const toTile = (x: number, y: number): TileCoord => ({
    x: Math.floor(x / json.tileheight),
    y: Math.floor(y / json.tileheight),
  });
  return createGameMap({
    width: json.width,
    height: json.height,
    terrain: stampZones(readTerrain(json), objects, json),
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

function optionalLayer(json: TiledMapJson, name: string): TiledLayer | undefined {
  return json.layers.find((candidate) => candidate.name === name);
}

/** Aplica sobre la capa lógica los obstáculos definidos como objetos (anillo de hielo, tormenta, planetoide). */
function stampZones(terrain: Terrain[], objects: readonly TiledObject[], json: TiledMapJson): Terrain[] {
  const stamped = [...terrain];
  for (const zone of objects.filter((object) => ZONE_KINDS.has(kindOf(object)))) {
    const zoneTerrain = terrainForZone(zonePropertiesOf(zone));
    if (!zoneTerrain) continue;
    for (const tile of zoneTiles(zone, json.tileheight)) {
      if (tile.x >= 0 && tile.y >= 0 && tile.x < json.width && tile.y < json.height) {
        stamped[tile.y * json.width + tile.x] = zoneTerrain;
      }
    }
  }
  return stamped;
}

function zonePropertiesOf(object: TiledObject): ZoneProperties {
  const value = (name: string) => propertyOf(object.properties, name);
  const collisionType = value('collision_type');
  return {
    ...(isCollisionType(collisionType) ? { collision_type: collisionType } : {}),
    blocks_vision: value('blocks_vision') === true,
    vision_modifier: String(value('vision_modifier') ?? ''),
  };
}

function isCollisionType(value: unknown): value is CollisionType {
  return value === 'NONE' || value === 'HEAVY_ONLY' || value === 'ALL_UNITS_BLOCKED';
}

/** Un anillo solo ocupa su borde: el centro queda libre para que pase una nave. */
function zoneTiles(object: TiledObject, tileSize: number): TileCoord[] {
  const tiles = tilesCoveredBy(object, tileSize);
  if (kindOf(object) !== 'OBSTACLE_RING') return tiles;
  const centerX = (object.x + object.width / 2) / tileSize - 0.5;
  const centerY = (object.y + object.height / 2) / tileSize - 0.5;
  const radiusX = object.width / tileSize / 2;
  const radiusY = object.height / tileSize / 2;
  return tiles.filter((tile) => Math.hypot((tile.x - centerX) / radiusX, (tile.y - centerY) / radiusY) >= RING_INNER_RATIO);
}

function readTerrain(json: TiledMapJson): Terrain[] {
  const terrainByGid = buildTerrainByGid(json.tilesets);
  const data = findLayer(json, LOGIC_LAYER).data ?? [];
  return data.map((gid) => terrainByGid.get(gid & FLIP_FLAGS_MASK) ?? 'empty');
}

function buildTerrainByGid(tilesets: readonly TiledTileset[]): Map<number, Terrain> {
  const lookup = new Map<number, Terrain>();
  for (const tileset of tilesets) {
    if (tileset.source) {
      // Tiled may keep tilesets in external .tsx files. Only the logic tileset carries terrain,
      // and its tiles 0–7 follow TERRAINS (see tilesets/logica.tsx); the rest is artwork.
      if (/(^|[\\/])tilesets[\\/]logica\.tsx$/.test(tileset.source))
        TERRAINS.forEach((terrain, id) => lookup.set(tileset.firstgid + id, terrain));
      continue;
    }
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
  const warningSeconds = numberProperty(object, 'warningSeconds', 0);
  return cycleFromSeconds(cycleSeconds, openSeconds, ticksPerSecond, warningSeconds);
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
    .filter((object) => GATE_KINDS.has(kindOf(object)))
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
  const handledKinds = new Set(['agujero', ...GATE_KINDS, ...ZONE_KINDS]);
  return objects
    .filter((object) => !handledKinds.has(kindOf(object)))
    .map((object) => ({
      kind: kindOf(object),
      tile: toTile(object.x, object.y),
      properties: Object.fromEntries((object.properties ?? []).map((property) => [property.name, property.value])),
    }));
}
