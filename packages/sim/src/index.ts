import { parseCommand } from '@impulso/input';
import { planEnemyTurn, type EnemyScene } from './inteligencia-enemiga/training.js';
import type { AiMemory, AiOrder, AiUnit } from './inteligencia-enemiga/types.js';
import { advanceCapture, captureContext, guardianActive, resolveCombat, withinReach } from './maps/mechanics.js';
import { BATTLEFIELD_MAP } from './maps/battlefield.js';
import { createBattlefieldWorldInternal } from './maps/world.js';
import {
  appendDestination, armAttack, blockedCells, consumeWaypoint, guardDestination, holdGround,
  leashBlocks, loopRoute, MAX_ROUTE_POINTS, refreshArrivals, replaceDestination,
  type PlayerStance, type WalkBoard,
} from './mecanicas/orders.js';
import { findPath as findSurfacePath, firstPathStep, pathExists } from './maps/pathfinding.js';
import { SECTOR_01 } from './mapas/sector-01.js';
import {
  BASE_INCOME_TICKS, BUILD_TICKS, FLEET_CAP, launchCell, REPAIR_RADIUS, STARTING_METAL, UNIT_COSTS,
  type ProductionState,
  baseUpgradeCost, fleetCapacity, baseDamage, BASE_DEFENSE_RANGE, type BaseUpgrades,
} from './economia.js';
import { rivalGoals, rivalModule, rivalProduction, type RivalDifficulty } from './inteligencia-enemiga/estrategia.js';
import {
  baseArmor, baseDefense, baseTarget, baseTargetId, baseVulnerable, hasModule, moduleRefusal, nodeRate, rivalOf,
  runBaseStructures, startModule, SHIPYARD, type BaseModules, type BaseRules, type BaseStructure, type BaseTarget,
} from './base.js';
export {
  BASE_RULES, BASTION, EXTRA_MODULES, EXTRA_SLOTS, MODULE_KINDS, RADAR, SHIPYARD, baseArmor, baseDefense, baseOwner,
  baseTargetId, baseVulnerable, hasModule, moduleRefusal, nodeRate,
} from './base.js';
export type { BaseModules, BaseRules, BaseStructure, BaseTarget, ExtraModule, ModuleKind, ModuleSpec } from './base.js';
export { RIVAL_PROFILES } from './inteligencia-enemiga/estrategia.js';
export type { RivalDifficulty } from './inteligencia-enemiga/estrategia.js';
export { BASE_INCOME_TICKS, BUILD_TICKS, FLEET_CAP, REPAIR_RADIUS, STARTING_METAL, UNIT_COSTS } from './economia.js';
export type { ProductionOrder, ProductionState } from './economia.js';
export { baseUpgradeCost, fleetCapacity, baseDamage, MAX_BASE_UPGRADE_LEVEL, BASE_DEFENSE_RANGE, CAPACITY_PER_LEVEL, BASE_DAMAGE_PER_LEVEL } from './economia.js';
export type { BaseUpgrades, BaseUpgradeKind } from './economia.js';
export { leerSuperficie } from './mapas/leer-tiled.js';
export { OBSTACLE_MODELS } from './mapas/obstaculos.js';
export type { MapObstacle, ObstacleModel } from './mapas/obstaculos.js';
export { findPath as findTiledPath } from './maps/pathfinding.js';
import { ESPIRAL } from './mapas/espiral.js';
import { cloneSatellites, createSatellites, runSatellites, type SatelliteState } from './mecanicas/satellites.js';
export { SATELLITE_AFTERMATH_TICKS } from './mecanicas/satellites.js';
export type { DropZone, DropZoneSpec, SatelliteFall, SatelliteState } from './mecanicas/satellites.js';
import type { SectorLeido, Superficie } from './mapas/leer-tiled.js';

export { defineMapSpec, MAX_MAP_SIDE, MAX_MAP_CELLS } from './maps/types.js';
export type { MapCell, MapObjective, MapSpec } from './maps/types.js';
export { parseTiledJson, MAX_TILED_JSON_BYTES, MAX_TILED_LAYERS } from './maps/tiled.js';
export type { TiledGrid } from './maps/tiled.js';
export { BATTLEFIELD_MAP, SECTOR_01_BATTLEFIELD_MAP } from './maps/battlefield.js';
export { applyBattlefieldCommand, stepBattlefieldWorld, cloneBattlefieldWorld } from './maps/world.js';
export type { BattlefieldWorld, BattlefieldSquad, BattlefieldCommandResult, BattlefieldRejection } from './maps/world.js';

export type PlayerId = 'p1' | 'p2';
export interface Position { x: number; y: number }
export type UnitKind = 'explorer' | 'interceptor' | 'frigate' | 'bomber';
import { BASE_STATS, statsFor, moveInterval, type ShipStats, type StatModifier } from './stats.js';
export { BASE_STATS, SHIP_COUNTERS, statsFor, moveInterval, damageAgainst } from './stats.js';
import { damageAgainst } from './stats.js';
import { advanceAugmentClock, scheduleAugments, runAugmentEffects, cloneAugmentMatch, type AugmentMatch } from './augments/runtime.js';
import { effectsFor, effectiveFleetCap, effectiveBaseDamage, baseIncome, visionSources, isConcealed, statsForUnit } from './augments/effects.js';
import { cloneMatchRecord, recordMatchTick, type MatchRecord } from './progression.js';
import { observeKnowledge, type AiKnowledge } from './inteligencia-enemiga/knowledge.js';
export { CHALLENGES, emptyProgress, emptyMatchRecord, profileFor, unlockedPool, rewardForMatch, challengeProgress } from './progression.js';
export type { AccountProgress, ProgressProfile, MatchReward, MatchRecord } from './progression.js';
export { effectiveFleetCap, effectiveBaseDamage, effectsFor, statsForUnit, visionSources, isConcealed, captureDuration, metalIncomeRate } from './augments/effects.js';
export { initializeAugments, setAugmentPool, grantAugment, pickAugment, rerollAugments, chooseAiAugment } from './augments/runtime.js';
export { AUGMENT_CATALOG, AUGMENTS_BY_ID, INITIAL_AUGMENTS } from './augments/catalog.js';
export type { Augment, AugmentTier, ChallengeId } from './augments/catalog.js';
export type { AugmentOffer, AugmentMatch } from './augments/runtime.js';
export type { ShipStats, StatModifier } from './stats.js';
import { DURATION_MODES } from './match-modes.js';
export { createMatchWorld, DURATION_MODES } from './match-modes.js';
export type { DurationMode } from './match-modes.js';
/** Compatibility metadata for the offline presentation sandbox. Authoritative rules use statsFor. */
export const UNIT_STATS = Object.freeze(Object.fromEntries(Object.entries(BASE_STATS).map(([kind, stats]) =>
  [kind, Object.freeze({ ...stats, moveIntervalFactor: 1.7 / stats.speed, visionBonus: stats.vision - 4 })])) as Record<UnitKind, ShipStats & { moveIntervalFactor: number; visionBonus: number }>);
