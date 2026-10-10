import { isRampDirection, type RampDirection } from './alturas.js';
import type { DropZoneSpec } from '../mecanicas/satellites.js';
import type { MapObstacle } from './obstaculos.js';
import type { NebulaSpec } from '../mecanicas/nebulosas.js';
import type { BeltGateSpec } from '../mecanicas/cinturon.js';
import type { TurretSpec } from '../mecanicas/torretas.js';
import type { BarrierSpec } from '../mecanicas/barreras.js';

const MAX_SIDE = 128;
const FLIP_MASK = 0xe0000000;
const LEVEL_LIMIT = 7;

export interface Superficie {
  width: number;
  height: number;
  walkable: boolean[];
  level: number[];
  ramp: (RampDirection | null)[];
}

export interface SectorLeido extends Superficie {
  bases: { p1: { x: number; y: number }; p2: { x: number; y: number } };
  /** `radius`: cells around the pillar that count as its capture area, when the map sets one. */
  core: { x: number; y: number; radius?: number };
  /** `radius`: cells around each Metal node that count as its capture area, when the map sets one. */
  metals: { x: number; y: number; radius?: number }[];
  /** `radius`: cells around the pronexo that count as its capture area, when the map sets `radio`. */
  captures: { x: number; y: number; radius?: number }[];
  /** `zona_caida` rectangles of the `eventos` layer, when the map has them. */
  dropZones?: DropZoneSpec[];
  /** `OBSTACLE_RING` points: their cells are already closed in `walkable`. */
  obstaculos?: MapObstacle[];
  /** Purple nebula that slows and hides ships, and the clouds that drift out of it. */
  nebula?: NebulaSpec;
  /** `asteroid_gate` passages the asteroid belt closes by cycles: their cells are closed in `walkable`. */
  belt?: BeltGateSpec[];
  /** `torreta` points: neutral guns that fire at any ship in range. */
  turrets?: TurretSpec[];
  /** `estacion` points: capturable stations that sell ships at once, at `priceFactor` times their cost. */
  stations?: { x: number; y: number; radius?: number; priceFactor: number }[];
  /** `barrera_destruible` points: their `cells` are closed in `walkable` until the barrier falls. */
  barriers?: BarrierSpec[];
}

interface TileFace {
  walkable: boolean | null;
  level: number | null;
  ramp: RampDirection | null;
  debris: boolean;
  symbol: string | null;
}

interface Paint {
  width: number;
  height: number;
  tiles: ReadonlyMap<number, TileFace>;
  walkable: boolean[];
  level: number[];
  ramp: (RampDirection | null)[];
  symbols: { symbol: string; x: number; y: number }[];
}

/** Reads a handmade Tiled map. Wang edges are already chosen in the file. */
export function leerSuperficie(mapa: unknown): SectorLeido {
  const source = record(mapa);
  if (source.infinite !== false) throw new Error('Invalid tiled map');
  if (source.orientation !== 'orthogonal' && source.orientation !== 'isometric') throw new Error('Invalid tiled map');
  const width = side(source.width);
  const height = side(source.height);
  const cells = width * height;
  const paint: Paint = {
    width, height, tiles: indexTiles(source.tilesets),
    walkable: Array.from({ length: cells }, () => false),
    level: Array.from({ length: cells }, () => 0),
    ramp: Array.from({ length: cells }, () => null),
    symbols: [],
  };
  for (const layer of list(source.layers)) paintLayer(paint, layer);
  return assemble(paint);
}

function paintLayer(paint: Paint, layer: unknown): void {
  const source = record(layer);
  if (source.visible === false || source.type !== 'tilelayer') return;
  if (typeof source.name !== 'string') throw new Error('Invalid tiled layer');
  if (source.encoding || source.compression || source.chunks) throw new Error('Invalid tiled layer');
  if ((source.x !== undefined && source.x !== 0) || (source.y !== undefined && source.y !== 0)) throw new Error('Invalid tiled layer');
  const name = source.name;
  if (name === 'espacio') return;
  const data = tileData(source.data, paint.width * paint.height);
  if (name === 'objetos') {
    readSymbols(paint, data);
    return;
  }
  data.forEach((gid, index) => paintCell(paint, name, gid, index));
}

