import { terrainAt, type GameMap } from './game-map';
import { sameTile, type TileCoord } from './grid';
import { TERRAIN_RULES } from './terrain';

/** Casillas que cruza la línea entre dos puntos (Bresenham), sin incluir el origen. */
export function tilesAlongLine(from: TileCoord, to: TileCoord): TileCoord[] {
  const tiles: TileCoord[] = [];
  const dx = Math.abs(to.x - from.x);
  const dy = -Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  let x = from.x;
  let y = from.y;
  while (x !== to.x || y !== to.y) {
    const doubled = 2 * error;
    if (doubled >= dy) { error += dy; x += stepX; }
    if (doubled <= dx) { error += dx; y += stepY; }
    tiles.push({ x, y });
  }
  return tiles;
}

/** La casilla que bloquea sí se ve (ves la roca), pero no lo que hay detrás. */
export function hasLineOfSight(map: GameMap, from: TileCoord, to: TileCoord, tick: number): boolean {
  return tilesAlongLine(from, to).every(
    (tile) => sameTile(tile, to) || !TERRAIN_RULES[terrainAt(map, tile, tick)].blocksSight,
  );
}
