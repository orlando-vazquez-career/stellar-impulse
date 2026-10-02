import mapa from '../tiled-maps/espiral-estelar/espiral-estelar.json';
import type { SectorLeido } from './leer-tiled.js';

const WALKABLE_TERRAIN = new Set(['empty', 'nebula', 'boost', 'slow']);
const FLIP_MASK = 0x1fffffff;
const MAX_SIDE = 128;

interface Mark {
  kind: string;
  x: number;
  y: number;
  props: Record<string, unknown>;
}

/** Reads the logic layer only: open ground can be walked, asteroid and blocked cannot. */
export function leerEspiral(source: unknown): SectorLeido {
  const map = record(source);
  const width = side(map.width);
  const height = side(map.height);
  const tileSize = side(map.tileheight);
  const terrain = readTerrain(map, width * height);
  const marks = readMarks(map, tileSize);
  const pilar = only(marks.filter((mark) => mark.kind === 'pilar'), 'pilar');
  const walkable = terrain.map((kind) => WALKABLE_TERRAIN.has(kind));
  walkable[pilar.y * width + pilar.x] = true;
  const bases = {
    p1: cellOf(only(marks.filter((mark) => mark.kind === 'spawn' && mark.props.owner === 1), 'spawn 1')),
    p2: cellOf(only(marks.filter((mark) => mark.kind === 'spawn' && mark.props.owner === 2), 'spawn 2')),
  };
  const core = cellOf(pilar);
  const metals = marks.filter((mark) => mark.kind === 'recurso').sort(byMark).map(cellOf);
  const captures = marks.filter((mark) => mark.kind === 'pronexo').sort(byMark).map(cellOf);
  if (metals.length === 0 || captures.length === 0) throw new Error('Missing map objectives');
  for (const cell of [bases.p1, bases.p2, core, ...metals, ...captures]) {
    if (walkable[cell.y * width + cell.x] !== true) throw new Error('Objective is not walkable');
  }
  return {
    width, height, walkable, level: terrain.map(() => 0), ramp: terrain.map(() => null),
    bases, core, metals, captures,
  };
}

export const ESPIRAL = leerEspiral(mapa);

function readTerrain(map: Record<string, unknown>, cells: number): string[] {
  const lookup = terrainByGid(map.tilesets);
  const data = layerData(map, 'logica');
  if (data.length !== cells) throw new Error('Invalid tiled layer');
  return data.map((gid) => lookup.get(gid & FLIP_MASK) ?? 'empty');
}

function terrainByGid(value: unknown): Map<number, string> {
  const lookup = new Map<number, string>();
  for (const tileset of list(value)) {
    const source = record(tileset);
    if (source.source) throw new Error('Invalid tiled map');
    const firstGid = side(source.firstgid);
    for (const tile of list(source.tiles ?? [])) {
      const face = record(tile);
      const id = nonNegative(face.id);
      const terrain = property(face.properties, 'terrain');
      if (typeof terrain === 'string') lookup.set(firstGid + id, terrain);
    }
  }
  return lookup;
}

function readMarks(map: Record<string, unknown>, tileSize: number): Mark[] {
  const layer = record(findLayer(map, 'objetos'));
  return list(layer.objects ?? []).map((object) => {
    const source = record(object);
    const kind = source.type || source.class;
    if (typeof kind !== 'string' || kind.length === 0) throw new Error('Invalid map marker');
    return {
      kind,
      x: Math.floor(pixel(source.x) / tileSize),
      y: Math.floor(pixel(source.y) / tileSize),
      props: Object.fromEntries(list(source.properties ?? []).map((entry) => {
        const property = record(entry);
        if (typeof property.name !== 'string') throw new Error('Invalid tile property');
        return [property.name, property.value];
      })),
    };
  });
}

function layerData(map: Record<string, unknown>, name: string): number[] {
  const layer = record(findLayer(map, name));
  return list(layer.data).map((gid) => {
    if (typeof gid !== 'number' || !Number.isSafeInteger(gid) || gid < 0) throw new Error('Invalid tiled layer');
    return gid;
  });
}

function findLayer(map: Record<string, unknown>, name: string): unknown {
  const layer = list(map.layers).find((candidate) => record(candidate).name === name);
  if (!layer) throw new Error('Invalid tiled layer');
  return layer;
}

function property(value: unknown, name: string): unknown {
  for (const entry of list(value ?? [])) {
    const source = record(entry);
    if (source.name === name) return source.value;
  }
  return undefined;
}

function only(marks: Mark[], name: string): Mark {
  const mark = marks[0];
  if (marks.length !== 1 || !mark) throw new Error(`Missing map symbol ${name}`);
  return mark;
}

function cellOf(mark: Mark): { x: number; y: number } {
  return { x: mark.x, y: mark.y };
}

function byMark(left: Mark, right: Mark): number {
  const leftIndex = typeof left.props.index === 'number' ? left.props.index : 0;
  const rightIndex = typeof right.props.index === 'number' ? right.props.index : 0;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return left.y - right.y || left.x - right.x;
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
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_SIDE) {
    throw new Error('Invalid tiled map');
  }
  return value;
}

function pixel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid map marker');
  return value;
}

function nonNegative(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid tiled map');
  return value;
}
