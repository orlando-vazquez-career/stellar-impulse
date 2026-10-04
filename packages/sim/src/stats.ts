import type { PlayerId, Rules, UnitKind } from './index.js';

export interface ShipStats {
  cost: number; buildTicks: number; maxHp: number; armor: number; damage: number;
  attackTicks: number; range: number; speed: number; vision: number; canCapture: boolean;
  splashRadius: number; splashFactor: number;
}
export type StatKey = Exclude<keyof ShipStats, 'canCapture'>;
export interface StatModifier { stat: StatKey; value: number; operation: 'add' | 'set' | 'multiply'; kind?: UnitKind }
export interface StatsContext {
  rules: Pick<Rules, 'tickRate'>;
  players?: Partial<Record<PlayerId, { statModifiers?: StatModifier[] }>>;
}
export const BASE_STATS: Readonly<Record<UnitKind, Readonly<ShipStats>>> = Object.freeze({
  explorer: Object.freeze({ cost: 4, buildTicks: 30, maxHp: 50, armor: 0, damage: 0, attackTicks: 0, range: 0, speed: 2.5, vision: 7, canCapture: false, splashRadius: 0, splashFactor: 0 }),
  interceptor: Object.freeze({ cost: 6, buildTicks: 40, maxHp: 100, armor: 1, damage: 6, attackTicks: 5, range: 1, speed: 1.7, vision: 4, canCapture: true, splashRadius: 0, splashFactor: 0 }),
  frigate: Object.freeze({ cost: 9, buildTicks: 60, maxHp: 220, armor: 3, damage: 5, attackTicks: 10, range: 2, speed: 1.25, vision: 4, canCapture: true, splashRadius: 0, splashFactor: 0 }),
  bomber: Object.freeze({ cost: 12, buildTicks: 80, maxHp: 150, armor: 1, damage: 36, attackTicks: 30, range: 4, speed: 0.8, vision: 4, canCapture: true, splashRadius: 1, splashFactor: 0.5 }),
});
export const SHIP_COUNTERS: Readonly<Partial<Record<UnitKind, Partial<Record<UnitKind | 'guardian', number>>>>> = {
  interceptor: { bomber: 2.5, frigate: 0.5 },
  frigate: { interceptor: 2.5, bomber: 0.5 },
  bomber: { frigate: 2, interceptor: 0.5, guardian: 1.5 },
};
/** Pure effective values. Modifiers are supplied exclusively by the authoritative simulation. */
export function statsFor(world: StatsContext, playerId: PlayerId, kind: UnitKind): ShipStats {
  const stats = { ...BASE_STATS[kind], attackTicks: BASE_STATS[kind].attackTicks ? Math.max(1, Math.round(BASE_STATS[kind].attackTicks * world.rules.tickRate / 10)) : 0 };
  const modifiers=world.players?.[playerId]?.statModifiers ?? [];
  // A fixed value replaces the base; discounts and bonuses then stack above it.
  for (const modifier of [...modifiers.filter(m=>m.operation==='set'),...modifiers.filter(m=>m.operation!=='set')]) {
    if (modifier.kind && modifier.kind !== kind) continue;
    stats[modifier.stat] = modifier.operation === 'set' ? modifier.value
      : modifier.operation === 'multiply' ? stats[modifier.stat] * modifier.value : stats[modifier.stat] + modifier.value;
  }
  stats.cost = Math.max(3, stats.cost);
  stats.maxHp = Math.max(20, stats.maxHp);
  stats.speed = Math.max(0.4, stats.speed);
  stats.buildTicks = Math.max(1, Math.round(stats.buildTicks));
  return stats;
}
export function moveInterval(world: StatsContext, playerId: PlayerId, kind: UnitKind): number {
  return Math.max(1, Math.round(world.rules.tickRate / statsFor(world, playerId, kind).speed));
}
/** Counter is applied before armor; fractional damage is intentionally preserved. */
export function damageAgainst(attacker: UnitKind, defender: UnitKind | 'guardian', damage = BASE_STATS[attacker].damage, armor = 0): number {
  return Math.max(1, damage * (SHIP_COUNTERS[attacker]?.[defender] ?? 1) - armor);
}
