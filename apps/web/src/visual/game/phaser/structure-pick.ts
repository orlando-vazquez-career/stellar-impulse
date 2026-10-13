import { cellToIso } from './isometric';
import type { GridPoint } from './grid';

/** Half axes, in world pixels, of the clickable ellipse over a command base's hull. */
export const BASE_PICK_HALF_WIDTH = 52;
export const BASE_PICK_HALF_HEIGHT = 30;
/** Half axes of a station's clickable dock, matching the six-sided hull drawn on the map. */
export const STATION_PICK_HALF_WIDTH = 42;
export const STATION_PICK_HALF_HEIGHT = 22;
export const STATION_PICK_Y_OFFSET = 9;

export type PickedBase = 'own' | 'enemy';

/**
 * Which command base a world point falls on, if any: an ellipse centred on the projected centre of the
 * base cell. `own` is the player's base wherever it sits (bases.p1 or bases.p2); `enemy` is passed only
 * while that base can be targeted, so without it nothing on the enemy side can be picked.
 *
 * Contract for the scene: the result is null when the point is outside every ellipse that was passed.
 * A missing `enemy` does not turn the whole pick off: the player's own base stays pickable while the
 * rival one is hidden by the fog, which is most of the match. When the two ellipses overlap the nearer
 * centre wins, and an exact tie goes to `enemy`, because picking it is the attack order.
 */
export function pickBase(
  worldPoint: { x: number; y: number },
  bases: { own?: GridPoint; enemy?: GridPoint },
  project: (x: number, y: number) => { x: number; y: number } = cellToIso,
): PickedBase | null {
  let picked: PickedBase | null = null;
  let nearest = 1;
  // `enemy` goes last so that, at the same distance, it replaces `own`.
  for (const side of ['own', 'enemy'] as const) {
    const cell = bases[side];
    if (!cell) continue;
    const center = project(cell.x, cell.y);
    const distance = ((worldPoint.x - center.x) / BASE_PICK_HALF_WIDTH) ** 2 + ((worldPoint.y - center.y) / BASE_PICK_HALF_HEIGHT) ** 2;
    if (distance <= nearest) { picked = side; nearest = distance; }
  }
  return picked;
}

/** Pick the nearest visible station dock under a world point; stale fog-memory entries are excluded by the caller. */
export function pickStation(
  worldPoint: { x: number; y: number },
  stations: readonly { id: string; x: number; y: number }[],
  project: (x: number, y: number) => { x: number; y: number } = cellToIso,
): string | null {
  let picked: string | null = null;
  let nearest = 1;
  for (const station of stations) {
    const center = project(station.x, station.y);
    const distance = ((worldPoint.x - center.x) / STATION_PICK_HALF_WIDTH) ** 2
      + ((worldPoint.y - center.y - STATION_PICK_Y_OFFSET) / STATION_PICK_HALF_HEIGHT) ** 2;
    if (distance <= nearest) { picked = station.id; nearest = distance; }
  }
  return picked;
}
