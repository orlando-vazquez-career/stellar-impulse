import { initializeAugments } from './augments/runtime.js';
import { emptyMatchRecord } from './progression.js';
import { emptyKnowledge, observeKnowledge } from './inteligencia-enemiga/knowledge.js';
import { createSectorWorld, type TrainingMapId, type World } from './index.js';
import { initializeBases } from './base.js';
export type DurationMode = 'complete' | 'skirmish';
export const DURATION_MODES = Object.freeze({
  complete: Object.freeze({ choices: [0, 3000, 6000] as const, coreOpenTick: 7200, coreCaptureTicks: 900, suddenDeathTick: 12000 }),
  skirmish: Object.freeze({ choices: [0, 1200, 2400] as const, coreOpenTick: 3000, coreCaptureTicks: 450, suddenDeathTick: 4800 }),
});
export function createMatchWorld(map: TrainingMapId = 'espiral', duration: DurationMode = 'skirmish', seed = 1): World {
  const world = createSectorWorld(map);
  // Match terrain is immutable and may be shared safely between simulation ticks.
  if (world.surface) {
    for (const value of Object.values(world.surface)) if (Array.isArray(value)) Object.freeze(value);
    Object.freeze(world.surface);
  }
  world.duration = duration;
  world.seed = seed >>> 0;
  world.rules = { ...world.rules, coreOpenTick: DURATION_MODES[duration].coreOpenTick, coreCaptureTicks: DURATION_MODES[duration].coreCaptureTicks };
  initializeBases(world, duration);
  initializeAugments(world);
  world.matchRecord=emptyMatchRecord();
  world.knowledge=emptyKnowledge(world);observeKnowledge(world);
  return world;
}
