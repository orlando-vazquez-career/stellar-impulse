import { GRID_COLUMNS, GRID_ROWS, type GridPoint } from './grid';
import { findPath } from '@impulso/state';

const ARRIVAL_EPSILON = 0.02;
const OCCUPIED_RADIUS = 0.7;

function inBounds(point: GridPoint) {
  return point.x >= 0 && point.y >= 0 && point.x <= GRID_COLUMNS - 1 && point.y <= GRID_ROWS - 1;
}

function clearSegment(start: GridPoint, target: GridPoint, occupied: GridPoint[]) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  return occupied.every((obstacle) => {
    const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((obstacle.x - start.x) * dx + (obstacle.y - start.y) * dy) / lengthSquared));
    return Math.hypot(start.x + dx * projection - obstacle.x, start.y + dy * projection - obstacle.y) >= OCCUPIED_RADIUS;
  });
}

export function planFreeMove(start: GridPoint, target: GridPoint, occupied: GridPoint[]): GridPoint[] {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)
    || !inBounds(target)
    || Math.hypot(target.x - start.x, target.y - start.y) <= ARRIVAL_EPSILON
    || occupied.some((point) => Math.hypot(target.x - point.x, target.y - point.y) < OCCUPIED_RADIUS)) return [];
  if (clearSegment(start, target, occupied)) return [{ ...start }, { ...target }];

  // Search the grid once, then remove unnecessary waypoints to keep free-angle travel.
  const cells = findPath(
    { x: Math.round(start.x), y: Math.round(start.y) },
    { x: Math.round(target.x), y: Math.round(target.y) },
    GRID_COLUMNS, GRID_ROWS, occupied,
  );
  if (!cells.length) return [];
  const points = [start, ...cells.slice(1, -1), target];
  const route: GridPoint[] = [{ ...start }];
  for (let anchor = 0; anchor < points.length - 1;) {
    let next = points.length - 1;
    while (next > anchor && !clearSegment(points[anchor]!, points[next]!, occupied)) next -= 1;
    if (next === anchor) return [];
    route.push({ ...points[next]! });
    anchor = next;
  }
  return route;
}

export function advanceFreeMove(route: GridPoint[], distance: number): GridPoint[] {
  if (route.length < 2 || distance <= 0) return route;
  let remaining = distance;
  let current = route[0]!;
  let index = 1;
  while (index < route.length) {
    const target = route[index]!;
    const length = Math.hypot(target.x - current.x, target.y - current.y);
    if (length > remaining) {
      const ratio = remaining / length;
      return [{ x: current.x + (target.x - current.x) * ratio, y: current.y + (target.y - current.y) * ratio }, ...route.slice(index)];
    }
    remaining -= length;
    current = target;
    index += 1;
  }
  return [current];
}
