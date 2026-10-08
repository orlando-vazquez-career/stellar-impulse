import mapa from '../tiled-maps/espiral-estelar/espiral-estelar.json';
import type { SectorLeido } from './leer-tiled.js';
import type { DropZoneSpec } from '../mecanicas/satellites.js';
import type { NebulaCloudSpec, NebulaSpec } from '../mecanicas/nebulosas.js';
import { defaultObstacleModel, isObstacleModel, obstacleCells, OBSTACLE_MODELS, scatterObstacles, type MapObstacle, type ObstacleArea } from './obstaculos.js';
import { isLogicaTilesetSource, LOGICA_TERRAIN_BY_TILE_ID } from './tsx-tileset.js';

const WALKABLE_TERRAIN = new Set(['empty', 'nebula', 'boost', 'slow']);
const GAMEPLAY_MARKER_KINDS = new Set(['spawn', 'pilar', 'recurso', 'pronexo']);
const FLIP_MASK = 0x1fffffff;
const MAX_SIDE = 128;
const MAX_CAPTURE_RADIUS = 8;
const MAX_DROP_GROUPS = 8;
const MAX_CLOUD_ROUTES = 4;

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
  const bases = {
    p1: cellOf(only(marks.filter((mark) => mark.kind === 'spawn' && mark.props.owner === 1), 'spawn 1')),
    p2: cellOf(only(marks.filter((mark) => mark.kind === 'spawn' && mark.props.owner === 2), 'spawn 2')),
  };
  const core = cellOf(pilar);
  const metals = marks.filter((mark) => mark.kind === 'recurso').sort(byMark).map(cellOf);
  const captures = marks.filter((mark) => mark.kind === 'pronexo').sort(byMark).map(captureOf);
  if (metals.length === 0 || captures.length === 0) throw new Error('Missing map objectives');
  const goals = [bases.p1, bases.p2, core, ...metals, ...captures];
  const obstaculos = readObstacles(map, tileSize, width, height);
  for (const obstacle of obstaculos) for (const cell of obstacle.cells) walkable[cell.y * width + cell.x] = false;
  for (const cell of goals) walkable[cell.y * width + cell.x] = true;
  // Rectangles are furnished after the points, and never at the price of cutting a base off from an objective.
  const reach = () => reachableGoals(walkable, width, height, bases.p1, goals) + reachableGoals(walkable, width, height, bases.p2, goals);
  let reached = reach();
  for (const area of readObstacleAreas(map, tileSize)) {
    obstaculos.push(...scatterObstacles({
      area, width, height, placed: obstaculos,
      open: (x, y) => walkable[y * width + x] === true && !goals.some((goal) => goal.x === x && goal.y === y),
      accept: (cells) => {
        for (const cell of cells) walkable[cell.y * width + cell.x] = false;
        const after = reach();
        if (after >= reached) { reached = after; return true; }
        for (const cell of cells) walkable[cell.y * width + cell.x] = true;
        return false;
      },
    }));
  }
  const nebula = readNebula(map, terrain, tileSize, width, height);
  return {
    width, height, walkable, level: terrain.map(() => 0), ramp: terrain.map(() => null),
    bases, core, metals, captures, dropZones: readDropZones(map, tileSize, width, height), obstaculos,
    ...(nebula ? { nebula } : {}),
  };
}

export const ESPIRAL = leerEspiral(mapa);

/** A pronexo may carry `radio`: the cells around it that count as its capture area. */
function captureOf(mark: Mark): { x: number; y: number; radius?: number } {
  const radius = mark.props.radio;
  if (radius === undefined) return cellOf(mark);
  if (typeof radius !== 'number' || !Number.isSafeInteger(radius) || radius < 1 || radius > MAX_CAPTURE_RADIUS) throw new Error('Invalid map marker');
  return { ...cellOf(mark), radius };
}

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
    const firstGid = side(source.firstgid);
    if (source.source) {
      if (isLogicaTilesetSource(source.source)) applyLogicaTerrains(lookup, firstGid);
      continue;
    }
    for (const tile of list(source.tiles ?? [])) {
      const face = record(tile);
      const id = nonNegative(face.id);
      const terrain = property(face.properties, 'terrain');
      if (typeof terrain === 'string') lookup.set(firstGid + id, terrain);
    }
  }
  return lookup;
}

function applyLogicaTerrains(lookup: Map<number, string>, firstGid: number): void {
  LOGICA_TERRAIN_BY_TILE_ID.forEach((terrain, tileId) => lookup.set(firstGid + tileId, terrain));
}

