import type { GridPoint } from './grid';
import { advanceFreeMove } from './free-movement';

export const SHIP_SPACING = 0.9;
export const CRUISE_SPEED = 1.7;
const ACCELERATION = 5;

/** Ramp up over a few frames and brake near arrival. Cap stalls to avoid teleporting. */
export function advanceShip(route: GridPoint[], speed: number, maxSpeed: number, elapsedMs: number,
  occupied: GridPoint[]): { route: GridPoint[]; speed: number; blocked: boolean } {
  const seconds = Math.min(100, Math.max(0, elapsedMs)) / 1000;
  const remaining = route.slice(1).reduce((sum, point, index) =>
    sum + Math.hypot(point.x - route[index]!.x, point.y - route[index]!.y), 0);
  if (route.length < 2 || seconds === 0) return { route, speed: 0, blocked: false };
  const desired = Math.min(maxSpeed, Math.sqrt(2 * ACCELERATION * remaining));
  const nextSpeed = speed + Math.max(-ACCELERATION * seconds, Math.min(ACCELERATION * seconds, desired - speed));
  let next = route;
  let distance = Math.min(remaining, (speed + nextSpeed) * seconds / 2);
  // Small swept steps also check bends in a route; a delayed frame cannot tunnel through a ship.
  while (distance > 0.000001) {
    const step = Math.min(0.02, distance);
    const candidate = advanceFreeMove(next, step);
    if (occupied.some((point) => Math.hypot(candidate[0]!.x - point.x, candidate[0]!.y - point.y) < SHIP_SPACING))
      return { route: next, speed: 0, blocked: true };
    next = candidate;
    distance -= step;
  }
  // Finish the last millimetres instead of asymptotically braking forever.
  if (next.length > 1 && Math.hypot(next[1]!.x - next[0]!.x, next[1]!.y - next[0]!.y) < 0.005
    && next.length === 2 && occupied.every((point) => Math.hypot(next[1]!.x - point.x, next[1]!.y - point.y) >= SHIP_SPACING))
    next = [next[1]!];
  return { route: next, speed: next.length === 1 ? 0 : nextSpeed, blocked: false };
}
