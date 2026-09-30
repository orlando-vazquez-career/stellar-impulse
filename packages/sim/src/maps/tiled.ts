import { MAX_MAP_SIDE } from './types.js';

/** Supported Tiled subset: finite orthogonal JSON, embedded tilesets, unencoded tile layers. */
export interface TiledGrid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly layers: readonly Readonly<{ name: string; data: readonly number[] }>[];
  /** Only the explicit `nav-blocked` layer makes a cell impassable. */
  readonly walkable: readonly boolean[];
  /** Only the explicit `vision-opaque` layer occludes sight. */
  readonly opaque: readonly boolean[];
}

export const MAX_TILED_JSON_BYTES = 1_048_576;
export const MAX_TILED_LAYERS = 16;
const MAX_TILESETS = 8;
const MAX_GID = 0x0fffffff; // Reject all Tiled flip/rotation flag bits.

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

/** Parse untrusted local JSON text. JSON.parse creates data properties, so no input getter is invoked. */
export function parseTiledJson(source: string): TiledGrid {
  if (typeof source !== 'string' || source.length > MAX_TILED_JSON_BYTES
    || new TextEncoder().encode(source).byteLength > MAX_TILED_JSON_BYTES) throw new Error('Tiled JSON exceeds byte limit');
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error('Invalid Tiled JSON'); }
  if (!record(value) || value.type !== 'map' || value.orientation !== 'orthogonal' || value.infinite !== false
    || !integer(value.width, 1, MAX_MAP_SIDE) || !integer(value.height, 1, MAX_MAP_SIDE)
    || !integer(value.tilewidth, 1, 512) || value.tileheight !== value.tilewidth) throw new Error('Unsupported Tiled map');
  const width = value.width;
  const height = value.height;
  const cells = width * height;
  if (!Array.isArray(value.tilesets) || value.tilesets.length < 1 || value.tilesets.length > MAX_TILESETS) {
    throw new Error('Invalid Tiled tilesets');
  }
  const ranges: Readonly<{ start: number; end: number }>[] = value.tilesets.map((tileset: unknown) => {
    if (!record(tileset) || 'source' in tileset || !integer(tileset.firstgid, 1, MAX_GID)
      || !integer(tileset.tilecount, 1, MAX_GID) || tileset.firstgid + tileset.tilecount - 1 > MAX_GID) {
      throw new Error('External or invalid Tiled tileset');
    }
    return { start: tileset.firstgid, end: tileset.firstgid + tileset.tilecount - 1 };
  });
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i]!.start <= ranges[i - 1]!.end) throw new Error('Overlapping or unordered Tiled tilesets');
  }
  if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > MAX_TILED_LAYERS) {
    throw new Error('Invalid Tiled layer count');
  }
  const names = new Set<string>();
  const layers = value.layers.map((layer: unknown): Readonly<{ name: string; data: readonly number[] }> => {
    const aligned = record(layer) && ['x', 'y', 'offsetx', 'offsety', 'startx', 'starty']
      .every((key) => !(key in layer) || layer[key] === 0);
    if (!record(layer) || layer.type !== 'tilelayer' || typeof layer.name !== 'string'
      || layer.name.length < 1 || layer.name.length > 64 || names.has(layer.name)
      || layer.width !== width || layer.height !== height || !aligned || 'chunks' in layer
      || 'encoding' in layer || 'compression' in layer || !Array.isArray(layer.data)
      || layer.data.length !== cells) throw new Error('Unsupported Tiled layer');
    names.add(layer.name);
    const data = layer.data.map((gid: unknown): number => {
      if (!integer(gid, 0, MAX_GID) || (gid !== 0 && !ranges.some((range) => gid >= range.start && gid <= range.end))) {
        throw new Error('Invalid or unsupported Tiled GID');
      }
      return gid;
    });
    return Object.freeze({ name: layer.name, data: Object.freeze(data) });
  });
  const blocked = layers.find((layer) => layer.name === 'nav-blocked')?.data;
  const occluders = layers.find((layer) => layer.name === 'vision-opaque')?.data;
  return Object.freeze({
    width, height, cellSize: value.tilewidth,
    layers: Object.freeze(layers),
    walkable: Object.freeze(Array.from({ length: cells }, (_, index) => (blocked?.[index] ?? 0) === 0)),
    opaque: Object.freeze(Array.from({ length: cells }, (_, index) => (occluders?.[index] ?? 0) !== 0)),
  });
}
