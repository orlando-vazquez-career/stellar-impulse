import { advancePatrol, BEHAVIORS } from './behaviors.js';
import { AI_CONFIG } from './config.js';
import { nearestWithin } from './geometry.js';
import { nextState } from './transitions.js';
import type { AiMemory, AiOrder, AiUnit, AiWorld, Perception } from './types.js';

export const INITIAL_MEMORY: AiMemory = { state: 'patrol', targetId: null, patrolIndex: 0, lastOrderKey: null };

export interface ThinkResult {
  readonly memory: AiMemory;
  readonly order: AiOrder | null;
}

export interface AiTickResult {
  readonly memories: ReadonlyMap<string, AiMemory>;
  readonly orders: readonly AiOrder[];
}

export function thinkUnit(unit: AiUnit, world: AiWorld, memory: AiMemory): ThinkResult {
  const seen = perceive(unit, world, memory);
  const state = nextState(seen);
  const afterTransition = state === memory.state ? memory : enterState(memory, state, unit, world);
  const updated = advancePatrol(afterTransition, perceive(unit, world, afterTransition));
  const order = BEHAVIORS[updated.state].order(updated, perceive(unit, world, updated));
  return emitIfChanged(updated, order);
}

export function runEnemyAi(
  units: readonly AiUnit[],
  world: AiWorld,
  memories: ReadonlyMap<string, AiMemory>,
  tick: number,
): AiTickResult {
  const nextMemories = new Map(memories);
  const orders: AiOrder[] = [];
  const ordered = [...units].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  for (let index = 0; index < ordered.length; index += 1) {
    const unit = ordered[index];
    if (!unit || (tick + index) % AI_CONFIG.thinkIntervalTicks !== 0) continue;
    const result = thinkUnit(unit, world, memories.get(unit.id) ?? INITIAL_MEMORY);
    nextMemories.set(unit.id, result.memory);
    if (result.order) orders.push(result.order);
  }
  return { memories: nextMemories, orders };
}

function perceive(unit: AiUnit, world: AiWorld, memory: AiMemory): Perception {
  const enemies = world.enemiesOf(unit);
  return {
    unit, world, memory,
    nearestVisibleEnemy: nearestWithin(unit.position, enemies, unit.sightRange),
    currentTarget: enemies.find((enemy) => enemy.id === memory.targetId) ?? null,
  };
}

function enterState(memory: AiMemory, state: AiMemory['state'], unit: AiUnit, world: AiWorld): AiMemory {
  const withState = { ...memory, state };
  return BEHAVIORS[state].onEnter(withState, perceive(unit, world, withState));
}

function emitIfChanged(memory: AiMemory, order: AiOrder | null): ThinkResult {
  const key = order ? orderKey(order) : null;
  if (key === memory.lastOrderKey) return { memory, order: null };
  return { memory: { ...memory, lastOrderKey: key }, order };
}

function orderKey(order: AiOrder): string {
  if (order.kind === 'attack') return `attack:${order.targetId}`;
  return `move:${Math.round(order.destination.x)},${Math.round(order.destination.y)}`;
}