export type SimEvent = { type: 'destroyed'; tick: number; attackerId: string; attackerOwner: PlayerId | null; victimId: string; victimOwner: PlayerId; kind: UnitKind; cost: number; shot: string };
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
/** Shortened single-sector learning slice, not campaign balance. */
export const TRAINING_RULES: Readonly<Rules> = Object.freeze({
  tickRate: 10, moveEveryTicks: 3, attackEveryTicks: 10, visionRadius: 4,
  captureRadius: 1, nodeCaptureTicks: 30, coreOpenTick: 200, coreCaptureTicks: 80,
});
/** Battlefield is a separate schema; these default timings preserve the training slice. */
export function createBattlefieldWorld(map: import('./maps/types.js').MapSpec = BATTLEFIELD_MAP,
  overrides: Partial<Rules> = {}): import('./maps/world.js').BattlefieldWorld {
  return createBattlefieldWorldInternal(map, { ...TRAINING_RULES, ...overrides });
}
/** Playable sector 01: time to build an economy before the core opens (2:00) and a 30 s capture. */
export const SECTOR_RULES: Readonly<Rules> = Object.freeze({
  // One cell every 0.6 s for an Interceptor; class speed differences remain intact.
  ...TRAINING_RULES, moveEveryTicks: 6, coreOpenTick: 1200, coreCaptureTicks: 300,
});
/** Design candidates only. The initial client uses TRAINING_RULES. */
export const MVP_CANDIDATE_RULES = Object.freeze({
  ...TRAINING_RULES, coreOpenTick: 1800, coreCaptureTicks: 400,
});
const ROCK_SEEDS: readonly Position[] = [
  { x: 4, y: 14 }, { x: 5, y: 14 }, { x: 5, y: 13 },
  { x: 7, y: 12 }, { x: 7, y: 13 }, { x: 8, y: 13 },
  { x: 8, y: 9 }, { x: 8, y: 10 }, { x: 8, y: 11 },
  { x: 3, y: 7 }, { x: 4, y: 7 }, { x: 4, y: 8 },
  { x: 13, y: 17 }, { x: 14, y: 17 }, { x: 13, y: 16 },
];
const TRAINING_OBSTACLES = ROCK_SEEDS.flatMap(({ x, y }) => [{ x, y }, { x: y, y: x }]);
export interface Player {
  id: PlayerId;
  base: Position;
  metal: number;
  lastSequence: number;
  baseUpgrades?: BaseUpgrades;
  statModifiers?: StatModifier[];
  augments?: string[];
  /** Match worlds only: the base hull and its modules. */
  structure?: BaseStructure;
  modules?: BaseModules;
}
export interface Squad extends Position {
  arrivalLocked?:boolean;
  arrivalSeat?:Position|null;
  id: string;
  ownerId: PlayerId;
  kind: UnitKind;
  hp: number;
  maxHp: number;
  damage: number;
  lastAttackTick?: number;
  /** Last observation of the ordered target; never follows a position inside fog. */
  attackMemory?: Position & { seenAt: number };
  nextAttackTick?: number;
  lastShot?: { tick: number; from: Position; to: Position; splashRadius: number };
  lastDamageTick?: number;
  lastMovedTick?: number;
  kills?: number;
  veteran?: boolean;
  isDecoy?: boolean;
  expiresAt?: number;
  stance: PlayerStance;
  anchor: Position | null;
  gather: Position | null;
  target: Position | null;
  route: Position[];
  attackTargetId: string | null;
  /** Previous cell remains reserved while the client finishes this step. */
  transit?: { from: Position; untilTick: number };
  /** Brief right-of-way pause after taking an allied passing pocket. */
  trafficYieldUntil?: number;
  /** A fresh order may take its first step on the next tick instead of waiting for the beat. */
  quickStep?: boolean;
  /** After an off-beat first step, no further step before this tick (then the shared beat resumes). */
  moveHoldUntil?: number;
}
export function createSquad(id: string, ownerId: PlayerId, kind: UnitKind, position: Position, world?: World): Squad {
  const stats = statsFor(world ?? { rules: TRAINING_RULES }, ownerId, kind);
  return { id, ownerId, kind, x: position.x, y: position.y,
    lastMovedTick: world?.tick ?? 0, lastAttackTick: world?.tick ?? 0, lastDamageTick: world?.tick ?? 0,
    hp: stats.maxHp, maxHp: stats.maxHp, damage: stats.damage, stance: 'march',
    anchor: null, gather: null, target: null, route: [], attackTargetId: null };
}
export interface Guardian extends Position {
  id: string;
  objectiveId: string;
  hp: number;
  maxHp: number;
  damage: number;
  transit?: { from: Position; untilTick: number };
}
export interface CaptureObjective extends Position {
  id: string;
  guardianId: string;
  progress: Record<PlayerId, number>;
}
export interface ResourceNode extends CaptureObjective {
  kind: 'metal' | 'capture';
  ownerId: PlayerId | null;
  /** Match worlds: a node produces from this tick on, after stabilizing. */
  activeAt?: number;
  /** Match worlds: the first-capture bonus has been paid. */
  claimed?: boolean;
}
export interface Core extends CaptureObjective { open: boolean }
export interface World {
  schemaVersion: 1;
  mode: 'training';
  tick: number;
  width: number;
  height: number;
  obstacles: Position[];
  surface: Superficie | null;
  rules: Rules;
  players: Record<PlayerId, Player>;
  squads: Squad[];
  guardians: Guardian[];
  nodes: ResourceNode[];
  core: Core;
  winner: PlayerId | null;
  /** One ship in the hangar queue per player. */
  production: ProductionState;
  /** Ships launched from the base, used for deterministic ids and the rival build order. */
  built: Record<PlayerId, number>;
  /** Base income, hangar and repairs. Off in the legacy 20×20 drill. */
  economy: boolean;
  duration?: import('./match-modes.js').DurationMode;
  seed?: number;
  events?: SimEvent[];
  augmentMatch?: AugmentMatch;
  suddenDeath?: boolean;
  matchRecord?: MatchRecord;
  knowledge?: Record<PlayerId,AiKnowledge>;
  /** Destructible bases, modules and the slower node economy. Set by createMatchWorld. */
  baseRules?: Readonly<BaseRules>;
  /** Falling satellites over the map's `zona_caida` areas. Absent on maps without them. */
  satellites?: SatelliteState;
}
export type CommandRejection =
  | 'invalid_command' | 'unknown_player' | 'stale_sequence'
  | 'unknown_squad' | 'not_owner' | 'squad_destroyed'
  | 'out_of_bounds' | 'blocked_destination' | 'unreachable_destination' | 'route_full' | 'match_finished'
  | 'unknown_target' | 'friendly_target' | 'target_destroyed' | 'target_not_visible' | 'cannot_attack' | 'target_unavailable'
  | 'insufficient_metal' | 'fleet_full' | 'production_busy' | 'upgrade_maxed' | 'production_forbidden' | 'opening_selection'
  | 'module_busy' | 'module_built' | 'module_locked' | 'module_slots_full' | 'surrender_locked';
export type CommandResult =
  | { accepted: true; world: World }
  | { accepted: false; reason: CommandRejection; world: World };

