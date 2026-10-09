export const TERRAINS = ['empty', 'nebula', 'asteroid', 'boost', 'slow', 'blocked', 'ice', 'ion_storm'] as const;
export type Terrain = (typeof TERRAINS)[number];

export const SHIP_WEIGHTS = ['light', 'medium', 'heavy'] as const;
export type ShipWeight = (typeof SHIP_WEIGHTS)[number];

export interface TerrainRule {
  readonly speedPercent: number;
  readonly visionPercent: number;
  readonly blocksSight: boolean;
  readonly concealsUnits: boolean;
  readonly enterableBy: readonly ShipWeight[];
  /** Si existe, el radio de visión de quien está dentro se fuerza a este valor (por ejemplo, tormenta de iones). */
  readonly visionRadiusOverride?: number;
}

/** Valores iniciales: Diego los ajusta en el playtest. */
export const TERRAIN_RULES: Readonly<Record<Terrain, TerrainRule>> = {
  empty: { speedPercent: 100, visionPercent: 100, blocksSight: false, concealsUnits: false, enterableBy: SHIP_WEIGHTS },
  nebula: { speedPercent: 100, visionPercent: 50, blocksSight: false, concealsUnits: true, enterableBy: SHIP_WEIGHTS },
  asteroid: { speedPercent: 50, visionPercent: 100, blocksSight: true, concealsUnits: false, enterableBy: ['heavy'] },
  boost: { speedPercent: 150, visionPercent: 100, blocksSight: false, concealsUnits: false, enterableBy: SHIP_WEIGHTS },
  slow: { speedPercent: 50, visionPercent: 100, blocksSight: false, concealsUnits: false, enterableBy: SHIP_WEIGHTS },
  blocked: { speedPercent: 0, visionPercent: 100, blocksSight: true, concealsUnits: false, enterableBy: [] },
  ice: { speedPercent: 50, visionPercent: 100, blocksSight: false, concealsUnits: false, enterableBy: ['heavy'] },
  ion_storm: {
    speedPercent: 100, visionPercent: 100, blocksSight: true, concealsUnits: true, enterableBy: SHIP_WEIGHTS,
    visionRadiusOverride: 1,
  },
};

export const MAX_SPEED_PERCENT = Math.max(...TERRAINS.map((terrain) => TERRAIN_RULES[terrain].speedPercent));

export function isTerrain(value: unknown): value is Terrain {
  return typeof value === 'string' && (TERRAINS as readonly string[]).includes(value);
}

export function canWeightEnter(terrain: Terrain, weight: ShipWeight): boolean {
  return TERRAIN_RULES[terrain].enterableBy.includes(weight);
}
