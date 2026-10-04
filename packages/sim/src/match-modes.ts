import { createSectorWorld, type TrainingMapId, type World } from './index.js';
export type DurationMode = 'complete' | 'skirmish';
export const DURATION_MODES = Object.freeze({
  complete: Object.freeze({ choices: [0, 3000, 6000] as const, coreOpenTick: 7200, coreCaptureTicks: 900 }),
  skirmish: Object.freeze({ choices: [0, 1200, 2400] as const, coreOpenTick: 3000, coreCaptureTicks: 450 }),
});
export function createMatchWorld(map: TrainingMapId = 'espiral', duration: DurationMode = 'skirmish', seed = 1): World {
  const world = createSectorWorld(map);
  world.duration = duration;
  world.seed = seed >>> 0;
  world.rules = { ...world.rules, coreOpenTick: DURATION_MODES[duration].coreOpenTick, coreCaptureTicks: DURATION_MODES[duration].coreCaptureTicks };
  return world;
}
