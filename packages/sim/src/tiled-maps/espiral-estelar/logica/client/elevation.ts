import { tileIndex, type GridSize, type TileCoord } from '../src/grid';

/** Píxeles que sube una nave cuando está sobre una plataforma (coincide con el escalón del tile). */
export const PLATFORM_LIFT_PX = 16;
const LIFT_SPEED_PX_PER_MS = 0.06;

/** Altura solo visual: el servidor no la conoce. Se arma con la capa "altura" del mapa de Tiled. */
export class ElevationMap {
  constructor(private readonly size: GridSize, private readonly levels: readonly number[]) {}

  static fromTiledLayer(size: GridSize, data: readonly number[], levelByGid: ReadonlyMap<number, number>): ElevationMap {
    return new ElevationMap(size, data.map((gid) => levelByGid.get(gid) ?? 0));
  }

  liftAt(tile: TileCoord): number {
    return (this.levels[tileIndex(this.size, tile)] ?? 0) * PLATFORM_LIFT_PX;
  }
}

/** Acerca suavemente la altura actual de la nave a la de la casilla en la que está. */
export function approachLift(current: number, target: number, elapsedMs: number): number {
  const step = LIFT_SPEED_PX_PER_MS * elapsedMs;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}
