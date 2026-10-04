import { BASE_INCOME_TICKS, baseDamage, fleetCapacity } from '../economia.js';
import { distance, type PlayerId, type Squad, type World } from '../index.js';
import { statsFor, type ShipStats, type StatsContext } from '../stats.js';
import { AUGMENTS_BY_ID, type Effect } from './catalog.js';
export interface EffectContext extends StatsContext { suddenDeath?: boolean; players?: Partial<Record<PlayerId, { statModifiers?: World['players']['p1']['statModifiers']; augments?: string[] }>> }
const effectLists=new Map<string,readonly Effect[]>();
export function effectsFor(world: EffectContext, player: PlayerId): readonly Effect[] {
  const ids=world.players?.[player]?.augments ?? [],key=ids.join(',');
  const cached=effectLists.get(key);if(cached)return cached;
  const effects=Object.freeze(ids.flatMap(id=>[...(AUGMENTS_BY_ID.get(id)?.effects ?? [])]));
  if(effectLists.size>=512)effectLists.delete(effectLists.keys().next().value!);
  effectLists.set(key,effects);return effects;
}
export function statsForUnit(world: World | (StatsContext & { squads: Squad[]; core: World['core'] }), unit: Squad): ShipStats {
  const stats = statsFor(world, unit.ownerId, unit.kind);
  for (const effect of effectsFor(world, unit.ownerId)) {
    if (effect.hook === 'armor' && (!effect.kind || effect.kind === unit.kind)) {
      const base = 'players' in world ? (world.players?.[unit.ownerId] as World['players']['p1'] | undefined)?.base : undefined;
      const active = effect.origin === 'base' ? base && distance(unit, base) <= effect.radius
        : effect.origin === 'core' ? distance(unit, world.core) <= effect.radius
        : world.squads.some((other) => other.id !== unit.id && other.hp > 0 && other.ownerId === unit.ownerId
          && other.kind === effect.nearKind && distance(unit, other) <= effect.radius);
      if (active) stats.armor += effect.amount;
    }
    if (effect.hook === 'veteran' && unit.veteran) { stats.maxHp += effect.hp; stats.damage += effect.damage; }
  }
  if (unit.isDecoy) { stats.damage = 0; stats.maxHp = 30; stats.canCapture = false; stats.range = 0; }
  return stats;
}
export function counterBonus(world: EffectContext, unit: Squad, kind: Squad['kind']): number {
  return effectsFor(world, unit.ownerId).reduce((sum,effect) => sum + (effect.hook === 'counter-bonus' && effect.kind === unit.kind && effect.against === kind ? effect.amount : 0),0);
}
export function effectiveFleetCap(world: World, player: PlayerId): number {
  const effects = effectsFor(world, player);
  const fixed = effects.find((e) => e.hook === 'fleet' && e.set !== undefined);
  const initial = fixed?.hook === 'fleet' ? fixed.set! + (world.players[player].baseUpgrades?.capacity ?? 0) * 4 : fleetCapacity(world.players[player].baseUpgrades);
  return Math.max(1, initial + effects.reduce((sum,e) => sum + (e.hook === 'fleet' ? e.amount ?? 0 : 0),0));
}
export function effectiveBaseDamage(world: World, player: PlayerId): number {
  return baseDamage(world.players[player].baseUpgrades) + effectsFor(world,player).reduce((sum,e) => sum + (e.hook === 'base-damage' ? e.levels * 10 : 0),0);
}
export function captureDuration(world: EffectContext, player: PlayerId, ticks: number, core: boolean): number {
  if (core && world.suddenDeath) return 1;
  return Math.max(1, Math.round(effectsFor(world,player).reduce((time,e) => e.hook === 'capture' && (!e.coreOnly || core) ? time * e.factor : time, ticks)));
}
export function isConcealed(world: World, unit: Squad): boolean {
  return effectsFor(world,unit.ownerId).some((e) => e.hook === 'camouflage'
    && world.tick - Math.max(unit.lastMovedTick ?? 0, unit.lastAttackTick ?? 0) >= e.idleTicks);
}
export function visionSources(world: World, player: PlayerId): { position: {x:number;y:number}; radius: number }[] {
  const sensor = effectsFor(world,player).find((e) => e.hook === 'sensors');
  return [{ position: world.players[player].base, radius: world.rules.visionRadius + (sensor?.hook === 'sensors' ? sensor.baseBonus : 0) },
    ...world.squads.filter((u) => u.ownerId === player && u.hp > 0).map((u) => ({position:u,radius:statsFor(world,player,u.kind).vision})),
    ...(sensor?.hook === 'sensors' ? world.nodes.filter((n) => n.ownerId === player).map((n) => ({position:n,radius:sensor.nodeRadius})) : [])];
}
export function baseIncome(world: World, player: PlayerId): number {
  return effectsFor(world,player).reduce((income,e) => e.hook === 'base-income'
    && (!e.duration || world.tick < (world.augmentMatch?.players[player].pickedAt[
      world.players[player].augments?.find((id) => AUGMENTS_BY_ID.get(id)!.effects.includes(e)) ?? ''
    ] ?? -e.duration) + e.duration) ? income * e.factor : income,1);
}
export function metalIncomeRate(world:World,player:PlayerId):number {
  const effects=effectsFor(world,player),nodes=world.nodes.filter(n=>n.ownerId===player);
  const income=nodes.filter(n=>n.kind==='metal').length+effects.reduce((sum,e)=>sum+(e.hook==='node-income'&&e.interval?(e.amount??0)*world.rules.tickRate/e.interval*nodes.length:0),0);
  return baseIncome(world,player)*world.rules.tickRate/BASE_INCOME_TICKS+effects.reduce((value,e)=>e.hook==='node-income'&&e.factor?value*e.factor:value,income);
}
