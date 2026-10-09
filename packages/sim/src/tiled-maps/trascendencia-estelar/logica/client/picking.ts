import type { TileCoord } from '../src/grid';
import { worldToTile, type IsoLayout, type WorldPoint } from './iso-projection';

export interface PickableUnit {
  readonly id: number;
  /** Centro de la sombra (posición real en la grilla). */
  readonly ground: WorldPoint;
  /** Cuánto flota el sprite sobre su sombra, en píxeles de mundo. */
  readonly liftPx: number;
  readonly hitRadiusX: number;
  readonly hitRadiusY: number;
}

export type PickResult =
  | { readonly kind: 'unit'; readonly unitId: number }
  | { readonly kind: 'tile'; readonly tile: TileCoord };

export interface SelectionBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function isInsideEllipse(point: WorldPoint, center: WorldPoint, radiusX: number, radiusY: number): boolean {
  const dx = (point.x - center.x) / radiusX;
  const dy = (point.y - center.y) / radiusY;
  return dx * dx + dy * dy <= 1;
}

function hitsUnit(point: WorldPoint, unit: PickableUnit): boolean {
  const body = { x: unit.ground.x, y: unit.ground.y - unit.liftPx };
  return isInsideEllipse(point, body, unit.hitRadiusX, unit.hitRadiusY)
    || isInsideEllipse(point, unit.ground, unit.hitRadiusX, unit.hitRadiusY / 2);
}

/** Prioriza la nave que está más al frente; si no hay ninguna, devuelve la casilla. */
export function pick(layout: IsoLayout, point: WorldPoint, units: readonly PickableUnit[]): PickResult {
  const front = units
    .filter((unit) => hitsUnit(point, unit))
    .sort((a, b) => b.ground.y - a.ground.y || a.id - b.id)[0];
  return front ? { kind: 'unit', unitId: front.id } : { kind: 'tile', tile: worldToTile(layout, point) };
}

export function normalizeBox(start: WorldPoint, end: WorldPoint): SelectionBox {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

/** Selección por arrastre: cuenta la sombra, que es la posición real de la nave. */
export function unitsInBox(box: SelectionBox, units: readonly PickableUnit[]): number[] {
  return units
    .filter(({ ground }) => ground.x >= box.left && ground.x <= box.right && ground.y >= box.top && ground.y <= box.bottom)
    .map((unit) => unit.id);
}