export function createWorld(): World {
  return {
    schemaVersion: 1, mode: 'training', tick: 0, width: 20, height: 20,
    obstacles: TRAINING_OBSTACLES.map((point) => ({ ...point })),
    surface: null,
    rules: { ...TRAINING_RULES },
    // Reflection through x=y gives both players equal travel distances.
    players: {
      p1: { id: 'p1', base: { x: 2, y: 17 }, metal: 0, lastSequence: 0 },
      p2: { id: 'p2', base: { x: 17, y: 2 }, metal: 0, lastSequence: 0 },
    },
    squads: [
      createSquad('p1-interceptor', 'p1', 'interceptor', { x: 2, y: 17 }),
      createSquad('p2-interceptor', 'p2', 'interceptor', { x: 17, y: 2 }),
    ],
    guardians: [
      { id: 'metal-guardian', objectiveId: 'metal-1', x: 4, y: 4, hp: 36, maxHp: 36, damage: 2 },
      { id: 'core-guardian', objectiveId: 'core', x: 10, y: 10, hp: 60, maxHp: 60, damage: 3 },
    ],
    nodes: [{ id: 'metal-1', kind: 'metal', x: 4, y: 4, guardianId: 'metal-guardian', ownerId: null, progress: { p1: 0, p2: 0 } }],
    core: { id: 'core', x: 10, y: 10, guardianId: 'core-guardian', open: false, progress: { p1: 0, p2: 0 } },
    winner: null,
    production: { p1: null, p2: null },
    built: { p1: 0, p2: 0 },
    economy: false,
  };
}
/** Starting fleet beside each base: a scout and one combat ship; the rest comes from the hangar. */
const STARTING_FLEET: readonly { kind: UnitKind; dx: number; dy: number }[] = [
  { kind: 'interceptor', dx: 0, dy: 0 }, { kind: 'explorer', dx: 1, dy: 1 },
];
/** Guardians charge ships within this many cells of their post and stop chasing beyond it. */
export const GUARDIAN_AGGRO_RADIUS = 3;
/** Guardians move one cell every this many ticks (slower than an Interceptor). */
const GUARDIAN_MOVE_TICKS = 9;
/** Training maps by id: Diego's Espiral Estelar (96×96) and the original Sector 01 (29×29). */
export const TRAINING_MAPS = Object.freeze({ espiral: ESPIRAL, 'sector-01': SECTOR_01 });
export type TrainingMapId = keyof typeof TRAINING_MAPS;
export function createSectorWorld(map: TrainingMapId = 'sector-01'): World {
  return createWorldOn(TRAINING_MAPS[map]);
}
export function createWorldOn(sector: SectorLeido): World {
  const node = (input: { id: string; kind: 'metal' | 'capture'; x: number; y: number }): ResourceNode => ({
    id: input.id, kind: input.kind, x: input.x, y: input.y,
    guardianId: `${input.id}-guardian`, ownerId: null, progress: { p1: 0, p2: 0 },
  });
  const metals = sector.metals.map((cell, index) => node({ id: `metal-${index + 1}`, kind: 'metal', x: cell.x, y: cell.y }));
  // p2 mirrors p1 through the map centre, so both fleets face the same terrain.
  // p2 mirrors p1 around its base; on any map a blocked spot falls back to the nearest open cell.
  const fleet = (player: PlayerId) => {
    const base = sector.bases[player];
    const used = new Set<string>();
    const open = (cell: Position) => sector.walkable[cell.y * sector.width + cell.x] === true;
    return STARTING_FLEET.map(({ kind, dx, dy }) => {
      const sign = player === 'p1' ? 1 : -1;
      const preferred = { x: base.x + sign * dx, y: base.y + sign * dy };
      const inside = preferred.x >= 0 && preferred.y >= 0 && preferred.x < sector.width && preferred.y < sector.height;
      const cell = inside && open(preferred) && !used.has(`${preferred.x},${preferred.y}`) ? preferred
        : launchCell(base, sector.width, sector.height, open, (point) => used.has(`${point.x},${point.y}`)) ?? base;
      used.add(`${cell.x},${cell.y}`);
      return createSquad(`${player}-${kind}`, player, kind, cell);
    });
  };
  return {
    schemaVersion: 1, mode: 'training', tick: 0, width: sector.width, height: sector.height,
    obstacles: [],
    surface: {
      width: sector.width, height: sector.height,
      walkable: [...sector.walkable], level: [...sector.level], ramp: [...sector.ramp],
    },
    rules: { ...SECTOR_RULES },
    players: {
      p1: { id: 'p1', base: { ...sector.bases.p1 }, metal: STARTING_METAL, lastSequence: 0 },
      p2: { id: 'p2', base: { ...sector.bases.p2 }, metal: STARTING_METAL, lastSequence: 0 },
    },
    squads: [...fleet('p1'), ...fleet('p2')],
    // Neutral PvE: every Metal node and the core start guarded (brief: explore, defeat guardians, capture).
    guardians: [
      ...metals.map((metal) => ({ id: metal.guardianId, objectiveId: metal.id, x: metal.x, y: metal.y, hp: 60, maxHp: 60, damage: 3 })),
      { id: 'core-guardian', objectiveId: 'core', x: sector.core.x, y: sector.core.y, hp: 160, maxHp: 160, damage: 5 },
    ],
    nodes: [
      ...metals,
      ...sector.captures.map((cell, index) => node({ id: `capture-${index + 1}`, kind: 'capture', x: cell.x, y: cell.y })),
    ],
    core: { id: 'core', x: sector.core.x, y: sector.core.y, guardianId: 'core-guardian', open: false, progress: { p1: 0, p2: 0 } },
    winner: null,
    production: { p1: null, p2: null },
    built: { p1: 0, p2: 0 },
    economy: true,
    satellites: createSatellites(sector.dropZones, SECTOR_RULES.tickRate),
  };
}
export function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
export function canSee(world: World, playerId: PlayerId, target: Position): boolean {
  if ('ownerId' in target && target.ownerId !== playerId && 'kind' in target && isConcealed(world,target as Squad)) return false;
  return visionSources(world,playerId).some((source) => distance(source.position,target)<=source.radius);
}
function attackTarget(world: World, id: string): Squad | Guardian | BaseTarget | undefined {
  return world.squads.find((unit) => unit.id === id) ?? world.guardians.find((unit) => unit.id === id) ?? baseTarget(world, id);
}
const cellId = (point: Position, width: number) => point.y * width + point.x;
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1],
];
/** Deterministic eight-way A*: static terrain blocks movement; ships do not. */
export function findPath(start: Position, target: Position, width: number, height: number, obstacles: Position[]): Position[] {
  const inside = (point: Position) => point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
  if (!inside(start) || !inside(target)) return [];
  const blocked = new Set(obstacles.map((point) => cellId(point, width)));
  if (blocked.has(cellId(target, width))) return [];
  const startId = cellId(start, width);
  const targetId = cellId(target, width);
  const costs = new Float64Array(width * height).fill(Infinity);
  const previous = new Int32Array(width * height).fill(-1);
  const open = new Set<number>([startId]);
  costs[startId] = 0;
  while (open.size) {
    let current = -1;
    let best = Infinity;
    for (const id of open) {
      const x = id % width;
      const y = Math.floor(id / width);
      const score = costs[id]! + Math.hypot(target.x - x, target.y - y);
      if (score < best || (score === best && id < current)) { best = score; current = id; }
    }
    if (current === targetId) break;
    open.delete(current);
    const x = current % width;
    const y = Math.floor(current / width);
    for (const [dx, dy] of DIRECTIONS) {
      const next = { x: x + dx, y: y + dy };
      if (!inside(next) || blocked.has(cellId(next, width))) continue;
      if (dx && dy && (blocked.has(cellId({ x: x + dx, y }, width)) || blocked.has(cellId({ x, y: y + dy }, width)))) continue;
      const nextId = cellId(next, width);
      const cost = costs[current]! + (dx && dy ? Math.SQRT2 : 1);
      if (cost >= costs[nextId]!) continue;
      costs[nextId] = cost;
      previous[nextId] = current;
      open.add(nextId);
    }
  }
  if (targetId !== startId && previous[targetId] === -1) return [];
  const path: Position[] = [];
  for (let id = targetId; id !== startId; id = previous[id]!) path.push({ x: id % width, y: Math.floor(id / width) });
  path.push({ ...start });
  return path.reverse();
}
export function cloneWorld(world: World): World {
  return {
    ...world, matchRecord: cloneMatchRecord(world.matchRecord), augmentMatch: cloneAugmentMatch(world.augmentMatch), events: [], rules: { ...world.rules }, obstacles: world.obstacles.map((point) => ({ ...point })),
    players: {
      p1: clonePlayer(world.players.p1),
      p2: clonePlayer(world.players.p2),
    },
    squads: world.squads.map((unit) => ({
      ...unit,
      arrivalSeat:unit.arrivalSeat?{...unit.arrivalSeat}:null,
      anchor: unit.anchor ? { ...unit.anchor } : null,
      gather: unit.gather ? { ...unit.gather } : null,
      target: unit.target ? { ...unit.target } : null,
      route: unit.route.map((cell) => ({ ...cell })),
      transit: unit.transit ? { ...unit.transit, from: { ...unit.transit.from } } : undefined,
      attackMemory: unit.attackMemory ? { ...unit.attackMemory } : undefined,
      lastShot: unit.lastShot ? { ...unit.lastShot, from: { ...unit.lastShot.from }, to: { ...unit.lastShot.to } } : undefined,
    })),
    guardians: world.guardians.map((unit) => ({ ...unit,
      transit: unit.transit ? { ...unit.transit, from: { ...unit.transit.from } } : undefined })),
    nodes: world.nodes.map((node) => ({ ...node, progress: { ...node.progress } })),
    core: { ...world.core, progress: { ...world.core.progress } },
    surface: world.duration ? world.surface : copySurface(world.surface),
    production: {
      p1: world.production.p1 ? { ...world.production.p1 } : null,
      p2: world.production.p2 ? { ...world.production.p2 } : null,
    },
    built: { ...world.built },
    satellites: cloneSatellites(world.satellites),
  };
}
function clonePlayer(player: Player): Player {
  return {
    ...player, augments: player.augments && [...player.augments], base: { ...player.base },
    statModifiers: player.statModifiers?.map((modifier) => ({ ...modifier })), baseUpgrades: player.baseUpgrades && { ...player.baseUpgrades },
    structure: player.structure && { ...player.structure },
    modules: player.modules && { ...player.modules, extras: [...player.modules.extras], building: player.modules.building && { ...player.modules.building } },
  };
}
function copySurface(surface: Superficie | null): Superficie | null {
  if (!surface) return null;
  return {
    width: surface.width, height: surface.height,
    walkable: [...surface.walkable], level: [...surface.level], ramp: [...surface.ramp],
  };
}
const ATTACK_RANGE = 1;
const PATROL_OFFSETS: readonly Position[] = [
  { x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: 1 },
];