function readMarks(map: Record<string, unknown>, tileSize: number): Mark[] {
  const layer = record(findLayer(map, 'objetos'));
  const marks: Mark[] = [];
  for (const object of list(layer.objects ?? [])) {
    const source = record(object);
    const kind = markerKind(source);
    if (!kind || !GAMEPLAY_MARKER_KINDS.has(kind)) continue;
    marks.push({
      kind,
      x: Math.floor(pixel(source.x) / tileSize),
      y: Math.floor(pixel(source.y) / tileSize),
      props: Object.fromEntries(list(source.properties ?? []).map((entry) => {
        const property = record(entry);
        if (typeof property.name !== 'string') throw new Error('Invalid tile property');
        return [property.name, property.value];
      })),
    });
  }
  return marks;
}

/** `OBSTACLE_RING` objects of any object layer. */
function obstacleMarks(map: Record<string, unknown>): Record<string, unknown>[] {
  return list(map.layers).flatMap((layer) => list(record(layer).objects ?? []).map(record))
    .filter((source) => markerKind(source) === 'OBSTACLE_RING');
}

/** Every `OBSTACLE_RING` point becomes a solid obstacle with the model it names. */
function readObstacles(map: Record<string, unknown>, tileSize: number, width: number, height: number): MapObstacle[] {
  const obstacles: MapObstacle[] = [];
  for (const source of obstacleMarks(map)) {
    if (source.point !== true) continue;
    const id = nonNegative(source.id);
    const x = pixel(source.x) / tileSize, y = pixel(source.y) / tileSize;
    if (x >= width || y >= height) throw new Error('Invalid map marker');
    const chosen = property(source.properties, 'modelo');
    if (chosen !== undefined && !isObstacleModel(chosen)) throw new Error('Unknown obstacle model');
    const model = chosen ?? defaultObstacleModel(id);
    const radius = property(source.properties, 'radio') ?? OBSTACLE_MODELS[model];
    if (typeof radius !== 'number' || !(radius >= 0) || radius > 6) throw new Error('Invalid map marker');
    obstacles.push({ id, x, y, model, cells: obstacleCells(x, y, radius, width, height) });
  }
  return obstacles.sort((a, b) => a.id - b.id);
}

/** `OBSTACLE_RING` shapes with a size (rectangles, ellipses, capsules): areas to fill with obstacles. */
function readObstacleAreas(map: Record<string, unknown>, tileSize: number): ObstacleArea[] {
  const areas: ObstacleArea[] = [];
  for (const source of obstacleMarks(map)) {
    if (source.point === true || typeof source.width !== 'number' || typeof source.height !== 'number') continue;
    if (!(source.width > 0) || !(source.height > 0)) continue;
    areas.push({
      id: nonNegative(source.id), x: pixel(source.x) / tileSize, y: pixel(source.y) / tileSize,
      width: source.width / tileSize, height: source.height / tileSize,
    });
  }
  return areas.sort((a, b) => a.id - b.id);
}

