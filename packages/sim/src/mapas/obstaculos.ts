import { randomFor } from '../augments/random.js';

/** Art (a file of the map's `tilesets/img`) and blocked radius, in cells, of each obstacle model. */
export const OBSTACLE_MODELS = Object.freeze({
  nave_destruida_1: 2,
  estacion_rota: 1.5,
  nave_destruida_2: 1.5,
  cristales: 1,
  satelite: 0.5,
});
export type ObstacleModel = keyof typeof OBSTACLE_MODELS;
const MODEL_ORDER = Object.keys(OBSTACLE_MODELS) as ObstacleModel[];

/** One `OBSTACLE_RING` point of the map: where its art stands and the cells no ship can enter. */
export interface MapObstacle {
  id: number;
  /** Tiled cell units (pixels / tile height), fractional. */
  x: number;
  y: number;
  model: ObstacleModel;
  cells: { x: number; y: number }[];
}

export function isObstacleModel(value: unknown): value is ObstacleModel {
  return typeof value === 'string' && Object.hasOwn(OBSTACLE_MODELS, value);
}

/** Points without a `modelo` property take turns through the catalog, by object id. */
export function defaultObstacleModel(id: number): ObstacleModel {
  return MODEL_ORDER[id % MODEL_ORDER.length]!;
}

/** Cells whose centre lies within the radius of the point, and always the point's own cell. */
export function obstacleCells(x: number, y: number, radius: number, width: number, height: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let cy = Math.floor(y - radius); cy <= Math.floor(y + radius); cy += 1) {
    for (let cx = Math.floor(x - radius); cx <= Math.floor(x + radius); cx += 1) {
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
      const own = cx === Math.floor(x) && cy === Math.floor(y);
      if (own || Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= radius) cells.push({ x: cx, y: cy });
    }
  }
  return cells;
}

export interface ObstacleArea { id: number; x: number; y: number; width: number; height: number }

/**
 * Furnish an `OBSTACLE_RING` rectangle: obstacles scattered over its open floor, one free cell apart so the
 * area hinders ships without becoming a wall. The layout depends only on the rectangle, never on the match.
 * `accept` sees the cells an obstacle would close and may refuse it.
 */
export function scatterObstacles(input: {
  area: ObstacleArea; width: number; height: number;
  open(x: number, y: number): boolean;
  placed: readonly MapObstacle[];
  accept(cells: readonly { x: number; y: number }[]): boolean;
}): MapObstacle[] {
  const { area } = input;
  const inside = (x: number, y: number) => x + 1 > area.x && x < area.x + area.width && y + 1 > area.y && y < area.y + area.height;
  const rng = randomFor(area.id, 'obstacle-area');
  const spots: { x: number; y: number }[] = [];
  for (let y = Math.floor(area.y); y < area.y + area.height; y += 1) for (let x = Math.floor(area.x); x < area.x + area.width; x += 1) {
    if (x >= 0 && y >= 0 && x < input.width && y < input.height && inside(x, y) && input.open(x, y)) spots.push({ x: x + 0.5, y: y + 0.5 });
  }
  for (let index = spots.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [spots[index], spots[other]] = [spots[other]!, spots[index]!];
  }
  // Big wrecks only where the rectangle has room for them.
  const fitting = MODEL_ORDER.filter((model) => OBSTACLE_MODELS[model] * 2 <= Math.max(1, Math.min(area.width, area.height)));
  const added: MapObstacle[] = [];
  const radiusOf = (obstacle: MapObstacle) => OBSTACLE_MODELS[obstacle.model];
  for (const spot of spots) {
    const model = fitting[Math.floor(rng() * fitting.length)] ?? 'satelite';
    const radius = OBSTACLE_MODELS[model];
    const crowded = [...input.placed, ...added].some((other) => Math.hypot(other.x - spot.x, other.y - spot.y) < radius + radiusOf(other) + 1);
    if (crowded) continue;
    const cells = obstacleCells(spot.x, spot.y, radius, input.width, input.height).filter((cell) => inside(cell.x, cell.y) && input.open(cell.x, cell.y));
    if (cells.length === 0 || !input.accept(cells)) continue;
    added.push({ id: area.id * 1000 + added.length, x: spot.x, y: spot.y, model, cells });
  }
  return added;
}
