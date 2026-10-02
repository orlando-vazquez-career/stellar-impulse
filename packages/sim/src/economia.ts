import type { PlayerId, Position, UnitKind } from './index.js';

/** Prototype economy. Values are playtest candidates, not validated balance (D03). */
export const UNIT_COSTS: Readonly<Record<UnitKind, number>> = Object.freeze({
  explorer: 4, interceptor: 6, frigate: 9, bomber: 12,
});
/** Ticks at 10 Hz from order to launch. */
export const BUILD_TICKS: Readonly<Record<UnitKind, number>> = Object.freeze({
  explorer: 30, interceptor: 40, frigate: 60, bomber: 80,
});
/** Live squads per player, including the starting fleet. */
export const FLEET_CAP = 12;
/** The invulnerable base always yields 1 Metal every this many ticks. */
export const BASE_INCOME_TICKS = 20;
/** Ships this close to their own base repair 1 HP per second. */
export const REPAIR_RADIUS = 2;
export const STARTING_METAL = 6;

export interface ProductionOrder {
  kind: UnitKind;
  readyTick: number;
}

export type ProductionState = Record<PlayerId, ProductionOrder | null>;

/** Nearest free walkable cell to the base, scanning rings outward; null when the hangar is blocked. */
export function launchCell(
  base: Position, width: number, height: number,
  open: (cell: Position) => boolean, taken: (cell: Position) => boolean,
): Position | null {
  for (let radius = 0; radius <= 4; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const cell = { x: base.x + dx, y: base.y + dy };
        if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
        if (open(cell) && !taken(cell)) return cell;
      }
    }
  }
  return null;
}
