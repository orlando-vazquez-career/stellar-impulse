import { MAX_MAP_SIDE, type MapCell, type MapSpec } from './types.js';

export type VisionMap = Pick<MapSpec, 'width' | 'height' | 'opaque'>;

/** Limit work per vision source, even on the largest catalog map. */
export const MAX_VISIBILITY_RADIUS = 32;

interface Slope { numerator: number; denominator: number }
interface Row { depth: number; start: Slope; end: Slope }

const inBounds = (map: VisionMap, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < map.width && y < map.height;

const cellIndex = (map: VisionMap, x: number, y: number): number => y * map.width + x;

/** Exact tie rules avoid floating-point disagreement between opposite viewpoints. */
const firstColumn = (depth: number, slope: Slope): number =>
  Math.floor((2 * depth * slope.numerator + slope.denominator) / (2 * slope.denominator));
const lastColumn = (depth: number, slope: Slope): number =>
  Math.ceil((2 * depth * slope.numerator - slope.denominator) / (2 * slope.denominator));
const edgeSlope = (depth: number, column: number): Slope =>
  ({ numerator: 2 * column - 1, denominator: 2 * depth });
const isSymmetric = (row: Row, column: number): boolean =>
  column * row.start.denominator >= row.depth * row.start.numerator
  && column * row.end.denominator <= row.depth * row.end.numerator;

function transform(origin: MapCell, quadrant: number, depth: number, column: number): MapCell {
  switch (quadrant) {
    case 0: return { x: origin.x + column, y: origin.y - depth };
    case 1: return { x: origin.x + depth, y: origin.y + column };
    case 2: return { x: origin.x + column, y: origin.y + depth };
    default: return { x: origin.x - depth, y: origin.y + column };
  }
}

/**
 * Symmetric shadowcasting on static row-major blockers, clipped to Manhattan radius.
 * Based on Albert Ford's CC0 algorithm: https://www.albertford.com/shadowcasting/
 * Opaque cells are visible and block cells behind them. A source in an opaque cell
 * sees only itself. Corners use the diamond-wall policy: a diagonal floor may
 * remain visible between two orthogonally adjacent opaque cells. This does not
 * permit diagonal movement: movement still uses four neighbors. Symmetry is
 * guaranteed between non-opaque cells; the origin policy intentionally excludes
 * opaque sources from that guarantee.
 */
export function computeVisibility(map: VisionMap, sources: readonly MapCell[], radius: number): boolean[] {
  if (!Number.isSafeInteger(map.width) || !Number.isSafeInteger(map.height)
    || map.width < 1 || map.height < 1 || map.width > MAX_MAP_SIDE || map.height > MAX_MAP_SIDE
    || map.opaque.length !== map.width * map.height) throw new Error('Invalid vision map');
  if (!Number.isSafeInteger(radius) || radius < 0 || radius > MAX_VISIBILITY_RADIUS) throw new Error('Invalid vision radius');

  const visible = Array<boolean>(map.width * map.height).fill(false);
  const scanned = new Set<number>();
  for (const source of sources) {
    if (!Number.isSafeInteger(source.x) || !Number.isSafeInteger(source.y) || !inBounds(map, source.x, source.y)) {
      throw new Error('Invalid vision source');
    }
    const originIndex = cellIndex(map, source.x, source.y);
    visible[originIndex] = true;
    if (scanned.has(originIndex) || map.opaque[originIndex] || radius === 0) continue;
    scanned.add(originIndex);

    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const rows: Row[] = [{ depth: 1, start: { numerator: -1, denominator: 1 }, end: { numerator: 1, denominator: 1 } }];
      while (rows.length > 0) {
        const row = rows.pop()!;
        if (row.depth > radius) continue;
        let previousWall: boolean | null = null;
        let start = row.start;
        for (let column = firstColumn(row.depth, start); column <= lastColumn(row.depth, row.end); column += 1) {
          const cell = transform(source, quadrant, row.depth, column);
          const inside = inBounds(map, cell.x, cell.y);
          const wall = !inside || map.opaque[cellIndex(map, cell.x, cell.y)] === true;
          if (inside && Math.abs(cell.x - source.x) + Math.abs(cell.y - source.y) <= radius
            && (wall || isSymmetric({ depth: row.depth, start, end: row.end }, column))) {
            visible[cellIndex(map, cell.x, cell.y)] = true;
          }
          if (previousWall === true && !wall) start = edgeSlope(row.depth, column);
          if (previousWall === false && wall) {
            rows.push({ depth: row.depth + 1, start, end: edgeSlope(row.depth, column) });
          }
          previousWall = wall;
        }
        if (previousWall === false) rows.push({ depth: row.depth + 1, start, end: row.end });
      }
    }
  }
  return visible;
}

/** A fresh knowledge mask; neither the previous mask nor this tick's view is mutated. */
export function unionExplored(previous: readonly boolean[], visible: readonly boolean[]): boolean[] {
  if (previous.length !== visible.length) throw new Error('Mismatched visibility masks');
  return previous.map((seen, index) => seen || visible[index] === true);
}
