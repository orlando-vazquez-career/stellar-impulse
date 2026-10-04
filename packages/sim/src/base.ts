import type { DurationMode } from './match-modes.js';
import type { PlayerId, Position, World } from './index.js';

/** Modules that fill slots 2 and 3. Slot 1 only takes the Refinery. */
export type ExtraModule = 'shipyard' | 'bastion' | 'radar';
export type ModuleKind = 'refinery' | 'refinery2' | ExtraModule;
export const EXTRA_MODULES: readonly ExtraModule[] = ['shipyard', 'bastion', 'radar'];
export const MODULE_KINDS: readonly ModuleKind[] = ['refinery', 'refinery2', ...EXTRA_MODULES];
/** Slots 2 and 3: one extra module always stays out. */
export const EXTRA_SLOTS = 2;

export interface ModuleSpec { cost: number; buildTicks: number }
/** Per-mode base economy. Metal values are per second; times are ticks at 10 Hz. */
export interface BaseRules {
  startingMetal: number;
  baseIncome: number;
  /** Metal per second for each owned Metal node: no Refinery, Refinery, Refinery II. */
  nodeRates: readonly [number, number, number];
  firstCaptureBonus: number;
  /** A captured node produces nothing for this long. */
  stabilizeTicks: number;
  /** Before this tick bases are shielded and nobody can surrender. */
  vulnerableTick: number;
  baseHp: number;
  baseArmor: number;
  regenPerSecond: number;
  /** Regeneration starts after this long without damage. */
  regenDelayTicks: number;
  defenseDamage: number;
  defenseRange: number;
  modules: Readonly<Record<ModuleKind, ModuleSpec>>;
}
/** Bastion: stronger guns, more hull and armour for the base. */
export const BASTION = Object.freeze({ damage: 20, range: 5, hp: 600, armor: 2 });
/** Shipyard: faster hangar and room for two more ships. */
export const SHIPYARD = Object.freeze({ buildFactor: 0.65, fleet: 2 });
/** Radar: base sees further and owned nodes keep watch; it also reveals camouflaged ships it covers. */
export const RADAR = Object.freeze({ baseVision: 4, nodeVision: 3 });

const COMPLETE_MODULES: Record<ModuleKind, ModuleSpec> = {
  refinery: { cost: 30, buildTicks: 300 },
  refinery2: { cost: 50, buildTicks: 400 },
  shipyard: { cost: 40, buildTicks: 350 },
  bastion: { cost: 45, buildTicks: 350 },
  radar: { cost: 35, buildTicks: 300 },
};
const scaled = (modules: Record<ModuleKind, ModuleSpec>, factor: number) => Object.freeze(Object.fromEntries(
  Object.entries(modules).map(([kind, spec]) => [kind, Object.freeze({ cost: Math.round(spec.cost * factor), buildTicks: Math.round(spec.buildTicks * factor) })]),
) as Record<ModuleKind, ModuleSpec>);

export const BASE_RULES: Readonly<Record<DurationMode, Readonly<BaseRules>>> = Object.freeze({
  complete: Object.freeze({
    startingMetal: 10, baseIncome: 0.2, nodeRates: [0.2, 0.35, 0.5] as const, firstCaptureBonus: 10, stabilizeTicks: 200,
    vulnerableTick: 3000, baseHp: 2500, baseArmor: 2, regenPerSecond: 3, regenDelayTicks: 100,
    defenseDamage: 12, defenseRange: 4, modules: scaled(COMPLETE_MODULES, 1),
  }),
  skirmish: Object.freeze({
    startingMetal: 10, baseIncome: 0.5, nodeRates: [0.4, 0.7, 0.9] as const, firstCaptureBonus: 6, stabilizeTicks: 100,
    vulnerableTick: 1500, baseHp: 1500, baseArmor: 2, regenPerSecond: 3, regenDelayTicks: 100,
    defenseDamage: 12, defenseRange: 4, modules: scaled(COMPLETE_MODULES, 0.7),
  }),
});

export interface BaseStructure { hp: number; maxHp: number; lastDamageTick: number }
export interface BaseModules {
  refinery: 0 | 1 | 2;
  extras: ExtraModule[];
  building: { kind: ModuleKind; readyTick: number } | null;
}
export type ModuleRefusal = 'invalid_command' | 'module_busy' | 'module_built' | 'module_locked' | 'module_slots_full' | 'insufficient_metal';

