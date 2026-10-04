import { AI_CONFIG } from './config.js';
import { distance } from './geometry.js';
import type { Perception } from './types.js';

const healthRatio = ({ unit }: Perception): number => unit.maxHealth <= 0 ? 0 : unit.health / unit.maxHealth;

export const isBadlyDamaged = (perception: Perception): boolean =>
  perception.unit.canRepair!==false && healthRatio(perception) < AI_CONFIG.retreatBelowHealthRatio;

export const hasRecovered = (perception: Perception): boolean =>
  perception.unit.canRepair===false || healthRatio(perception) > AI_CONFIG.recoverAboveHealthRatio;

export const seesEnemy = ({ nearestVisibleEnemy }: Perception): boolean => nearestVisibleEnemy !== null;

export const targetGone = ({ currentTarget }: Perception): boolean => currentTarget === null;

export const targetInAttackRange = ({ unit, currentTarget }: Perception): boolean =>
  currentTarget !== null && distance(unit.position, currentTarget.position) <= unit.attackRange;

export const targetOutOfAttackRange = (perception: Perception): boolean =>
  !targetGone(perception) && !targetInAttackRange(perception);

export const lostTarget = ({ unit, currentTarget }: Perception): boolean =>
  currentTarget === null ||
  distance(unit.position, currentTarget.position) > unit.sightRange * AI_CONFIG.loseTargetRangeFactor;
