import type { TileCoord } from '../src/grid';

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export interface IsoLayout {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly originX: number;
  readonly originY: number;
}

/** Misma proyección que usa Tiled al dibujar un mapa isométrico. */
export function layoutForTiledMap(mapHeightInTiles: number, tileWidth: number, tileHeight: number): IsoLayout {
  return { tileWidth, tileHeight, originX: (mapHeightInTiles * tileWidth) / 2, originY: 0 };
}

/** Centro de la casilla en coordenadas de mundo (donde va el origen de naves y sombras). */
export function tileToWorld(layout: IsoLayout, tile: TileCoord): WorldPoint {
  return {
    x: layout.originX + ((tile.x - tile.y) * layout.tileWidth) / 2,
    y: layout.originY + ((tile.x + tile.y + 1) * layout.tileHeight) / 2,
  };
}

export function worldToTile(layout: IsoLayout, point: WorldPoint): TileCoord {
  const across = (point.x - layout.originX) / (layout.tileWidth / 2);
  const down = (point.y - layout.originY) / (layout.tileHeight / 2);
  return { x: Math.floor((across + down) / 2), y: Math.floor((down - across) / 2) };
}

/** Profundidad de dibujado: lo que está más abajo en pantalla se dibuja encima. */
export function depthForTile(layout: IsoLayout, tile: TileCoord): number {
  return tileToWorld(layout, tile).y;
}