/** How many goals a ship can fly to from a cell. Diagonal steps never cut corners, so four-way flood is exact. */
function reachableGoals(walkable: readonly boolean[], width: number, height: number, from: { x: number; y: number }, goals: readonly { x: number; y: number }[]): number {
  const seen = new Uint8Array(width * height);
  const queue = [from.y * width + from.x];
  seen[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head]!, x = cell % width, y = Math.floor(cell / width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (seen[next] || walkable[next] !== true) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return goals.filter((goal) => seen[goal.y * width + goal.x] === 1).length;
}

function markerKind(source: Record<string, unknown>): string | null {
  for (const value of [source.type, source.class]) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** Optional `eventos` layer: each `zona_caida` rectangle is an area where satellites may fall. */
function readDropZones(map: Record<string, unknown>, tileSize: number, width: number, height: number): DropZoneSpec[] {
  const layer = list(map.layers).find((candidate) => record(candidate).name === 'eventos');
  if (!layer) return [];
  const zones: DropZoneSpec[] = [];
  for (const object of list(record(layer).objects ?? [])) {
    const source = record(object);
    if ((source.type || source.class) !== 'zona_caida') continue;
    const left = Math.max(0, Math.floor(pixel(source.x) / tileSize));
    const top = Math.max(0, Math.floor(pixel(source.y) / tileSize));
    const right = Math.min(width, Math.ceil((pixel(source.x) + pixel(source.width)) / tileSize));
    const bottom = Math.min(height, Math.ceil((pixel(source.y) + pixel(source.height)) / tileSize));
    if (right <= left || bottom <= top) throw new Error('Invalid drop zone');
    const amount = (name: string, fallback: number, max: number) => {
      const value = property(source.properties, name) ?? fallback;
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) throw new Error('Invalid drop zone');
      return value;
    };
    zones.push({
      id: `zona-${nonNegative(source.id)}`, x: left, y: top, width: right - left, height: bottom - top,
      damage: amount('damage', 40, 1000), radius: amount('radius', 1, 4),
      intervalSeconds: amount('intervalSeconds', 45, 3600), warningSeconds: amount('warningSeconds', 4, 60),
      amount: amount('amount', 1, 8),
      ...(property(source.properties, 'grupo') !== undefined ? { group: amount('grupo', 1, MAX_DROP_GROUPS) } : {}),
    });
  }
  return zones.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Purple nebula. With the map property `nebulosaActiva` the nebula cells of the logic layer slow ships and
 * hide them; each `niebla_movil` rectangle of `eventos` is a cloud that leaves its nebula along the
 * `ruta_niebla` polylines that name it (property `niebla`), in the order of their property `orden`.
 */
function readNebula(map: Record<string, unknown>, terrain: readonly string[], tileSize: number, width: number, height: number): NebulaSpec | undefined {
  const active = property(map.properties ?? [], 'nebulosaActiva') === true;
  const layer = list(map.layers).find((candidate) => record(candidate).name === 'eventos');
  const objects = layer ? list(record(layer).objects ?? []).map(record) : [];
  const kind = (source: Record<string, unknown>) => source.type || source.class;
  const routes = objects.filter((source) => kind(source) === 'ruta_niebla');
  const clouds: NebulaCloudSpec[] = [];
  for (const source of objects.filter((candidate) => kind(candidate) === 'niebla_movil')) {
    const name = typeof source.name === 'string' && source.name.length > 0 ? source.name : `niebla-${nonNegative(source.id)}`;
    const size = Math.round(pixel(source.width) / tileSize);
    if (size < 1 || size > 16 || Math.round(pixel(source.height) / tileSize) !== size) throw new Error('Invalid nebula cloud');
    const home = { x: Math.floor((pixel(source.x) + pixel(source.width) / 2) / tileSize), y: Math.floor((pixel(source.y) + pixel(source.height) / 2) / tileSize) };
    if (home.x >= width || home.y >= height) throw new Error('Invalid nebula cloud');
    const number = (field: string, fallback: number, min: number, max: number) => {
      const value = property(source.properties, field) ?? fallback;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid nebula cloud');
      return value;
    };
    const maxCells = number('maxCells', 13, 1, 40);
    const own = routes.filter((route) => property(route.properties, 'niebla') === name)
      .sort((a, b) => Number(property(a.properties, 'orden') ?? 0) - Number(property(b.properties, 'orden') ?? 0) || nonNegative(a.id) - nonNegative(b.id));
    if (own.length === 0 || own.length > MAX_CLOUD_ROUTES) throw new Error('Invalid nebula cloud');
    clouds.push({
      id: name, home, size,
      routes: own.map((route) => walkRoute(route, home, maxCells, tileSize, width, height)),
      cellsPerSecond: number('cellsPerSecond', 1.25, 0.1, 20),
      warningSeconds: number('warningSeconds', 5, 0, 60),
      holdSeconds: number('holdSeconds', 6, 0, 600),
      restSeconds: number('restSeconds', 20, 0, 600),
      startSeconds: number('startSeconds', 30, 0, 3600),
    });
  }
  if (!active && clouds.length === 0) return undefined;
  const settings = (field: string, fallback: number, max: number) => {
    const value = property(map.properties ?? [], field) ?? objects.map((source) => property(source.properties, field)).find((found) => found !== undefined) ?? fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > max) throw new Error('Invalid nebula cloud');
    return value;
  };
  return {
    ...(active ? { cells: terrain.map((kind) => kind === 'nebula') } : {}),
    clouds: clouds.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    slowFactor: settings('slowFactor', 2, 6),
    visionRadius: settings('visionRadius', 2, 8),
  };
}

/** Polyline → cells, one eight-way step at a time from the cloud's home, cut at `maxCells` steps. */
function walkRoute(route: Record<string, unknown>, home: { x: number; y: number }, maxCells: number, tileSize: number, width: number, height: number): { x: number; y: number }[] {
  const originX = Number(route.x), originY = Number(route.y);
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) throw new Error('Invalid nebula route');
  const corners = list(route.polyline).map((entry) => {
    const corner = record(entry);
    const x = Math.floor((originX + Number(corner.x)) / tileSize), y = Math.floor((originY + Number(corner.y)) / tileSize);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('Invalid nebula route');
    return { x: Math.max(0, Math.min(width - 1, x)), y: Math.max(0, Math.min(height - 1, y)) };
  });
  const cells: { x: number; y: number }[] = [];
  let at = { ...home };
  for (const corner of corners) {
    while ((at.x !== corner.x || at.y !== corner.y) && cells.length < maxCells) {
      const dx = corner.x - at.x, dy = corner.y - at.y;
      const along = Math.max(Math.abs(dx), Math.abs(dy));
      // Bresenham-like: diagonal while both axes still need it, straight once one of them is done.
      at = { x: at.x + (Math.abs(dx) * 2 >= along ? Math.sign(dx) : 0), y: at.y + (Math.abs(dy) * 2 >= along ? Math.sign(dy) : 0) };
      cells.push(at);
    }
  }
  if (cells.length === 0) throw new Error('Invalid nebula route');
  return cells;
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