export const baseTargetId = (player: PlayerId) => `${player}-base`;
export const rivalOf = (player: PlayerId): PlayerId => player === 'p1' ? 'p2' : 'p1';
export function baseOwner(targetId: string): PlayerId | null {
  return targetId === 'p1-base' ? 'p1' : targetId === 'p2-base' ? 'p2' : null;
}
export const hasModule = (world: Pick<World, 'players'>, player: PlayerId, kind: ExtraModule) =>
  world.players[player].modules?.extras.includes(kind) === true;
export const baseVulnerable = (world: Pick<World, 'baseRules' | 'tick'>) => !!world.baseRules && world.tick >= world.baseRules.vulnerableTick;
export function baseArmor(world: World, player: PlayerId): number {
  return (world.baseRules?.baseArmor ?? 0) + (hasModule(world, player, 'bastion') ? BASTION.armor : 0);
}
export function baseDefense(world: World, player: PlayerId): { damage: number; range: number } {
  const rules = world.baseRules;
  if (!rules) return { damage: 0, range: 0 };
  return hasModule(world, player, 'bastion') ? { damage: BASTION.damage, range: BASTION.range } : { damage: rules.defenseDamage, range: rules.defenseRange };
}
/** Metal per second of one owned node, before augments. Zero while it stabilizes. */
export function nodeRate(world: World, player: PlayerId, node: { kind: string; activeAt?: number }): number {
  if (!world.baseRules || node.kind !== 'metal' || (node.activeAt ?? 0) > world.tick) return 0;
  return world.baseRules.nodeRates[world.players[player].modules?.refinery ?? 0];
}

export function initializeBases(world: World, mode: DurationMode): void {
  const rules = BASE_RULES[mode];
  world.baseRules = rules;
  for (const player of ['p1', 'p2'] as const) {
    world.players[player].metal = rules.startingMetal;
    world.players[player].structure = { hp: rules.baseHp, maxHp: rules.baseHp, lastDamageTick: 0 };
    world.players[player].modules = { refinery: 0, extras: [], building: null };
  }
}

export function moduleRefusal(world: World, player: PlayerId, kind: ModuleKind): ModuleRefusal | null {
  const modules = world.players[player].modules;
  if (!world.baseRules || !modules) return 'invalid_command';
  if (modules.building) return 'module_busy';
  if (kind === 'refinery' && modules.refinery >= 1) return 'module_built';
  if (kind === 'refinery2') {
    if (modules.refinery === 2) return 'module_built';
    if (modules.refinery < 1) return 'module_locked';
  }
  if (kind !== 'refinery' && kind !== 'refinery2') {
    if (modules.refinery < 1) return 'module_locked';
    if (modules.extras.includes(kind)) return 'module_built';
    if (modules.extras.length >= EXTRA_SLOTS) return 'module_slots_full';
  }
  if (world.players[player].metal < world.baseRules.modules[kind].cost) return 'insufficient_metal';
  return null;
}
export function startModule(world: World, player: PlayerId, kind: ModuleKind): void {
  const spec = world.baseRules!.modules[kind];
  world.players[player].metal -= spec.cost;
  world.players[player].modules!.building = { kind, readyTick: world.tick + spec.buildTicks };
}
/** Finished modules take effect; damaged bases repair themselves after a quiet spell. */
export function runBaseStructures(world: World): void {
  const rules = world.baseRules;
  if (!rules) return;
  for (const player of ['p1', 'p2'] as const) {
    const { modules, structure } = world.players[player];
    const order = modules?.building;
    if (modules && order && world.tick >= order.readyTick) {
      if (order.kind === 'refinery') modules.refinery = 1;
      else if (order.kind === 'refinery2') modules.refinery = 2;
      else {
        modules.extras.push(order.kind);
        if (order.kind === 'bastion' && structure) { structure.maxHp += BASTION.hp; structure.hp += BASTION.hp; }
      }
      modules.building = null;
    }
    if (structure && structure.hp > 0 && structure.hp < structure.maxHp && world.tick % world.rules.tickRate === 0
      && world.tick - structure.lastDamageTick >= rules.regenDelayTicks) {
      structure.hp = Math.min(structure.maxHp, structure.hp + rules.regenPerSecond);
    }
  }
}
/** A base the rival can see, as an attack target. */
export interface BaseTarget extends Position { id: string; ownerId: PlayerId; hp: number; maxHp: number; structure: true }
export function baseTarget(world: World, id: string): BaseTarget | undefined {
  const owner = baseOwner(id);
  const structure = owner ? world.players[owner].structure : undefined;
  if (!owner || !structure) return undefined;
  const { x, y } = world.players[owner].base;
  return { id, ownerId: owner, x, y, hp: structure.hp, maxHp: structure.maxHp, structure: true };
}