const frozenBoards=new WeakMap<Superficie,WalkBoard>();
function boardOf(world: World): WalkBoard {
  if (!world.surface) return { width: world.width, height: world.height, blocked: blockedCells(world.obstacles) };
  const cached=frozenBoards.get(world.surface);if(cached)return cached;
  const blocked = new Set<string>();
  world.surface.walkable.forEach((open, index) => {
    if (open) return;
    blocked.add(`${index % world.width},${Math.floor(index / world.width)}`);
  });
  const board={ width: world.width, height: world.height, blocked };
  if(Object.isFrozen(world.surface))frozenBoards.set(world.surface,board);
  return board;
}
function queueOrigin(squad: Squad): Position {
  return squad.route.at(-1) ?? squad.gather ?? squad;
}
function rejectDestination(world: World, trip: { from: Position; x: number; y: number }): CommandRejection | null {
  if (trip.x < 0 || trip.y < 0 || trip.x >= world.width || trip.y >= world.height) return 'out_of_bounds';
  if (world.surface) {
    if (world.surface.walkable[trip.y * world.width + trip.x] !== true) return 'blocked_destination';
  } else if (world.obstacles.some((point) => point.x === trip.x && point.y === trip.y)) return 'blocked_destination';
  if (trip.from.x === trip.x && trip.from.y === trip.y) return null;
  if (!routeExists(world, trip.from, trip)) return 'unreachable_destination';
  return null;
}
function routeExists(world: World, from: Position, to: Position): boolean {
  if (from.x === to.x && from.y === to.y) return true;
  if (world.surface) return pathExists(world.surface,from,to);
  return findPath(from, to, world.width, world.height, world.obstacles).length > 0;
}
function nextStep(world: World, from: Position, to: Position): Position | null {
  if (from.x === to.x && from.y === to.y) return null;
  if (world.surface) {
    return firstPathStep(world.surface,from,to);
  }
  return findPath(from, to, world.width, world.height, world.obstacles)[1] ?? null;
}
/** Every living ship holds its cell, including allies. A departing ship also keeps the cell it
 * leaves until its step ends, except for an ally that is no faster: moving in behind it keeps a
 * full cell between them on screen, so columns close up instead of leaving a gap. */
function cellOccupied(world: World, cell: Position, selfId: string): boolean {
  const self = world.squads.find((unit) => unit.id === selfId);
  const selfInterval = self ? moveInterval(world, self.ownerId, self.kind) : 0;
  const trails = (unit: Squad | Guardian) => !!self && 'ownerId' in unit && unit.ownerId === self.ownerId
    && selfInterval >= moveInterval(world, unit.ownerId, unit.kind);
  const holds = (unit: Squad | Guardian) => (unit.x === cell.x && unit.y === cell.y)
    || (!!unit.transit && unit.transit.untilTick > world.tick
      && unit.transit.from.x === cell.x && unit.transit.from.y === cell.y && !trails(unit));
  const ship = world.squads.some((unit) => unit.hp > 0 && unit.id !== selfId
    && holds(unit));
  const guardian = world.guardians.some((unit) => unit.hp > 0 && unit.id !== selfId && holds(unit));
  return ship || guardian;
}
/** Allied hulls may pass beside each other diagonally; their destination cells
 * and departure reservations remain exclusive. Hostile corners stay solid. */
function cornerOccupied(world:World,cell:Position,squad:Squad):boolean {
  const holds=(u:Squad|Guardian)=>(u.x===cell.x&&u.y===cell.y)||(!!u.transit&&u.transit.untilTick>world.tick&&u.transit.from.x===cell.x&&u.transit.from.y===cell.y);
  return world.guardians.some(u=>u.hp>0&&holds(u))||world.squads.some(u=>u.hp>0&&u.id!==squad.id&&u.ownerId!==squad.ownerId&&holds(u));
}

