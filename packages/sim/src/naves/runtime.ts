import { moveInterval, statsFor } from './stats.js';
import { nebulaSlowdown } from '../mecanicas/nebulosas.js';
import { TRAINING_RULES } from '../world/rules.js';
import type { PlayerId, Position, World } from '../engine.js';
import type { Squad } from './model.js';
import type { UnitKind } from './types.js';

/** Ticks between steps: a ship's own speed, slowed only while marching in a same-type formation. */
export function marchInterval(world: World, squad: Squad): number {
  return Math.max(moveInterval(world, squad.ownerId, squad.kind), squad.formationPace ?? 0) * nebulaSlowdown(world, squad);
}

export function createSquad(id: string, ownerId: PlayerId, kind: UnitKind, position: Position, world?: World): Squad {
  const stats = statsFor(world ?? { rules: TRAINING_RULES }, ownerId, kind);
  return {
    id,
    ownerId,
    kind,
    x: position.x,
    y: position.y,
    lastMovedTick: world?.tick ?? 0,
    lastAttackTick: world?.tick ?? 0,
    lastDamageTick: world?.tick ?? 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    damage: stats.damage,
    stance: 'march',
    anchor: null,
    gather: null,
    target: null,
    route: [],
    attackTargetId: null,
  };
}
