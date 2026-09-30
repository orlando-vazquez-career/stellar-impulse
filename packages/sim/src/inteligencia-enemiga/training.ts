import { runEnemyAi, type AiTickResult } from './brain.js';
import type { AiMemory, AiUnit, Vec2 } from './types.js';

export interface EnemyScene {
  tick: number;
  units: readonly AiUnit[];
  enemies: readonly AiUnit[];
  patrolByUnit: Readonly<Record<string, readonly Vec2[]>>;
  retreatByUnit: Readonly<Record<string, Vec2>>;
}

/** Pure turn for the training rival. The caller applies the orders on the server. */
export function planEnemyTurn(scene: EnemyScene, memories: ReadonlyMap<string, AiMemory>): AiTickResult {
  return runEnemyAi(scene.units, {
    enemiesOf: () => scene.enemies,
    patrolRouteOf: (unit) => scene.patrolByUnit[unit.id] ?? [],
    retreatPointOf: (unit) => scene.retreatByUnit[unit.id] ?? { x: 0, y: 0 },
  }, memories, scene.tick);
}