/** Replan around live traffic without changing the static terrain or losing the order. */
const trafficPaths=new WeakMap<Superficie,Map<string,Position|null>>();
function trafficStep(world: World, squad: Squad, destination: Position): Position | null {
  if (cellOccupied(world, destination, squad.id)) {
    if (withinReach({ diagonalReach: world.surface !== null }, squad, destination)) return null;
    // A blocked objective still needs a legal approach, especially in the legacy drill
    // where a diagonal neighbour is outside weapons range.
    const allied=world.squads.some(u=>u.hp>0&&u.ownerId===squad.ownerId&&u.x===destination.x&&u.y===destination.y);
    if(!allied){
    const approach = DIRECTIONS.map(([dx, dy]) => ({ x: destination.x + dx, y: destination.y + dy }))
      .filter((point) => cellOnBoard(world, point) && !cellOccupied(world, point, squad.id)
        && withinReach({ diagonalReach: world.surface !== null }, point, destination)
        && routeExists(world, squad, point))
      .sort((a, b) => distance(a, squad) - distance(b, squad) || a.y - b.y || a.x - b.x)[0];
    if (!approach) return null;
    destination = approach;
    }
  }
  const direct = nextStep(world, squad, destination);
  const clear = (point: Position) => !cellOccupied(world, point, squad.id);
  const cornerClear = (point: Position) => point.x === squad.x || point.y === squad.y
    || (!cornerOccupied(world,{ x: point.x, y: squad.y },squad) && !cornerOccupied(world,{ x: squad.x, y: point.y },squad));
  if (!direct || (clear(direct) && cornerClear(direct))) return direct;
  if(world.squads.some(u=>u.hp>0&&u.ownerId===squad.ownerId&&u.arrivalSeat&&!movementDestination(world,u)&&u.x===direct.x&&u.y===direct.y))return null;
  // An occupied goal is allowed in the search (e.g. an attack target), but never entered.
  const open = (point: Position) => (point.x === destination.x && point.y === destination.y) || clear(point);
  let alternative: Position | null;
  if (world.surface) {
    // Copy terrain once, then mark occupied cells. Scanning every hull for every
    // map cell produces the same mask but dominates large headless experiments.
    const walkable = world.surface.walkable.slice();
    const block=(point:Position)=>{if(point.x!==destination.x||point.y!==destination.y)walkable[point.y*world.width+point.x]=false;};
    for(const unit of [...world.squads,...world.guardians])if(unit.hp>0&&unit.id!==squad.id){
      if('ownerId' in unit&&unit.ownerId===squad.ownerId&&unit.arrivalSeat&&!movementDestination(world,unit))continue;
      block(unit);
      if(unit.transit&&unit.transit.untilTick>world.tick)block(unit.transit.from);
    }
    walkable[squad.y * world.width + squad.x] = true;
    let cache:Map<string,Position|null>|undefined,key='';
    if(Object.isFrozen(world.surface)) {
      cache=trafficPaths.get(world.surface);if(!cache){cache=new Map();trafficPaths.set(world.surface,cache);}
      const occupied:number[]=[];
      for(const unit of [...world.squads,...world.guardians])if(unit.hp>0&&unit.id!==squad.id) {
        if('ownerId' in unit&&unit.ownerId===squad.ownerId&&unit.arrivalSeat&&!movementDestination(world,unit))continue;
        occupied.push(unit.y*world.width+unit.x);
        if(unit.transit&&unit.transit.untilTick>world.tick)occupied.push(unit.transit.from.y*world.width+unit.transit.from.x);
      }
      key=`${squad.x},${squad.y}:${destination.x},${destination.y}:${[...new Set(occupied)].sort((a,b)=>a-b).join(',')}`;
    }
    if(cache?.has(key))alternative=cache.get(key)!;
    else {
      alternative=firstPathStep({...world.surface,walkable},squad,destination);
      if(cache){if(cache.size>=2048)cache.delete(cache.keys().next().value!);cache.set(key,alternative);}
    }
  } else {
    const occupied = [...world.squads.filter((unit) => unit.hp > 0 && unit.id !== squad.id),
      ...world.guardians.filter((unit) => unit.hp > 0)].filter((unit) => !open(unit));
    alternative = findPath(squad, destination, world.width, world.height, [...world.obstacles, ...occupied])[1] ?? null;
  }
  return alternative && clear(alternative) && cornerClear(alternative) ? alternative : null;
}
function commitOrder(world: World, playerId: PlayerId, seq: number, squadId: string, write: (squad: Squad) => void): CommandResult {
  const next = cloneWorld(world);
  next.players[playerId].lastSequence = seq;
  const nextSquad = next.squads.find((unit) => unit.id === squadId);
  if (!nextSquad) return { accepted: false, reason: 'unknown_squad', world };
  write(nextSquad);
  refreshArrivals(next.squads.filter((unit) => unit.hp > 0), boardOf(next),(from,to)=>routeExists(next,from,to));
  return { accepted: true, world: next };
}
function cellOnBoard(world: World, cell: Position): boolean {
  if (cell.x < 0 || cell.y < 0 || cell.x >= world.width || cell.y >= world.height) return false;
  if (world.surface) return world.surface.walkable[cell.y * world.width + cell.x] === true;
  return !world.obstacles.some((point) => point.x === cell.x && point.y === cell.y);
}
/** Commands are pure. Rejected commands return the original world unchanged. */
export function applyCommand(world: World, playerId: string, raw: unknown): CommandResult {
  const reject = (reason: CommandRejection): CommandResult => ({ accepted: false, reason, world });
  if (playerId !== 'p1' && playerId !== 'p2') return reject('unknown_player');
  const parsed = parseCommand(raw);
  if (!parsed.ok) return reject(parsed.reason);
  if (world.winner !== null) return reject('match_finished');
  if(world.augmentMatch && !world.augmentMatch.started) return reject('opening_selection');
  const command = parsed.command;
  if (command.seq <= world.players[playerId].lastSequence) return reject('stale_sequence');
  if (command.type === 'disband') {
    const units = command.squadIds.map((id) => world.squads.find((unit) => unit.id === id));
    if (units.some((unit) => !unit)) return reject('unknown_squad');
    if (units.some((unit) => unit!.ownerId !== playerId)) return reject('not_owner');
    if (units.some((unit) => unit!.hp <= 0)) return reject('squad_destroyed');
    const next = cloneWorld(world);
    const ids = new Set(command.squadIds);
    next.players[playerId].lastSequence = command.seq;
    for (const unit of next.squads) if (ids.has(unit.id)) {
      if(unit.kind!=='explorer'&&!unit.isDecoy&&next.matchRecord)next.matchRecord.players[playerId].combatLosses++;
      holdGround(unit);
      unit.hp = 0;
      delete unit.transit;
    }
    refreshArrivals(next.squads.filter((unit) => unit.hp > 0), boardOf(next),(from,to)=>routeExists(next,from,to));
    return { accepted: true, world: next };
  }
  if (command.type === 'surrender') {
    if (!world.baseRules) return reject('invalid_command');
    if (!baseVulnerable(world)) return reject('surrender_locked');
    const next = cloneWorld(world);
    next.players[playerId].lastSequence = command.seq;
    next.winner = rivalOf(playerId);
    return { accepted: true, world: next };
  }
  if (command.type === 'build_module') {
    const refused = moduleRefusal(world, playerId, command.module);
    if (refused) return reject(refused);
    const next = cloneWorld(world);
    next.players[playerId].lastSequence = command.seq;
    startModule(next, playerId, command.module);
    return { accepted: true, world: next };
  }
  if (command.type === 'upgrade_base') {
    if (!world.economy) return reject('invalid_command');
    const cost = baseUpgradeCost(command.upgrade, world.players[playerId].baseUpgrades);
    if (cost === null) return reject('upgrade_maxed');
    if (world.players[playerId].metal < cost) return reject('insufficient_metal');
    const next = cloneWorld(world);
    const player = next.players[playerId];
    player.lastSequence = command.seq;
    player.metal -= cost;
    player.baseUpgrades ??= { damage: 0, capacity: 0 };
    player.baseUpgrades[command.upgrade] += 1;
    return { accepted: true, world: next };
  }
  if (command.type === 'produce') {
    if (!world.economy) return reject('invalid_command');
    const refused = productionRefusal(world, playerId, command.kind);
    if (refused) return reject(refused);
    const next = cloneWorld(world);
    next.players[playerId].lastSequence = command.seq;
    startProduction(next, playerId, command.kind);
    return { accepted: true, world: next };
  }
  const squad = world.squads.find((unit) => unit.id === command.squadId);
  if (!squad) return reject('unknown_squad');
  if (squad.ownerId !== playerId) return reject('not_owner');
  if (squad.hp <= 0) return reject('squad_destroyed');
  if (command.type === 'attack') {
    if (statsFor(world, squad.ownerId, squad.kind).damage <= 0) return reject('cannot_attack');
    const target = attackTarget(world, command.targetId);
    if (!target) return reject('unknown_target');
    if ('ownerId' in target && target.ownerId === playerId) return reject('friendly_target');
    if (target.hp <= 0) return reject('target_destroyed');
    if ('objectiveId' in target && !guardianActive(world, target)) return reject('target_unavailable');
    if ('structure' in target && !baseVulnerable(world)) return reject('target_unavailable');
    if (!canSee(world, playerId, target)) return reject('target_not_visible');
    if (!routeExists(world, squad, target)) return reject('unreachable_destination');
    return commitOrder(world, playerId, command.seq, squad.id, (nextSquad) => {
      nextSquad.stance = 'march';
      nextSquad.anchor = null;
      nextSquad.gather = null;
      nextSquad.target = null;
      nextSquad.route = [];
      nextSquad.attackTargetId = command.targetId;
      nextSquad.attackMemory = { x: target.x, y: target.y, seenAt: world.tick };
      nextSquad.quickStep = true;
    });
  }
  if (command.type === 'stop') {
    return commitOrder(world, playerId, command.seq, squad.id, (nextSquad) => holdGround(nextSquad));
  }
  if (command.type === 'stance') {
    return commitOrder(world, playerId, command.seq, squad.id, (nextSquad) => {
      if (command.stance === 'guard') holdGround(nextSquad);
      else if (command.stance === 'patrol') loopRoute(nextSquad, boardOf(world));
      else armAttack(nextSquad);
    });
  }
  const origin = command.type === 'enqueue' ? queueOrigin(squad) : squad;
  const blocked = rejectDestination(world, { from: origin, x: command.x, y: command.y });
  if (blocked) return reject(blocked);
  const queued = (squad.gather ? 1 : 0) + squad.route.length;
  if (command.type === 'enqueue' && queued >= MAX_ROUTE_POINTS) return reject('route_full');
  return commitOrder(world, playerId, command.seq, squad.id, (nextSquad) => {
    if (command.type === 'enqueue') appendDestination(nextSquad, command);
    else replaceDestination(nextSquad, command);
    nextSquad.quickStep = true;
  });
}
/** A guardian's post is its objective's cell. */
function guardianPost(world: World, guardian: Guardian): Position {
  if (guardian.objectiveId === world.core.id) return world.core;
  return world.nodes.find((node) => node.id === guardian.objectiveId) ?? guardian;
}
/** Neutral guardians charge the nearest ship that enters their zone, then return to their post. */
function moveGuardians(world: World): void {
  if (!world.surface || world.tick % GUARDIAN_MOVE_TICKS !== 0) return;
  for (const guardian of world.guardians) {
    if (!guardianActive(world, guardian)) continue;
    const post = guardianPost(world, guardian);
    const intruder = world.squads
      .filter((unit) => unit.hp > 0 && distance(unit, post) <= GUARDIAN_AGGRO_RADIUS)
      .sort((a, b) => distance(a, guardian) - distance(b, guardian) || (a.id < b.id ? -1 : 1))[0];
    if (intruder && withinReach({ diagonalReach: true }, guardian, intruder)) continue;
    const goal = intruder ?? post;
    if (goal.x === guardian.x && goal.y === guardian.y) continue;
    const next = nextStep(world, guardian, goal);
    if (!next || distance(next, post) > GUARDIAN_AGGRO_RADIUS) continue;
    const taken = cellOccupied(world, next, guardian.id)
      || (next.x !== guardian.x && next.y !== guardian.y
        && (cellOccupied(world, { x: next.x, y: guardian.y }, guardian.id)
          || cellOccupied(world, { x: guardian.x, y: next.y }, guardian.id)));
    if (taken) continue;
    guardian.transit = { from: { x: guardian.x, y: guardian.y }, untilTick: world.tick + GUARDIAN_MOVE_TICKS };
    guardian.x = next.x;
    guardian.y = next.y;
  }
}
/** Only mutually blocked allies may exchange cells, atomically on a shared movement beat. */
function swapBlockedAllies(world: World, squad: Squad, destination: Position, moved: Set<string>, passingCell?: Position): boolean {
  const step = nextStep(world, squad, passingCell ?? destination);
  if (!step || (squad.transit && squad.transit.untilTick > world.tick)) return false;
  const other = world.squads.find((unit) => unit.hp > 0 && unit.ownerId === squad.ownerId
    && unit.id !== squad.id && unit.x === step.x && unit.y === step.y);
  if (!other || moved.has(other.id) || (other.transit && other.transit.untilTick > world.tick)) return false;
  const otherDestination = movementDestination(world, other);
  const interval = (unit: Squad) => moveInterval(world, unit.ownerId, unit.kind);
  const idle=!otherDestination&&other.stance==='march'&&!other.attackTargetId;
  if(idle&&other.x===destination.x&&other.y===destination.y&&!other.arrivalSeat)return false;
  if ((!otherDestination&&!idle) || (!idle&&world.tick % interval(other) !== 0)) return false;
  const otherStep = idle?nextStep(world,other,squad):nextStep(world, other, otherDestination!);
  if (!otherStep || otherStep.x !== squad.x || otherStep.y !== squad.y
    || (!idle&&trafficStep(world, other, otherDestination!) !== null)
    || leashBlocks(squad, step, world.rules.visionRadius)
    || leashBlocks(other, otherStep, world.rules.visionRadius)) return false;
  // The exception belongs to this pair only. Third-party hulls and departure
  // reservations still block both movements; hostile diagonal corners stay solid.
  const traffic = { ...world, squads: world.squads.filter((unit) => unit.id !== squad.id && unit.id !== other.id) };
  const clear = (from: Position, to: Position) => !cellOccupied(traffic, to, '')
    && (from.x === to.x || from.y === to.y || (!cornerOccupied(traffic, { x: to.x, y: from.y }, squad)
      && !cornerOccupied(traffic, { x: from.x, y: to.y }, squad)));
  if (!clear(squad, other) || !clear(other, squad)) return false;
  const from = { x: squad.x, y: squad.y };
  const otherFrom = { x: other.x, y: other.y };
  squad.transit = { from, untilTick: world.tick + interval(squad) };
  other.transit = { from: otherFrom, untilTick: world.tick + interval(other) };
  Object.assign(squad, otherFrom);
  Object.assign(other, from);
  if(idle&&other.arrivalSeat)other.arrivalSeat={...from};
  squad.lastMovedTick = other.lastMovedTick = world.tick;
  moved.add(squad.id);
  moved.add(other.id);
  consumeWaypoint(squad);
  consumeWaypoint(other);
  return true;
}
/** Cardinal exchanges open a packed formation even when diagonal corners are full. */
function passParkedAlly(world:World,squad:Squad,destination:Position,moved:Set<string>):boolean {
  const options=world.squads.filter(u=>u.hp>0&&u.ownerId===squad.ownerId&&u.id!==squad.id
    &&u.stance==='march'&&!movementDestination(world,u)&&!u.attackTargetId&&!moved.has(u.id)
    &&distance(squad,u)===1
    &&(u.arrivalSeat||u.x!==destination.x||u.y!==destination.y))
    .sort((a,b)=>distance(a,destination)-distance(b,destination)||(a.id<b.id?-1:a.id>b.id?1:0));
  const length=(from:Position)=>{if(!world.surface)return findPath(from,destination,world.width,world.height,world.obstacles).length;const result=findSurfacePath(world.surface,from,destination);return result.status==='found'?result.path.length:Infinity;};
  const remaining=length(squad);
  for(const other of options){
    if(length(other)>=remaining&&distance(other,destination)>=distance(squad,destination))continue;
    if(swapBlockedAllies(world,squad,destination,moved,other))return true;
  }
  return false;
}

