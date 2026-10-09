import type { ShipWeight, Terrain } from './terrain';

/** Valores de la especificación de Tiled para los objetos de obstáculo. */
export type CollisionType = 'NONE' | 'HEAVY_ONLY' | 'ALL_UNITS_BLOCKED';
export type UnitType = 'LIGHT' | 'MEDIUM' | 'HEAVY';

export interface ZoneProperties {
  readonly collision_type?: CollisionType;
  readonly blocks_vision?: boolean;
  readonly vision_modifier?: string;
}

const WEIGHT_BY_UNIT_TYPE: Readonly<Record<UnitType, ShipWeight>> = { LIGHT: 'light', MEDIUM: 'medium', HEAVY: 'heavy' };
export const REDUCE_TO_ONE_TILE = 'REDUCE_TO_1_TILE';

export function toShipWeight(unitType: UnitType): ShipWeight {
  return WEIGHT_BY_UNIT_TYPE[unitType];
}

/** Filtro de colisión por tipo de nave, tal como lo pide la especificación. */
export function canPass(collisionType: CollisionType, unitType: UnitType): boolean {
  if (collisionType === 'ALL_UNITS_BLOCKED') return false;
  if (collisionType === 'HEAVY_ONLY') return unitType === 'HEAVY';
  return true;
}

/**
 * Traduce las propiedades de un objeto de Tiled al terreno de la capa lógica.
 * Así el filtro de colisión y la visión los aplican el pathfinding y la niebla que ya existen.
 */
export function terrainForZone(properties: ZoneProperties): Terrain | undefined {
  if (properties.collision_type === 'ALL_UNITS_BLOCKED') return 'blocked';
  if (properties.collision_type === 'HEAVY_ONLY') return properties.blocks_vision ? 'asteroid' : 'ice';
  if (properties.vision_modifier === REDUCE_TO_ONE_TILE || properties.blocks_vision) return 'ion_storm';
  return undefined;
}
