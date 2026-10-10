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

export type BaseUpgradeKind = 'damage' | 'capacity';
export interface BaseUpgrades { damage: number; capacity: number }
export const MAX_BASE_UPGRADE_LEVEL = 3;
export const BASE_DEFENSE_RANGE = 4;
export const CAPACITY_PER_LEVEL = 4;
export const BASE_DAMAGE_PER_LEVEL = 10;
export function baseUpgradeCost(kind: BaseUpgradeKind, upgrades?: BaseUpgrades): number | null {
  const level = upgrades?.[kind] ?? 0;
  return level >= MAX_BASE_UPGRADE_LEVEL ? null : (kind === 'damage' ? 12 : 10) * (level + 1);
}
export const fleetCapacity = (upgrades?: BaseUpgrades): number => FLEET_CAP + (upgrades?.capacity ?? 0) * CAPACITY_PER_LEVEL;
export const baseDamage = (upgrades?: BaseUpgrades): number => (upgrades?.damage ?? 0) * BASE_DAMAGE_PER_LEVEL;

/** The ship a hangar is building. */
export interface ProductionOrder {
  kind: UnitKind;
  readyTick: number;
  /** Ticks from start to launch, with the Shipyard and fast builds that were in force when it started. */
  totalTicks: number;
  /** Metal charged when the order was placed: cancelling it gives back exactly this. */
  paid: number;
}
/** A paid order waiting for the hangar. It is built, and its build time fixed, only when its turn comes. */
export interface QueuedOrder {
  kind: UnitKind;
  paid: number;
}

export type ProductionState = Record<PlayerId, ProductionOrder | null>;
export type ProductionQueue = Record<PlayerId, QueuedOrder[]>;

/**
 * Nearest free walkable cell to the base, scanning rings outward from `minRadius`; null when the hangar is blocked.
 * Hangars launch from ring 1 and station docks from ring 2, so no ship is born inside a hull.
 * With `toward` (the Core), each ring is tried nearest to it first, so mirrored bases launch at the same
 * distance from it whichever side they are on; equally near cells keep the row-by-row scan order.
 */
export function launchCell(
  base: Position, width: number, height: number,
  open: (cell: Position) => boolean, taken: (cell: Position) => boolean, minRadius = 0, toward?: Position,
): Position | null {
  for (let radius = minRadius; radius <= 4; radius += 1) {
    const ring: Position[] = [];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const cell = { x: base.x + dx, y: base.y + dy };
        if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
        ring.push(cell);
      }
    }
    if (toward) {
      const near = (cell: Position) => (cell.x - toward.x) ** 2 + (cell.y - toward.y) ** 2;
      ring.sort((a, b) => near(a) - near(b));
    }
    const cell = ring.find((candidate) => open(candidate) && !taken(candidate));
    if (cell) return cell;
  }
  return null;
}