/** At a ramp or bend the ships may contest a third cell rather than each other's.
 * The lower id takes a legal passing pocket and gives the other three beats. */
function routeBlockedByTraffic(world: World, squad: Squad, destination: Position): boolean {
  const step = nextStep(world, squad, destination);
  return !!step && (cellOccupied(world, step, squad.id) || (step.x !== squad.x && step.y !== squad.y
    && (cellOccupied(world, { x: step.x, y: squad.y }, squad.id)
      || cellOccupied(world, { x: squad.x, y: step.y }, squad.id))));
}

function yieldToBlockedAlly(world: World, squad: Squad, destination: Position): boolean {
  const direct = nextStep(world, squad, destination);
  if (!direct) return false;
  const other = [...world.squads].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .find((unit) => unit.hp > 0 && unit.ownerId === squad.ownerId && squad.id < unit.id
      && !(squad.gather&&unit.gather&&squad.gather.x===unit.gather.x&&squad.gather.y===unit.gather.y)
      && distance(squad, unit) <= 2 && movementDestination(world, unit)
      && routeBlockedByTraffic(world, unit, movementDestination(world, unit)!));
  if (!other) return false;
  const otherDestination = movementDestination(world, other)!;
  const otherRoute = world.surface ? findSurfacePath(world.surface, other, otherDestination) : null;
  const lane = otherRoute?.status === 'found' ? otherRoute.path : findPath(other, otherDestination, world.width, world.height, world.obstacles);
  const pockets = DIRECTIONS.map(([dx, dy]) => ({ x: squad.x + dx, y: squad.y + dy }))
    .filter((cell) => cellOnBoard(world, cell) && !cellOccupied(world, cell, squad.id)
      && (cell.x !== direct.x || cell.y !== direct.y)
      && !leashBlocks(squad, cell, world.rules.visionRadius)
      && (cell.x === squad.x || cell.y === squad.y || (!cellOccupied(world, { x: cell.x, y: squad.y }, squad.id)
        && !cellOccupied(world, { x: squad.x, y: cell.y }, squad.id)))
      && (() => { const step = nextStep(world, squad, cell); return step?.x === cell.x && step.y === cell.y; })())
    .sort((a, b) => Number(lane.some((point) => point.x === a.x && point.y === a.y))
      - Number(lane.some((point) => point.x === b.x && point.y === b.y))
      || distance(a, destination) - distance(b, destination) || a.y - b.y || a.x - b.x);
  const pocket = pockets[0];
  if (!pocket) return false;
  const interval = moveInterval(world, squad.ownerId, squad.kind);
  const otherInterval = moveInterval(world, other.ownerId, other.kind);
  squad.transit = { from: { x: squad.x, y: squad.y }, untilTick: world.tick + interval };
  squad.trafficYieldUntil = world.tick + 3 * Math.max(interval, otherInterval);
  Object.assign(squad, pocket);
  squad.lastMovedTick = world.tick;
  return true;
}

