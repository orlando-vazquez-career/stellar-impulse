import type { Observer } from './fog-of-war';
import { markersOfKind, type GameMap } from './game-map';
import { squaredDistance, type TileCoord } from './grid';

const CAPTURE_SQUARED_DISTANCE = 2;
const DEFAULT_TOWER_RADIUS = 10;

/**
 * Torres de vigilancia: dan visión de una zona grande al jugador que tenga una nave pegada a la torre.
 * Se suman a los observadores de FogOfWar.update.
 */
export function towerObservers(map: GameMap, playerUnitTiles: readonly TileCoord[]): Observer[] {
  return markersOfKind(map, 'torre_vigilancia')
    .filter((tower) => playerUnitTiles.some((tile) => squaredDistance(tile, tower.tile) <= CAPTURE_SQUARED_DISTANCE))
    .map((tower) => ({
      tile: tower.tile,
      visionRadius: typeof tower.properties.visionRadius === 'number' ? tower.properties.visionRadius : DEFAULT_TOWER_RADIUS,
      seesThroughNebula: true,
    }));
}
