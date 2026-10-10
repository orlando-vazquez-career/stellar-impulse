import { cellToIso } from './isometric';
import type { GridPoint } from './grid';

/** Half axes, in world pixels, of the clickable ellipse over a command base's hull. */
export const BASE_PICK_HALF_WIDTH = 52;
export const BASE_PICK_HALF_HEIGHT = 30;

export type PickedBase = 'own' | 'enemy';

/**
 * Which command base a world point falls on, if any: an ellipse centred on the projected centre of the
 * base cell. `own` is the player's base wherever it sits (bases.p1 or bases.p2); `enemy` is passed only
 * while that base can be targeted, so without it nothing on the enemy side can be picked. When the two
 * ellipses overlap the nearer centre wins.
 */
export function pickBase(
  worldPoint: { x: number; y: number },
  bases: { own?: GridPoint; enemy?: GridPoint },
  project: (x: number, y: number) => { x: number; y: number } = cellToIso,
): PickedBase | null {
  let picked: PickedBase | null = null;
  let nearest = 1;
  for (const side of ['enemy', 'own'] as const) {
    const cell = bases[side];
    if (!cell) continue;
    const center = project(cell.x, cell.y);
    const distance = ((worldPoint.x - center.x) / BASE_PICK_HALF_WIDTH) ** 2 + ((worldPoint.y - center.y) / BASE_PICK_HALF_HEIGHT) ** 2;
    if (distance <= nearest) { picked = side; nearest = distance; }
  }
  return picked;
}