function moveSquads(world: World): void {
  const moved = new Set<string>();
  // Resolve targets before traffic so a pair sees the same intentions regardless
  // of which member is processed first.
  for (const squad of world.squads) {
    if (squad.hp <= 0) continue;
    if(squad.gather&&squad.target){squad.arrivalLocked=true;squad.arrivalSeat={...squad.target};}
    releaseLostTarget(world, squad);
    acquireStanceTarget(world, squad);
  }
  for (const squad of world.squads) {
    if (squad.hp <= 0 || moved.has(squad.id) || (squad.trafficYieldUntil ?? 0) > world.tick) continue;
    const destination = movementDestination(world, squad);
    if (!destination) continue;
    const interval = moveInterval(world, squad.ownerId, squad.kind);
    // Orders feel instant: the first step of a fresh order goes on the next tick. Later steps
    // keep the shared beat, which allied swaps rely on.
    const onBeat = world.tick % interval === 0;
    const inTransit = !!squad.transit && squad.transit.untilTick > world.tick;
    const quick = !!squad.quickStep && !inTransit && !onBeat;
    if ((squad.moveHoldUntil ?? 0) > world.tick || (!onBeat && !quick)) continue;
    squad.quickStep = false;
    if (quick) squad.moveHoldUntil = world.tick + Math.ceil(interval / 2);
    if(routeBlockedByTraffic(world,squad,destination)){
      if(yieldToBlockedAlly(world,squad,destination))continue;
    }
    const next = trafficStep(world, squad, destination);
    if (!next) {
      if (swapBlockedAllies(world, squad, destination, moved)) continue;
      if (passParkedAlly(world,squad,destination,moved)) continue;
      if (yieldToBlockedAlly(world, squad, destination)) continue;
      if (squad.x === destination.x && squad.y === destination.y) consumeWaypoint(squad);
      // Traffic is temporary: keep the command and retry when the lane frees up.
      else if (!routeExists(world, squad, destination)) clearStuckRoute(squad);
      continue;
    }
    if (leashBlocks(squad, next, world.rules.visionRadius) || cellOccupied(world, next, squad.id)) continue;
    squad.transit = { from: { x: squad.x, y: squad.y }, untilTick: world.tick + interval };
    squad.x = next.x;
    squad.y = next.y;
    squad.lastMovedTick = world.tick;
    consumeWaypoint(squad);
  }
  refreshArrivals(world.squads.filter((unit) => unit.hp > 0), boardOf(world),(from,to)=>routeExists(world,from,to));
}
function productionRefusal(world: World, playerId: PlayerId, kind: UnitKind): CommandRejection | null {
  if (world.production[playerId]) return 'production_busy';
  if (effectsFor(world,playerId).some((e)=>e.hook==='no-production' && e.kind===kind)) return 'production_forbidden';
  if (world.squads.filter((unit) => unit.ownerId === playerId && unit.hp > 0 && !unit.isDecoy).length >= effectiveFleetCap(world, playerId)) return 'fleet_full';
  if (world.players[playerId].metal < statsFor(world, playerId, kind).cost) return 'insufficient_metal';
  return null;
}
function startProduction(world: World, playerId: PlayerId, kind: UnitKind): void {
  world.players[playerId].metal -= statsFor(world, playerId, kind).cost;
  const state=world.augmentMatch?.players[playerId];
  const factor=(state && state.fastBuilds>0 ? state.fastFactor : 1)*(hasModule(world,playerId,'shipyard') ? SHIPYARD.buildFactor : 1);
  if(state && state.fastBuilds>0) state.fastBuilds--;
  world.production[playerId] = { kind, readyTick: world.tick + Math.max(1, Math.round(statsFor(world, playerId, kind).buildTicks * factor)) };
}
/** Base income, hangar launches and repairs: the base guarantees a way back into the fight. */
function runBases(world: World): void {
  for (const playerId of ['p1', 'p2'] as const) {
    const player = world.players[playerId];
    if (world.baseRules) {
      if (world.tick % world.rules.tickRate === 0) player.metal += world.baseRules.baseIncome * baseIncome(world, playerId);
    } else if (world.tick % BASE_INCOME_TICKS === 0) player.metal += baseIncome(world, playerId);
    const order = world.production[playerId];
    if (order && world.tick >= order.readyTick) {
      const cell = launchCell(player.base, world.width, world.height,
        (point) => cellOnBoard(world, point), (point) => cellOccupied(world, point, ''));
      // A blocked hangar holds the finished ship until a launch cell frees up.
      if (cell) {
        world.built[playerId] += 1;
        world.squads.push(createSquad(`${playerId}-${order.kind}-${world.built[playerId]}`, playerId, order.kind, cell, world));
        world.production[playerId] = null;
      }
    }
    if (world.tick % world.rules.tickRate !== 0) continue;
    const effects=effectsFor(world,playerId);
    if(effects.some((e)=>e.hook==='no-base-repair')) continue;
    const repair=effects.find((e)=>e.hook==='repair');
    const repairRadius=repair?.hook==='repair' ? repair.radius : REPAIR_RADIUS;
    const repairRate=repair?.hook==='repair' ? repair.rate : 1;
    for (const squad of world.squads) {
      if (squad.ownerId === playerId && squad.hp > 0 && squad.hp < squad.maxHp && distance(squad, player.base) <= repairRadius) {
        squad.hp = Math.min(squad.maxHp, squad.hp + repairRate);
      }
    }
  }
}
/** Exactly one integer tick; no clock, RNG, chain, renderer or inventory. */
export function stepWorld(world: World): World {
  if (world.winner !== null) return world;
  const next = cloneWorld(world);
  if (advanceAugmentClock(next)) return next;
  next.tick += 1;
  if (next.duration && next.tick >= DURATION_MODES[next.duration].suddenDeathTick) next.suddenDeath = true;
  scheduleAugments(next);
  next.core.open = next.tick >= next.rules.coreOpenTick;
  if (next.economy) runBases(next);
  runBaseStructures(next);
  moveSquads(next);
  if (next.economy) moveGuardians(next);
  runSatellites(next);
  resolveCombat(next.surface ? { ...next, level: next.surface.level, diagonalReach: true } : next);
  if (next.baseRules) resolveSiege(next);
  if (next.economy) resolveBaseDefense(next);
  if (next.baseRules) {
    const fallen = (['p1', 'p2'] as const).filter((player) => (next.players[player].structure?.hp ?? 1) <= 0);
    if (fallen.length === 1) { next.winner = rivalOf(fallen[0]!); return next; }
  }
  const capture = captureContext(next);
  for (const node of next.nodes) {
    const captor = advanceCapture(next, node, next.rules.nodeCaptureTicks, capture);
    if (captor && node.ownerId !== captor) {
      node.ownerId=captor;
      if (next.baseRules && node.kind === 'metal') {
        node.activeAt = next.tick + next.baseRules.stabilizeTicks;
        if (!node.claimed) { node.claimed = true; next.players[captor].metal += next.baseRules.firstCaptureBonus; }
      }
      const state=next.augmentMatch?.players[captor];
      if(state && state.captureBounties>0) {
        const bounty=effectsFor(next,captor).find((e)=>e.hook==='capture-bounty');
        if(bounty?.hook==='capture-bounty') { next.players[captor].metal+=bounty.amount;state.captureBounties--; }
      }
    }
    if (node.ownerId) {
      const effects=effectsFor(next,node.ownerId);
      let income=next.tick%next.rules.tickRate!==0 ? 0 : next.baseRules ? nodeRate(next,node.ownerId,node) : node.kind==='metal' ? 1 : 0;
      for(const e of effects)if(e.hook==='node-income'&&e.interval&&next.tick%e.interval===0)income+=e.amount??0;
      next.players[node.ownerId].metal+=effects.reduce((value,e)=>e.hook==='node-income'&&e.factor?value*e.factor:value,income);
    }
  }
  if (next.core.open) next.winner = advanceCapture(next, next.core, next.rules.coreCaptureTicks, capture);
  runAugmentEffects(next);
  recordMatchTick(next,world);
  observeKnowledge(next);
  return next;
}

