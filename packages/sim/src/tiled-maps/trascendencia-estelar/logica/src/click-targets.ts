import { canEnterTile, type GameMap } from './game-map';
import { addOffset, offsetsByDistance, squaredDistance, tileIndex, type TileCoord } from './grid';
import type { TileOccupancy } from './occupancy';
import type { ShipWeight } from './terrain';

export interface CommandedUnit {
  readonly id: number;
  readonly tile: TileCoord;
  readonly weight: ShipWeight;
}

export interface ClickContext {
  readonly map: GameMap;
  readonly tick: number;
  readonly occupancy?: TileOccupancy;
  readonly searchRadius?: number;
}

const DEFAULT_SEARCH_RADIUS = 6;

/** Ajusta el clic a la casilla válida más cercana (por ejemplo, si cae sobre asteroides). */
export function nearestEnterableTile(
  context: ClickContext,
  clicked: TileCoord,
  weight: ShipWeight,
): TileCoord | undefined {
  return candidateTiles(context, clicked).find((tile) => canEnterTile(context.map, tile, weight, context.tick));
}

/**
 * Reparte un destino distinto a cada nave alrededor del clic, para que no terminen apiladas.
 * Las naves más cercanas al clic eligen primero; el empate se resuelve por id.
 */
export function assignMoveTargets(
  context: ClickContext,
  clicked: TileCoord,
  units: readonly CommandedUnit[],
): Map<number, TileCoord> {
  const commandedIds = new Set(units.map((unit) => unit.id));
  const reserved = new Set<number>();
  const targets = new Map<number, TileCoord>();
  const candidates = candidateTiles(context, clicked);
  for (const unit of sortByDistance(units, clicked)) {
    const target = candidates.find((tile) => isAvailable(context, tile, unit, reserved, commandedIds));
    if (!target) continue;
    reserved.add(tileIndex(context.map, target));
    targets.set(unit.id, target);
  }
  return targets;
}

function candidateTiles(context: ClickContext, clicked: TileCoord): TileCoord[] {
  return offsetsByDistance(context.searchRadius ?? DEFAULT_SEARCH_RADIUS).map((offset) => addOffset(clicked, offset));
}

function sortByDistance(units: readonly CommandedUnit[], clicked: TileCoord): CommandedUnit[] {
  return [...units].sort((a, b) => squaredDistance(a.tile, clicked) - squaredDistance(b.tile, clicked) || a.id - b.id);
}

function isAvailable(
  context: ClickContext,
  tile: TileCoord,
  unit: CommandedUnit,
  reserved: ReadonlySet<number>,
  commandedIds: ReadonlySet<number>,
): boolean {
  if (!canEnterTile(context.map, tile, unit.weight, context.tick)) return false;
  if (reserved.has(tileIndex(context.map, tile))) return false;
  const occupant = context.occupancy?.occupantAt(tile);
  return occupant === undefined || commandedIds.has(occupant);
}
