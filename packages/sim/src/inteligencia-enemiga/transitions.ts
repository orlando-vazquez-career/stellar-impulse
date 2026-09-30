import {
  hasRecovered, isBadlyDamaged, lostTarget, seesEnemy,
  targetGone, targetInAttackRange, targetOutOfAttackRange,
} from './conditions.js';
import type { AiState, Perception } from './types.js';

interface Transition {
  readonly from: readonly AiState[];
  readonly to: AiState;
  readonly when: (perception: Perception) => boolean;
}

export const TRANSITIONS: readonly Transition[] = [
  { from: ['patrol', 'chase', 'attack'], to: 'retreat', when: isBadlyDamaged },
  { from: ['retreat'], to: 'patrol', when: hasRecovered },
  { from: ['patrol'], to: 'chase', when: seesEnemy },
  { from: ['chase'], to: 'attack', when: targetInAttackRange },
  { from: ['chase'], to: 'patrol', when: lostTarget },
  { from: ['attack'], to: 'patrol', when: targetGone },
  { from: ['attack'], to: 'chase', when: targetOutOfAttackRange },
];

export function nextState(perception: Perception): AiState {
  const current = perception.memory.state;
  const transition = TRANSITIONS.find(({ from, when }) => from.includes(current) && when(perception));
  return transition?.to ?? current;
}