function paintCell(paint: Paint, layerName: string, gid: number, index: number): void {
  if (gid === 0) return;
  const tile = paint.tiles.get(gid);
  if (!tile) throw new Error('Unknown tile');
  if (layerName === 'obstaculos' || tile.debris) {
    paint.walkable[index] = false;
    paint.ramp[index] = null;
    return;
  }
  if (tile.walkable !== true) return;
  paint.walkable[index] = true;
  paint.level[index] = tile.level ?? 0;
  paint.ramp[index] = tile.ramp;
}

function readSymbols(paint: Paint, data: readonly number[]): void {
  data.forEach((gid, index) => {
    if (gid === 0) return;
    const symbol = paint.tiles.get(gid)?.symbol;
    if (!symbol) throw new Error('Unknown tile');
    paint.symbols.push({ symbol, x: index % paint.width, y: Math.floor(index / paint.width) });
  });
}

function assemble(paint: Paint): SectorLeido {
  const at = (symbol: string) => paint.symbols.filter((mark) => mark.symbol === symbol);
  const bases = { p1: only(at('A'), 'A'), p2: only(at('B'), 'B') };
  const core = only(at('N'), 'N');
  const metals = at('R').map(cellOf);
  const captures = at('C').map(cellOf);
  const known = new Set(['A', 'B', 'N', 'R', 'C']);
  if (paint.symbols.some((mark) => !known.has(mark.symbol))) throw new Error('Unknown map symbol');
  for (const cell of [bases.p1, bases.p2, core, ...metals, ...captures]) {
    if (paint.walkable[cell.y * paint.width + cell.x] !== true) throw new Error('Objective is not walkable');
  }
  return {
    width: paint.width, height: paint.height, walkable: paint.walkable, level: paint.level, ramp: paint.ramp,
    bases, core, metals, captures,
  };
}

function only(marks: { x: number; y: number }[], symbol: string): { x: number; y: number } {
  const mark = marks[0];
  if (marks.length !== 1 || !mark) throw new Error(`Missing map symbol ${symbol}`);
  return cellOf(mark);
}

function cellOf(mark: { x: number; y: number }): { x: number; y: number } {
  return { x: mark.x, y: mark.y };
}

function indexTiles(value: unknown): Map<number, TileFace> {
  const tiles = new Map<number, TileFace>();
  for (const tileset of list(value)) {
    const source = record(tileset);
    const firstGid = positiveInt(source.firstgid);
    for (const tile of list(source.tiles ?? [])) {
      const face = record(tile);
      const id = nonNegativeInt(face.id);
      const gid = firstGid + id;
      if (tiles.has(gid)) throw new Error('Duplicate tile');
      tiles.set(gid, tileFace(face));
    }
  }
  return tiles;
}

function tileFace(tile: Record<string, unknown>): TileFace {
  const props = properties(tile.properties);
  const walkable = props.get('walkable');
  const level = props.get('level');
  const ramp = props.get('ramp');
  const symbol = props.get('symbol');
  if (walkable !== undefined && typeof walkable !== 'boolean') throw new Error('Invalid tile property');
  if (level !== undefined && (typeof level !== 'number' || !Number.isSafeInteger(level) || level < 0 || level > LEVEL_LIMIT)) {
    throw new Error('Invalid tile property');
  }
  if (ramp !== undefined && !isRampDirection(ramp)) throw new Error('Invalid tile property');
  if (symbol !== undefined && (typeof symbol !== 'string' || symbol.length !== 1)) throw new Error('Invalid tile property');
  return {
    walkable: walkable ?? null,
    level: level ?? null,
    ramp: ramp ?? null,
    debris: tile.type === 'escombro',
    symbol: symbol ?? null,
  };
}

function properties(value: unknown): Map<string, unknown> {
  const props = new Map<string, unknown>();
  if (value === undefined) return props;
  for (const entry of list(value)) {
    const source = record(entry);
    if (typeof source.name !== 'string') throw new Error('Invalid tile property');
    props.set(source.name, source.value);
  }
  return props;
}

function tileData(value: unknown, cells: number): number[] {
  const data = list(value);
  if (data.length !== cells) throw new Error('Invalid tiled layer');
  return data.map((gid) => {
    if (typeof gid !== 'number' || !Number.isSafeInteger(gid) || gid < 0) throw new Error('Invalid tiled layer');
    if ((gid & FLIP_MASK) !== 0) throw new Error('Invalid tiled layer');
    return gid;
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid tiled map');
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid tiled map');
  return value;
}

function side(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_SIDE) throw new Error('Invalid tiled map');
  return value;
}

function positiveInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid tiled map');
  return value;
}

function nonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid tiled map');
  return value;
}
