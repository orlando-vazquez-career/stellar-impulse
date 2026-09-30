import { AI_CONFIG } from './config.js';
import { distance } from './geometry.js';
import type { AiMemory, AiOrder, AiState, Perception } from './types.js';

interface Behavior {
  onEnter(memory: AiMemory, perception: Perception): AiMemory;
  order(memory: AiMemory, perception: Perception): AiOrder | null;
}

const forgetTarget = (memory: AiMemory): AiMemory => ({ ...memory, targetId: null });
const keepMemory = (memory: AiMemory): AiMemory => memory;

const patrol: Behavior = {
  onEnter: forgetTarget,
  order(memory, { unit, world }) {
    const route = world.patrolRouteOf(unit);
    if (route.length === 0) return null;
    const waypoint = route[memory.patrolIndex % route.length];
    if (!waypoint) return null;
    return { kind: 'move', unitId: unit.id, destination: waypoint };
  },
};

const chase: Behavior = {
  onEnter: (memory, { nearestVisibleEnemy }) => ({ ...memory, targetId: nearestVisibleEnemy?.id ?? null }),
  order: (_memory, { unit, currentTarget }) =>
    currentTarget ? { kind: 'move', unitId: unit.id, destination: currentTarget.position } : null,
};

const attack: Behavior = {
  onEnter: keepMemory,
  order: (memory, { unit }) => memory.targetId ? { kind: 'attack', unitId: unit.id, targetId: memory.targetId } : null,
};

const retreat: Behavior = {
  onEnter: forgetTarget,
  order: (_memory, { unit, world }) => ({ kind: 'move', unitId: unit.id, destination: world.retreatPointOf(unit) }),
};

export const BEHAVIORS: Readonly<Record<AiState, Behavior>> = { patrol, chase, attack, retreat };

export function advancePatrol(memory: AiMemory, perception: Perception): AiMemory {
  if (memory.state !== 'patrol') return memory;
  const route = perception.world.patrolRouteOf(perception.unit);
  if (route.length === 0) return memory;
  const waypoint = route[memory.patrolIndex % route.length];
  if (!waypoint) return memory;
  const arrived = distance(perception.unit.position, waypoint) <= AI_CONFIG.arrivalRadius;
  if (!arrived) return memory;
  return { ...memory, patrolIndex: (memory.patrolIndex + 1) % route.length };
}
