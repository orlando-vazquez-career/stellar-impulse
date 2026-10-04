import type { Position, ShipStats, Squad } from '@impulso/sim';

export interface WeaponView {
  attackCooldown?: { remainingTicks: number; durationTicks: number };
  lastShot?: Squad['lastShot'];
}

/** Only confirmed shots at visible positions cross the fog boundary. */
export function weaponView(unit: Squad, stats: ShipStats, tick: number, visible: (point: Position) => boolean): WeaponView {
  if (stats.damage <= 0 || stats.attackTicks <= 0) return {};
  const shot = unit.lastShot;
  return {
    attackCooldown: {
      remainingTicks: Math.max(0, (unit.nextAttackTick ?? (unit.lastAttackTick ?? 0) + stats.attackTicks) - tick),
      durationTicks: shot && unit.nextAttackTick !== undefined ? unit.nextAttackTick - shot.tick : stats.attackTicks,
    },
    ...(shot && visible(shot.from) && visible(shot.to) ? {
      lastShot: { ...shot, from: { ...shot.from }, to: { ...shot.to } },
    } : {}),
  };
}
