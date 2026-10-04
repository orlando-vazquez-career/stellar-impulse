export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type AiState = 'patrol' | 'chase' | 'attack' | 'retreat';

export interface AiUnit {
  readonly id: string;
  readonly position: Vec2;
  readonly health: number;
  readonly maxHealth: number;
  readonly attackRange: number;
  readonly sightRange: number;
  readonly canRepair?:boolean;
}

/** Read-only world. The machine returns orders and never writes the match. */
export interface AiWorld {
  enemiesOf(unit: AiUnit): readonly AiUnit[];
  patrolRouteOf(unit: AiUnit): readonly Vec2[];
  retreatPointOf(unit: AiUnit): Vec2;
}

export type AiOrder =
  | { readonly kind: 'move'; readonly unitId: string; readonly destination: Vec2 }
  | { readonly kind: 'attack'; readonly unitId: string; readonly targetId: string };

export interface AiMemory {
  readonly state: AiState;
  readonly targetId: string | null;
  readonly patrolIndex: number;
  readonly lastOrderKey: string | null;
}

export interface Perception {
  readonly unit: AiUnit;
  readonly world: AiWorld;
  readonly memory: AiMemory;
  readonly nearestVisibleEnemy: AiUnit | null;
  readonly currentTarget: AiUnit | null;
}
