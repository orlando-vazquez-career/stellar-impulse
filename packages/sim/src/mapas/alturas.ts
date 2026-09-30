export const RAMP_DIRECTIONS = ['x+', 'x-', 'y+', 'y-'] as const;
export type RampDirection = typeof RAMP_DIRECTIONS[number];
export const HEIGHT_ADVANTAGE = 1.25;

const RAMP_STEP: Record<RampDirection, readonly [number, number]> = {
  'x+': [1, 0],
  'x-': [-1, 0],
  'y+': [0, 1],
  'y-': [0, -1],
};

export function isRampDirection(value: unknown): value is RampDirection {
  return RAMP_DIRECTIONS.some((direction) => direction === value);
}

/** Same level is open. A cliff opens only when the lower cell's ramp points at the higher cell. */
export function canCrossHeight(step: {
  width: number;
  level: readonly number[];
  ramp: readonly (RampDirection | null)[];
  from: number;
  to: number;
}): boolean {
  const fromLevel = step.level[step.from] ?? 0;
  const toLevel = step.level[step.to] ?? 0;
  if (fromLevel === toLevel) return true;
  const low = fromLevel < toLevel ? step.from : step.to;
  const high = fromLevel < toLevel ? step.to : step.from;
  const direction = step.ramp[low] ?? null;
  if (!direction) return false;
  const offset = RAMP_STEP[direction];
  const x = low % step.width;
  const y = Math.floor(low / step.width);
  return (y + offset[1]) * step.width + (x + offset[0]) === high;
}

export function applyHeightAdvantage(hit: {
  damage: number;
  attackerLevel: number;
  defenderLevel: number;
}): number {
  if (hit.attackerLevel <= hit.defenderLevel) return hit.damage;
  return Math.round(hit.damage * HEIGHT_ADVANTAGE);
}