/** Bases fire once per combat beat at the nearest hostile in their visible perimeter. */
function resolveBaseDefense(world: World): void {
  if (world.tick % world.rules.attackEveryTicks !== 0) return;
  const hits = new Map<string, { damage: number; owner: PlayerId }>();
  for (const player of Object.values(world.players)) {
    if (player.structure && player.structure.hp <= 0) continue;
    const innate = baseDefense(world, player.id);
    const damage = innate.damage + effectiveBaseDamage(world,player.id);
    const range = Math.max(innate.range, BASE_DEFENSE_RANGE);
    if (damage <= 0) continue;
    const ownBase = baseTargetId(player.id);
    // Ships shooting at this base come first, then the nearest hostile.
    const target = [...world.squads.filter((unit) => unit.ownerId !== player.id && unit.hp > 0),
      ...world.guardians.filter((unit) => guardianActive(world, unit))]
      .filter((unit) => distance(unit, player.base) <= range && canSee(world,player.id,unit))
      .sort((a, b) => Number('ownerId' in b && b.attackTargetId === ownBase) - Number('ownerId' in a && a.attackTargetId === ownBase)
        || distance(a, player.base) - distance(b, player.base) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    if (target) hits.set(target.id, { damage: (hits.get(target.id)?.damage ?? 0) + damage, owner: player.id });
  }
  for (const unit of [...world.squads, ...world.guardians]) {
    const hit = hits.get(unit.id);
    if (!hit) continue;
    const alive=unit.hp>0;
    unit.hp = Math.max(0, unit.hp - Math.max(1, hit.damage - ('kind' in unit ? statsForUnit(world,unit).armor : 0)));
    if ('kind' in unit) {
      unit.lastDamageTick=world.tick;
      if (alive && unit.hp===0 && !unit.isDecoy) world.events?.push({type:'destroyed',tick:world.tick,attackerId:`${hit.owner}-base`,attackerOwner:hit.owner,victimId:unit.id,victimOwner:unit.ownerId,kind:unit.kind,cost:statsFor(world,unit.ownerId,unit.kind).cost,shot:`${hit.owner}-base:${world.tick}`});
    }
  }
}
/** Ships fire at an exposed rival base in range when ordered to, or when nothing else is in their sights. */
function resolveSiege(world: World): void {
  if (!baseVulnerable(world)) return;
  for (const squad of world.squads) {
    if (squad.hp <= 0 || squad.isDecoy || squad.lastAttackTick === world.tick) continue;
    const rival = rivalOf(squad.ownerId);
    const structure = world.players[rival].structure;
    if (!structure || structure.hp <= 0) continue;
    const id = baseTargetId(rival);
    if (squad.attackTargetId && squad.attackTargetId !== id) continue;
    const stats = statsForUnit(world, squad);
    const readyAt = squad.nextAttackTick ?? (squad.lastAttackTick ?? 0) + stats.attackTicks;
    if (stats.damage <= 0 || world.tick < readyAt) continue;
    const base = world.players[rival].base;
    if (Math.max(Math.abs(squad.x - base.x), Math.abs(squad.y - base.y)) > stats.range || !canSee(world, squad.ownerId, base)) continue;
    // Structures take the Bombardier's anti-structure bonus, like guardians.
    structure.hp = Math.max(0, structure.hp - damageAgainst(squad.kind, 'guardian', stats.damage, baseArmor(world, rival)));
    structure.lastDamageTick = world.tick;
    squad.lastAttackTick = world.tick;
    squad.nextAttackTick = world.tick + stats.attackTicks;
    squad.lastShot = { tick: world.tick, from: { x: squad.x, y: squad.y }, to: { ...base }, splashRadius: 0 };
  }
}
function releaseLostTarget(world: World, squad: Squad): void {
  if (!squad.attackTargetId) return;
  const enemy = attackTarget(world, squad.attackTargetId);
  const observed = enemy && canSee(world, squad.ownerId, enemy);
  if (observed && enemy.hp > 0) squad.attackMemory = { x: enemy.x, y: enemy.y, seenAt: world.tick };
  const memory = squad.attackMemory;
  const expired = !memory || world.tick - memory.seenAt > 5 * world.rules.tickRate;
  const leftPost = squad.stance === 'guard' && !!squad.anchor && !!memory
    && distance(squad.anchor, memory) > world.rules.visionRadius;
  if (!enemy || enemy.hp <= 0 || expired || leftPost) {
    squad.attackTargetId = null;
    squad.attackMemory = undefined;
  }
}
function acquireStanceTarget(world: World, squad: Squad): void {
  if (squad.attackTargetId || statsFor(world, squad.ownerId, squad.kind).damage <= 0) return;
  if (squad.stance !== 'guard' && squad.stance !== 'attack') return;
  const origin = squad.stance === 'guard' && squad.anchor ? squad.anchor : squad;
  const vision = statsFor(world, squad.ownerId, squad.kind).vision;
  const foe = nearestFoe(world, squad, origin, vision);
  if (foe) {
    squad.attackTargetId = foe.id;
    squad.attackMemory = { x: foe.x, y: foe.y, seenAt: world.tick };
  }
}
function nearestFoe(world: World, squad: Squad, origin: Position, radius: number): Squad | Guardian | undefined {
  const foes: Array<Squad | Guardian> = [
    ...world.squads.filter((unit) => unit.hp > 0 && unit.ownerId !== squad.ownerId && canSee(world,squad.ownerId,unit)),
    ...world.guardians.filter((unit) => guardianActive(world, unit) && canSee(world, squad.ownerId, unit)),
  ];
  let best: Squad | Guardian | undefined;
  let bestDistance = Infinity;
  for (const foe of foes) {
    const gap = distance(origin, foe);
    if (gap > radius) continue;
    if (!best || gap < bestDistance || (gap === bestDistance && foe.id < best.id)) {
      best = foe;
      bestDistance = gap;
    }
  }
  return best;
}
function movementDestination(world: World, squad: Squad): Position | null {
  const enemy = squad.attackTargetId ? attackTarget(world, squad.attackTargetId) : undefined;
  if (enemy && enemy.hp > 0 && canSee(world, squad.ownerId, enemy)) {
    if (Math.max(Math.abs(squad.x - enemy.x), Math.abs(squad.y - enemy.y)) <= statsFor(world, squad.ownerId, squad.kind).range) return null;
    return enemy;
  }
  if (squad.attackTargetId && squad.attackMemory) {
    const lastSeen = squad.attackMemory;
    return squad.x === lastSeen.x && squad.y === lastSeen.y ? null : lastSeen;
  }
  return squad.target ?? guardDestination(squad);
}
function clearStuckRoute(squad: Squad): void {
  squad.arrivalLocked=false;squad.arrivalSeat=null;
  squad.target = null;
  squad.gather = null;
  squad.route = [];
  squad.attackTargetId = null;
  squad.attackMemory = undefined;
}
function toAi(world: World, unit: Squad, viewer:PlayerId=unit.ownerId): AiUnit {
  const disguised=unit.isDecoy && viewer!==unit.ownerId;
  const stats=statsForUnit(world,disguised?{...unit,isDecoy:false}:unit);
  return {
    id: unit.id, position: { x: unit.x, y: unit.y }, health: disguised?unit.hp/unit.maxHp*stats.maxHp:unit.hp, maxHealth: disguised?stats.maxHp:unit.maxHp,
    // Diego's AI measures Manhattan distance; a diagonal neighbour is 2 on sector maps.
    attackRange: stats.range, sightRange: stats.vision,
    canRepair: !effectsFor(world,unit.ownerId).some(e=>e.hook==='no-base-repair') || effectsFor(world,unit.ownerId).some(e=>e.hook==='field-repair'),
  };
}
function enemyScene(world: World, difficulty: RivalDifficulty, rival: PlayerId): EnemyScene {
  const units = world.squads.filter((unit) => unit.ownerId === rival && unit.hp > 0);
  const patrolByUnit: Record<string, Position[]> = {};
  const retreatByUnit: Record<string, Position> = {};
  const goals = world.economy ? rivalGoals(world, rival, (target) => canSee(world, rival, target), difficulty) : new Map<string, Position>();
  for (const unit of units) {
    const base = world.players[unit.ownerId].base;
    const goal = goals.get(unit.id);
    // Without a strategic goal the ship keeps Diego's patrol around the base.
    patrolByUnit[unit.id] = goal ? [goal] : PATROL_OFFSETS
      .map((offset) => ({ x: base.x + offset.x, y: base.y + offset.y }))
      .filter((cell) => cellOnBoard(world, cell));
    retreatByUnit[unit.id] = { ...base };
  }
  return {
    tick: world.tick,
    thinkAll: !!world.duration,
    units: units.map((unit) => toAi(world, unit)),
    enemies: world.squads.filter((unit) => unit.ownerId !== rival && unit.hp > 0 && canSee(world,rival,unit)).map((unit) => toAi(world, unit,rival)),
    patrolByUnit, retreatByUnit,
  };
}
/** Training rival only. A seated human on p2 must not call this. */
export function planTrainingEnemy(world: World, memories: ReadonlyMap<string, AiMemory>, difficulty: RivalDifficulty = 'medium', rival: PlayerId = 'p2'): {
  memories: ReadonlyMap<string, AiMemory>;
  orders: readonly AiOrder[];
} {
  return planEnemyTurn(enemyScene(world, difficulty, rival), memories);
}
/** One full rival turn for an empty p2 seat: hangar order, then fleet orders. */
export function runTrainingRival(world: World, memories: ReadonlyMap<string, AiMemory>, difficulty: RivalDifficulty = 'medium', rival: PlayerId = 'p2'): {
  world: World; memories: ReadonlyMap<string, AiMemory>;
} {
  let next = world;
  const module = rivalModule(world, rival, difficulty);
  if (module && !moduleRefusal(world, rival, module)) {
    next = cloneWorld(world);
    startModule(next, rival, module);
  }
  const kind = next.economy ? rivalProduction(next, rival, difficulty) : null;
  if (kind) {
    next = cloneWorld(next);
    startProduction(next, rival, kind);
  }
  // A full fleet with spare Metal buys hangar capacity instead of hoarding.
  if (next.baseRules && !next.players[rival].modules?.building) {
    const cost = baseUpgradeCost('capacity', next.players[rival].baseUpgrades);
    const alive = next.squads.filter((unit) => unit.ownerId === rival && unit.hp > 0 && !unit.isDecoy).length;
    if (cost !== null && alive >= effectiveFleetCap(next, rival) - 1 && next.players[rival].metal >= cost + 15) {
      next = cloneWorld(next);
      next.players[rival].metal -= cost;
      next.players[rival].baseUpgrades ??= { damage: 0, capacity: 0 };
      next.players[rival].baseUpgrades.capacity += 1;
    }
  }
  const planned = planTrainingEnemy(next, memories, difficulty, rival);
  return { world: applyEnemyOrders(next, planned.orders, rival), memories: planned.memories };
}
/** Applies rival orders without touching player sequence numbers. */
export function applyEnemyOrders(world: World, orders: readonly AiOrder[], rival: PlayerId = 'p2'): World {
  if (orders.length === 0) return world;
  const next = cloneWorld(world);
  for (const order of orders) {
    const squad = next.squads.find((unit) => unit.id === order.unitId && unit.ownerId === rival && unit.hp > 0);
    if (!squad) continue;
    if (order.kind === 'attack') {
      const target = attackTarget(next, order.targetId);
      if (!target || target.hp <= 0 || ('ownerId' in target && target.ownerId === rival) || !canSee(next, rival, target)) continue;
      squad.attackTargetId = order.targetId;
      squad.attackMemory = { x: target.x, y: target.y, seenAt: next.tick };
      squad.gather = null;
      squad.target = null;
      squad.route = [];
      squad.anchor = null;
      squad.stance = 'march';
      continue;
    }
    const point = { x: order.destination.x, y: order.destination.y };
    if (!cellOnBoard(next, point)) continue;
    if ((point.x !== squad.x || point.y !== squad.y) && !routeExists(next, squad, point)) continue;
    replaceDestination(squad, point);
    squad.target = { ...point };
  }
  return next;
}
export type { AiMemory, AiOrder, PlayerStance };
