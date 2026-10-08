import { tileIndex, type GridSize, type TileCoord } from './grid';

/** Bloqueo de cuerpos: como máximo una unidad por casilla. */
export class TileOccupancy {
  private readonly unitByTile = new Map<number, number>();
  private readonly tileByUnit = new Map<number, number>();

  constructor(private readonly size: GridSize) {}

  occupantAt(tile: TileCoord): number | undefined {
    return this.unitByTile.get(tileIndex(this.size, tile));
  }

  isFreeFor(tile: TileCoord, unitId: number): boolean {
    const occupant = this.occupantAt(tile);
    return occupant === undefined || occupant === unitId;
  }

  isOccupiedByOther(tile: TileCoord, unitId: number): boolean {
    return !this.isFreeFor(tile, unitId);
  }

  /** Coloca o mueve la unidad. Devuelve false si la casilla ya es de otra unidad. */
  moveTo(unitId: number, tile: TileCoord): boolean {
    if (!this.isFreeFor(tile, unitId)) return false;
    this.remove(unitId);
    const index = tileIndex(this.size, tile);
    this.unitByTile.set(index, unitId);
    this.tileByUnit.set(unitId, index);
    return true;
  }

  remove(unitId: number): void {
    const index = this.tileByUnit.get(unitId);
    if (index === undefined) return;
    this.unitByTile.delete(index);
    this.tileByUnit.delete(unitId);
  }
}
