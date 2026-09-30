import type { GridPoint } from './grid';

export const BASE_CELLS = {
  blue: { x: 5, y: 90 },
  red: { x: 90, y: 5 },
} as const;
export const BASE_FOOTPRINT: readonly GridPoint[] = Object.values(BASE_CELLS).flatMap((center) => {
  const cells: GridPoint[] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) cells.push({ x: center.x + dx, y: center.y + dy });
  return cells;
});

/** Symmetric fixed terrain in the enlarged visual sector. */
const rockSeeds: readonly GridPoint[] = [
  { x: 50, y: 46 }, { x: 51, y: 46 }, { x: 51, y: 47 },
  { x: 37, y: 58 }, { x: 38, y: 58 }, { x: 38, y: 59 },
  { x: 28, y: 52 }, { x: 29, y: 52 }, { x: 29, y: 53 },
  { x: 41, y: 65 }, { x: 42, y: 65 }, { x: 41, y: 66 },
  { x: 22, y: 37 }, { x: 23, y: 37 }, { x: 22, y: 38 },
  { x: 34, y: 44 }, { x: 35, y: 44 }, { x: 34, y: 45 },
  { x: 56, y: 70 }, { x: 57, y: 70 },
];
export const ASTEROIDS: readonly GridPoint[] = rockSeeds.flatMap(({ x, y }) => [{ x, y }, { x: y, y: x }]);
export const BLOCKING_TERRAIN: readonly GridPoint[] = [...ASTEROIDS, ...BASE_FOOTPRINT];
