import { terrainAt, type GameMap } from './game-map';
import { addOffset, isInside, offsetsByDistance, squaredDistance, tileIndex, type GridSize, type TileCoord } from './grid';
import { hasLineOfSight } from './line-of-sight';
import { TERRAIN_RULES } from './terrain';

export const Visibility = { Unexplored: 0, Explored: 1, Visible: 2 } as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export interface Observer {
  readonly tile: TileCoord;
  readonly visionRadius: number;
  /** Por ejemplo, el Explorador conserva su visión dentro de la nebulosa. */
  readonly seesThroughNebula?: boolean;
}

const MIN_VISION_RADIUS = 1;
const ADJACENT_SQUARED_DISTANCE = 2;

export function effectiveVisionRadius(map: GameMap, observer: Observer, tick: number): number {
  const { visionPercent, visionRadiusOverride } = TERRAIN_RULES[terrainAt(map, observer.tile, tick)];
  if (visionRadiusOverride !== undefined) return visionRadiusOverride;
  if (observer.seesThroughNebula) return observer.visionRadius;
  return Math.max(MIN_VISION_RADIUS, Math.floor((observer.visionRadius * visionPercent) / 100));
}

export function visibleTiles(map: GameMap, observer: Observer, tick: number): TileCoord[] {
  const radius = effectiveVisionRadius(map, observer, tick);
  return offsetsByDistance(radius)
    .map((offset) => addOffset(observer.tile, offset))
    .filter((tile) => isInside(map, tile) && hasLineOfSight(map, observer.tile, tile, tick));
}

/** Una unidad dentro de una nebulosa solo se ve desde dentro de esa zona o estando pegado a ella. */
export function isConcealedFrom(map: GameMap, observer: Observer, target: TileCoord, tick: number): boolean {
  if (!TERRAIN_RULES[terrainAt(map, target, tick)].concealsUnits) return false;
  const observerInside = TERRAIN_RULES[terrainAt(map, observer.tile, tick)].concealsUnits;
  return !observerInside && squaredDistance(observer.tile, target) > ADJACENT_SQUARED_DISTANCE;
}

export function canObserverSeeUnit(map: GameMap, observer: Observer, target: TileCoord, tick: number): boolean {
  const radius = effectiveVisionRadius(map, observer, tick);
  return squaredDistance(observer.tile, target) <= radius * radius
    && hasLineOfSight(map, observer.tile, target, tick)
    && !isConcealedFrom(map, observer, target, tick);
}

export function isUnitVisible(map: GameMap, observers: readonly Observer[], target: TileCoord, tick: number): boolean {
  return observers.some((observer) => canObserverSeeUnit(map, observer, target, tick));
}

/** Niebla de un jugador. Lo visible pasa a explorado cuando nadie lo ve; lo explorado no vuelve a oscuro. */
export class FogOfWar {
  private readonly cells: Uint8Array;

  constructor(private readonly size: GridSize) {
    this.cells = new Uint8Array(size.width * size.height);
  }

  update(map: GameMap, observers: readonly Observer[], tick: number): void {
    this.demoteVisibleToExplored();
    for (const observer of observers) {
      for (const tile of visibleTiles(map, observer, tick)) this.cells[tileIndex(this.size, tile)] = Visibility.Visible;
    }
  }

  stateAt(tile: TileCoord): Visibility {
    if (!isInside(this.size, tile)) return Visibility.Unexplored;
    return (this.cells[tileIndex(this.size, tile)] ?? Visibility.Unexplored) as Visibility;
  }

  isVisible(tile: TileCoord): boolean {
    return this.stateAt(tile) === Visibility.Visible;
  }

  snapshot(): Uint8Array {
    return this.cells.slice();
  }

  private demoteVisibleToExplored(): void {
    this.cells.forEach((state, index) => {
      if (state === Visibility.Visible) this.cells[index] = Visibility.Explored;
    });
  }
}
