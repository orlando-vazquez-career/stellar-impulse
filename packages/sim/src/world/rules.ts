export const TRAINING_RULES: Readonly<Rules> = Object.freeze({
  tickRate: 10,
  moveEveryTicks: 3,
  attackEveryTicks: 10,
  visionRadius: 4,
  captureRadius: 1,
  nodeCaptureTicks: 30,
  coreOpenTick: 200,
  coreCaptureTicks: 80,
});

/** Playable sector 01: time to build an economy before the core opens (2:00) and a 30 s capture. */
export const SECTOR_RULES: Readonly<Rules> = Object.freeze({
  ...TRAINING_RULES,
  moveEveryTicks: 6,
  coreOpenTick: 1200,
  coreCaptureTicks: 300,
});

/** Design candidates only. The initial client uses TRAINING_RULES. */
export const MVP_CANDIDATE_RULES = Object.freeze({
  ...TRAINING_RULES,
  coreOpenTick: 1800,
  coreCaptureTicks: 400,
});

export interface Rules {
  tickRate: number;
  moveEveryTicks: number;
  attackEveryTicks: number;
  visionRadius: number;
  captureRadius: number;
  nodeCaptureTicks: number;
  coreOpenTick: number;
  coreCaptureTicks: number;
}
