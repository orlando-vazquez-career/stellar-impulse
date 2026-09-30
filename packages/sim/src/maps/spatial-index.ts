import { MAX_MAP_SIDE, type MapCell, type MapSpec } from './types.js';

export interface SpatialPoint extends MapCell { readonly id: string }
export interface SpatialIndex {
  /** Fresh, immutable result ordered by ID. The index owns coordinate snapshots. */
  queryManhattan(center: MapCell, radius: number): readonly SpatialPoint[];
}

type GridSize = Pick<MapSpec, 'width' | 'height'>;

function validCell(map: GridSize, cell: MapCell): boolean {
  return Number.isSafeInteger(cell.x) && Number.isSafeInteger(cell.y)
    && cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height;
}

/** Build a transient index from current unit/objective positions. No World reference is retained. */
export function createSpatialIndex(map: GridSize, points: readonly SpatialPoint[], bucketSize = 8): SpatialIndex {
  if (!Number.isSafeInteger(map.width) || !Number.isSafeInteger(map.height)
    || map.width < 1 || map.height < 1 || map.width > MAX_MAP_SIDE || map.height > MAX_MAP_SIDE
    || !Number.isSafeInteger(bucketSize) || bucketSize < 1 || bucketSize > MAX_MAP_SIDE) {
    throw new Error('Invalid spatial grid');
  }
  const grid: GridSize = { width: map.width, height: map.height };
  const columns = Math.ceil(grid.width / bucketSize);
  const buckets = new Map<number, SpatialPoint[]>();
  const ids = new Set<string>();
  for (const point of points) {
    if (typeof point.id !== 'string' || point.id.length === 0 || ids.has(point.id) || !validCell(grid, point)) {
      throw new Error('Invalid spatial point');
    }
    ids.add(point.id);
    const snapshot: SpatialPoint = Object.freeze({ id: point.id, x: point.x, y: point.y });
    const bucket = Math.floor(point.y / bucketSize) * columns + Math.floor(point.x / bucketSize);
    const entries = buckets.get(bucket) ?? [];
    entries.push(snapshot);
    buckets.set(bucket, entries);
  }

  return Object.freeze({
    queryManhattan(center: MapCell, radius: number): readonly SpatialPoint[] {
      if (!validCell(grid, center) || !Number.isSafeInteger(radius) || radius < 0 || radius > MAX_MAP_SIDE) {
        throw new Error('Invalid spatial query');
      }
      const minX = Math.floor(Math.max(0, center.x - radius) / bucketSize);
      const maxX = Math.floor(Math.min(grid.width - 1, center.x + radius) / bucketSize);
      const minY = Math.floor(Math.max(0, center.y - radius) / bucketSize);
      const maxY = Math.floor(Math.min(grid.height - 1, center.y + radius) / bucketSize);
      const matches: SpatialPoint[] = [];
      for (let by = minY; by <= maxY; by += 1) {
        for (let bx = minX; bx <= maxX; bx += 1) {
          for (const point of buckets.get(by * columns + bx) ?? []) {
            if (Math.abs(point.x - center.x) + Math.abs(point.y - center.y) <= radius) matches.push(point);
          }
        }
      }
      matches.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      return Object.freeze(matches);
    },
  });
}
