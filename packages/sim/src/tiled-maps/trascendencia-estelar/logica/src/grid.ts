export interface TileCoord {
  readonly x: number;
  readonly y: number;
}

export interface GridSize {
  readonly width: number;
  readonly height: number;
}

export const ORTHOGONAL_STEP_COST = 1000;
export const DIAGONAL_STEP_COST = 1414;

export const NEIGHBOR_OFFSETS: readonly TileCoord[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 },
];

export function tileIndex(size: GridSize, tile: TileCoord): number {
  return tile.y * size.width + tile.x;
}

export function tileFromIndex(size: GridSize, index: number): TileCoord {
  return { x: index % size.width, y: Math.floor(index / size.width) };
}

export function isInside(size: GridSize, tile: TileCoord): boolean {
  return tile.x >= 0 && tile.y >= 0 && tile.x < size.width && tile.y < size.height;
}

export function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function addOffset(tile: TileCoord, offset: TileCoord): TileCoord {
  return { x: tile.x + offset.x, y: tile.y + offset.y };
}

export function squaredDistance(a: TileCoord, b: TileCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function isDiagonalStep(from: TileCoord, to: TileCoord): boolean {
  return from.x !== to.x && from.y !== to.y;
}

export function stepCost(from: TileCoord, to: TileCoord): number {
  return isDiagonalStep(from, to) ? DIAGONAL_STEP_COST : ORTHOGONAL_STEP_COST;
}

export function octileDistance(a: TileCoord, b: TileCoord): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const diagonal = Math.min(dx, dy);
  return diagonal * DIAGONAL_STEP_COST + (Math.max(dx, dy) - diagonal) * ORTHOGONAL_STEP_COST;
}

/** Desplazamientos dentro de un radio, del más cercano al más lejano, en orden estable. */
export function offsetsByDistance(radius: number): TileCoord[] {
  const origin = { x: 0, y: 0 };
  const offsets: TileCoord[] = [];
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) offsets.push({ x, y });
    }
  }
  return offsets.sort((a, b) => squaredDistance(a, origin) - squaredDistance(b, origin) || a.y - b.y || a.x - b.x);
}
