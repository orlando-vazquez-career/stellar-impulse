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
import { findPath as findSurfacePath } from './maps/pathfinding.js';
import { SECTOR_01 } from './mapas/sector-01.js';
import {
  BASE_INCOME_TICKS, BUILD_TICKS, FLEET_CAP, launchCell, REPAIR_RADIUS, STARTING_METAL, UNIT_COSTS,
  type ProductionState,
  baseUpgradeCost, fleetCapacity, baseDamage, BASE_DEFENSE_RANGE, type BaseUpgrades,
} from './economia.js';
import { rivalGoals, rivalProduction, type RivalDifficulty } from './inteligencia-enemiga/estrategia.js';
export { RIVAL_PROFILES } from './inteligencia-enemiga/estrategia.js';
export type { RivalDifficulty } from './inteligencia-enemiga/estrategia.js';
export { BASE_INCOME_TICKS, BUILD_TICKS, FLEET_CAP, REPAIR_RADIUS, STARTING_METAL, UNIT_COSTS } from './economia.js';
export type { ProductionOrder, ProductionState } from './economia.js';
export { baseUpgradeCost, fleetCapacity, baseDamage, MAX_BASE_UPGRADE_LEVEL, BASE_DEFENSE_RANGE, CAPACITY_PER_LEVEL, BASE_DAMAGE_PER_LEVEL } from './economia.js';
export type { BaseUpgrades, BaseUpgradeKind } from './economia.js';
export { leerSuperficie } from './mapas/leer-tiled.js';
export { findPath as findTiledPath } from './maps/pathfinding.js';
import { ESPIRAL } from './mapas/espiral.js';
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
/** Prototype values. The brief defines relative roles; numeric balance is pending playtests. */
export const UNIT_STATS = Object.freeze({
  explorer: Object.freeze({ maxHp: 70, damage: 0, moveIntervalFactor: 2 / 3, visionBonus: 2, canCapture: false }),
  interceptor: Object.freeze({ maxHp: 120, damage: 12, moveIntervalFactor: 1, visionBonus: 0, canCapture: true }),
  frigate: Object.freeze({ maxHp: 170, damage: 10, moveIntervalFactor: 4 / 3, visionBonus: 0, canCapture: true }),
  bomber: Object.freeze({ maxHp: 220, damage: 16, moveIntervalFactor: 2, visionBonus: 0, canCapture: true }),
});
const ADVANTAGE: Partial<Record<UnitKind, UnitKind>> = { interceptor: 'bomber', frigate: 'interceptor', bomber: 'frigate' };
export function damageAgainst(attacker: UnitKind, defender: UnitKind, baseDamage: number = UNIT_STATS[attacker].damage): number {
  return ADVANTAGE[attacker] === defender ? Math.round(baseDamage * 1.25) : baseDamage;
}
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
}
export interface Squad extends Position {
  id: string;
  ownerId: PlayerId;
  kind: UnitKind;
  hp: number;
  maxHp: number;
  damage: number;
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
}
export function createSquad(id: string, ownerId: PlayerId, kind: UnitKind, position: Position): Squad {
  const stats = UNIT_STATS[kind];
  return { id, ownerId, kind, x: position.x, y: position.y,
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
}
export type CommandRejection =
  | 'invalid_command' | 'unknown_player' | 'stale_sequence'
  | 'unknown_squad' | 'not_owner' | 'squad_destroyed'
  | 'out_of_bounds' | 'blocked_destination' | 'unreachable_destination' | 'route_full' | 'match_finished'
  | 'unknown_target' | 'friendly_target' | 'target_destroyed' | 'target_not_visible' | 'cannot_attack' | 'target_unavailable'
  | 'insufficient_metal' | 'fleet_full' | 'production_busy' | 'upgrade_maxed';
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
/** Training maps by id: Diego's Espiral Estelar (58×58) and the original Sector 01 (29×29). */
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
  };
}
export function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
function canSee(world: World, playerId: PlayerId, target: Position): boolean {
  if (distance(world.players[playerId].base, target) <= world.rules.visionRadius) return true;
  return world.squads.some((unit) => unit.ownerId === playerId && unit.hp > 0
    && distance(unit, target) <= world.rules.visionRadius + UNIT_STATS[unit.kind].visionBonus);
}
function attackTarget(world: World, id: string): Squad | Guardian | undefined {
  return world.squads.find((unit) => unit.id === id) ?? world.guardians.find((unit) => unit.id === id);
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
function cloneWorld(world: World): World {
  return {
    ...world, rules: { ...world.rules }, obstacles: world.obstacles.map((point) => ({ ...point })),
    players: {
      p1: { ...world.players.p1, base: { ...world.players.p1.base }, baseUpgrades: world.players.p1.baseUpgrades && { ...world.players.p1.baseUpgrades } },
      p2: { ...world.players.p2, base: { ...world.players.p2.base }, baseUpgrades: world.players.p2.baseUpgrades && { ...world.players.p2.baseUpgrades } },
    },
    squads: world.squads.map((unit) => ({
      ...unit,
      anchor: unit.anchor ? { ...unit.anchor } : null,
      gather: unit.gather ? { ...unit.gather } : null,
      target: unit.target ? { ...unit.target } : null,
      route: unit.route.map((cell) => ({ ...cell })),
      transit: unit.transit ? { ...unit.transit, from: { ...unit.transit.from } } : undefined,
    })),
    guardians: world.guardians.map((unit) => ({ ...unit,
      transit: unit.transit ? { ...unit.transit, from: { ...unit.transit.from } } : undefined })),
    nodes: world.nodes.map((node) => ({ ...node, progress: { ...node.progress } })),
    core: { ...world.core, progress: { ...world.core.progress } },
    surface: copySurface(world.surface),
    production: {
      p1: world.production.p1 ? { ...world.production.p1 } : null,
      p2: world.production.p2 ? { ...world.production.p2 } : null,
    },
    built: { ...world.built },
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

function boardOf(world: World): WalkBoard {
  if (!world.surface) return { width: world.width, height: world.height, blocked: blockedCells(world.obstacles) };
  const blocked = new Set<string>();
  world.surface.walkable.forEach((open, index) => {
    if (open) return;
    blocked.add(`${index % world.width},${Math.floor(index / world.width)}`);
  });
  return { width: world.width, height: world.height, blocked };
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
  if (world.surface) return findSurfacePath(world.surface, from, to).status === 'found';
  return findPath(from, to, world.width, world.height, world.obstacles).length > 0;
}
function nextStep(world: World, from: Position, to: Position): Position | null {
  if (from.x === to.x && from.y === to.y) return null;
  if (world.surface) {
    const result = findSurfacePath(world.surface, from, to);
    return result.status === 'found' ? result.path[0] ?? null : null;
  }
  return findPath(from, to, world.width, world.height, world.obstacles)[1] ?? null;
}
/** Every living ship holds its cell, including allies. */
function cellOccupied(world: World, cell: Position, selfId: string): boolean {
  const holds = (unit: Squad | Guardian) => (unit.x === cell.x && unit.y === cell.y)
    || (!!unit.transit && unit.transit.untilTick > world.tick
      && unit.transit.from.x === cell.x && unit.transit.from.y === cell.y);
  const ship = world.squads.some((unit) => unit.hp > 0 && unit.id !== selfId
    && holds(unit));
  const guardian = world.guardians.some((unit) => unit.hp > 0 && unit.id !== selfId && holds(unit));
  return ship || guardian;
}

/** Replan around live traffic without changing the static terrain or losing the order. */
function trafficStep(world: World, squad: Squad, destination: Position): Position | null {
  if (cellOccupied(world, destination, squad.id)) {
    if (withinReach({ diagonalReach: world.surface !== null }, squad, destination)) return null;
    // A blocked objective still needs a legal approach, especially in the legacy drill
    // where a diagonal neighbour is outside weapons range.
    const approach = DIRECTIONS.map(([dx, dy]) => ({ x: destination.x + dx, y: destination.y + dy }))
      .filter((point) => cellOnBoard(world, point) && !cellOccupied(world, point, squad.id)
        && withinReach({ diagonalReach: world.surface !== null }, point, destination)
        && routeExists(world, squad, point))
      .sort((a, b) => distance(a, squad) - distance(b, squad) || a.y - b.y || a.x - b.x)[0];
    if (!approach) return null;
    destination = approach;
  }
  const direct = nextStep(world, squad, destination);
  const clear = (point: Position) => !cellOccupied(world, point, squad.id);
  const cornerClear = (point: Position) => point.x === squad.x || point.y === squad.y
    || (clear({ x: point.x, y: squad.y }) && clear({ x: squad.x, y: point.y }));
  if (!direct || (clear(direct) && cornerClear(direct))) return direct;
  // An occupied goal is allowed in the search (e.g. an attack target), but never entered.
  const open = (point: Position) => (point.x === destination.x && point.y === destination.y) || clear(point);
  let alternative: Position | null;
  if (world.surface) {
    const walkable = world.surface.walkable.map((walkable, index) => walkable
      && open({ x: index % world.width, y: Math.floor(index / world.width) }));
    walkable[squad.y * world.width + squad.x] = true;
    const route = findSurfacePath({ ...world.surface, walkable }, squad, destination);
    alternative = route.status === 'found' ? route.path[0] ?? null : null;
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
  refreshArrivals(next.squads.filter((unit) => unit.hp > 0), boardOf(next));
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
      holdGround(unit);
      unit.hp = 0;
      delete unit.transit;
    }
    refreshArrivals(next.squads.filter((unit) => unit.hp > 0), boardOf(next));
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
    if (UNIT_STATS[squad.kind].damage <= 0) return reject('cannot_attack');
    const target = attackTarget(world, command.targetId);
    if (!target) return reject('unknown_target');
    if ('ownerId' in target && target.ownerId === playerId) return reject('friendly_target');
    if (target.hp <= 0) return reject('target_destroyed');
    if ('objectiveId' in target && !guardianActive(world, target)) return reject('target_unavailable');
    if (!canSee(world, playerId, target)) return reject('target_not_visible');
    if (!routeExists(world, squad, target)) return reject('unreachable_destination');
    return commitOrder(world, playerId, command.seq, squad.id, (nextSquad) => {
      nextSquad.stance = 'march';
      nextSquad.anchor = null;
      nextSquad.gather = null;
      nextSquad.target = null;
      nextSquad.route = [];
      nextSquad.attackTargetId = command.targetId;
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
function swapBlockedAllies(world: World, squad: Squad, destination: Position, moved: Set<string>): boolean {
  const step = nextStep(world, squad, destination);
  if (!step || (squad.transit && squad.transit.untilTick > world.tick)) return false;
  const other = world.squads.find((unit) => unit.hp > 0 && unit.ownerId === squad.ownerId
    && unit.id !== squad.id && unit.x === step.x && unit.y === step.y);
  if (!other || moved.has(other.id) || (other.transit && other.transit.untilTick > world.tick)) return false;
  const otherDestination = movementDestination(world, other);
  const interval = (unit: Squad) => Math.max(1, Math.round(world.rules.moveEveryTicks * UNIT_STATS[unit.kind].moveIntervalFactor));
  if (!otherDestination || world.tick % interval(other) !== 0) return false;
  const otherStep = nextStep(world, other, otherDestination);
  if (!otherStep || otherStep.x !== squad.x || otherStep.y !== squad.y
    || trafficStep(world, other, otherDestination) !== null
    || leashBlocks(squad, step, world.rules.visionRadius)
    || leashBlocks(other, otherStep, world.rules.visionRadius)) return false;
  // The exception belongs to this pair only. Third-party hulls and departure
  // reservations, including diagonal corners, still block both movements.
  const traffic = { ...world, squads: world.squads.filter((unit) => unit.id !== squad.id && unit.id !== other.id) };
  const clear = (from: Position, to: Position) => !cellOccupied(traffic, to, '')
    && (from.x === to.x || from.y === to.y || (!cellOccupied(traffic, { x: to.x, y: from.y }, '')
      && !cellOccupied(traffic, { x: from.x, y: to.y }, '')));
  if (!clear(squad, other) || !clear(other, squad)) return false;
  const from = { x: squad.x, y: squad.y };
  const otherFrom = { x: other.x, y: other.y };
  squad.transit = { from, untilTick: world.tick + interval(squad) };
  other.transit = { from: otherFrom, untilTick: world.tick + interval(other) };
  Object.assign(squad, otherFrom);
  Object.assign(other, from);
  moved.add(squad.id);
  moved.add(other.id);
  consumeWaypoint(squad);
  consumeWaypoint(other);
  return true;
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
  const interval = Math.max(1, Math.round(world.rules.moveEveryTicks * UNIT_STATS[squad.kind].moveIntervalFactor));
  const otherInterval = Math.max(1, Math.round(world.rules.moveEveryTicks * UNIT_STATS[other.kind].moveIntervalFactor));
  squad.transit = { from: { x: squad.x, y: squad.y }, untilTick: world.tick + interval };
  squad.trafficYieldUntil = world.tick + 3 * Math.max(interval, otherInterval);
  Object.assign(squad, pocket);
  return true;
}

function moveSquads(world: World): void {
  const moved = new Set<string>();
  // Resolve targets before traffic so a pair sees the same intentions regardless
  // of which member is processed first.
  for (const squad of world.squads) {
    if (squad.hp <= 0) continue;
    releaseLostTarget(world, squad);
    acquireStanceTarget(world, squad);
  }
  for (const squad of world.squads) {
    if (squad.hp <= 0 || moved.has(squad.id) || (squad.trafficYieldUntil ?? 0) > world.tick) continue;
    const destination = movementDestination(world, squad);
    if (!destination) continue;
    const interval = Math.max(1, Math.round(world.rules.moveEveryTicks * UNIT_STATS[squad.kind].moveIntervalFactor));
    if (world.tick % interval !== 0) continue;
    if (routeBlockedByTraffic(world, squad, destination) && yieldToBlockedAlly(world, squad, destination)) continue;
    const next = trafficStep(world, squad, destination);
    if (!next) {
      if (swapBlockedAllies(world, squad, destination, moved)) continue;
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
    consumeWaypoint(squad);
  }
  refreshArrivals(world.squads.filter((unit) => unit.hp > 0), boardOf(world));
}
function productionRefusal(world: World, playerId: PlayerId, kind: UnitKind): CommandRejection | null {
  if (world.production[playerId]) return 'production_busy';
  if (world.squads.filter((unit) => unit.ownerId === playerId && unit.hp > 0).length >= fleetCapacity(world.players[playerId].baseUpgrades)) return 'fleet_full';
  if (world.players[playerId].metal < UNIT_COSTS[kind]) return 'insufficient_metal';
  return null;
}
function startProduction(world: World, playerId: PlayerId, kind: UnitKind): void {
  world.players[playerId].metal -= UNIT_COSTS[kind];
  world.production[playerId] = { kind, readyTick: world.tick + BUILD_TICKS[kind] };
}
/** Base income, hangar launches and repairs: the base guarantees a way back into the fight. */
function runBases(world: World): void {
  for (const playerId of ['p1', 'p2'] as const) {
    const player = world.players[playerId];
    if (world.tick % BASE_INCOME_TICKS === 0) player.metal += 1;
    const order = world.production[playerId];
    if (order && world.tick >= order.readyTick) {
      const cell = launchCell(player.base, world.width, world.height,
        (point) => cellOnBoard(world, point), (point) => cellOccupied(world, point, ''));
      // A blocked hangar holds the finished ship until a launch cell frees up.
      if (cell) {
        world.built[playerId] += 1;
        world.squads.push(createSquad(`${playerId}-${order.kind}-${world.built[playerId]}`, playerId, order.kind, cell));
        world.production[playerId] = null;
      }
    }
    if (world.tick % world.rules.tickRate !== 0) continue;
    for (const squad of world.squads) {
      if (squad.ownerId === playerId && squad.hp > 0 && squad.hp < squad.maxHp && distance(squad, player.base) <= REPAIR_RADIUS) {
        squad.hp = Math.min(squad.maxHp, squad.hp + 2);
      }
    }
  }
}
/** Exactly one integer tick; no clock, RNG, chain, renderer or inventory. */
export function stepWorld(world: World): World {
  if (world.winner !== null) return world;
  const next = cloneWorld(world);
  next.tick += 1;
  next.core.open = next.tick >= next.rules.coreOpenTick;
  if (next.economy) runBases(next);
  moveSquads(next);
  if (next.economy) moveGuardians(next);
  resolveCombat(next.surface ? { ...next, level: next.surface.level, diagonalReach: true } : next);
  if (next.economy) resolveBaseDefense(next);
  const capture = captureContext(next);
  for (const node of next.nodes) {
    const captor = advanceCapture(next, node, next.rules.nodeCaptureTicks, capture);
    if (captor) node.ownerId = captor;
    if (node.kind === 'metal' && node.ownerId && next.tick % next.rules.tickRate === 0) next.players[node.ownerId].metal += 1;
  }
  if (next.core.open) next.winner = advanceCapture(next, next.core, next.rules.coreCaptureTicks, capture);
  return next;
}

/** Bases fire once per combat beat at the nearest hostile in their visible perimeter. */
function resolveBaseDefense(world: World): void {
  if (world.tick % world.rules.attackEveryTicks !== 0) return;
  const hits = new Map<string, number>();
  for (const player of Object.values(world.players)) {
    const damage = baseDamage(player.baseUpgrades);
    if (damage <= 0) continue;
    const target = [...world.squads.filter((unit) => unit.ownerId !== player.id && unit.hp > 0),
      ...world.guardians.filter((unit) => guardianActive(world, unit))]
      .filter((unit) => distance(unit, player.base) <= Math.min(BASE_DEFENSE_RANGE, world.rules.visionRadius))
      .sort((a, b) => distance(a, player.base) - distance(b, player.base) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    if (target) hits.set(target.id, (hits.get(target.id) ?? 0) + damage);
  }
  for (const unit of [...world.squads, ...world.guardians]) unit.hp = Math.max(0, unit.hp - (hits.get(unit.id) ?? 0));
}
function releaseLostTarget(world: World, squad: Squad): void {
  if (!squad.attackTargetId) return;
  const enemy = attackTarget(world, squad.attackTargetId);
  const unseen = !enemy || enemy.hp <= 0 || !canSee(world, squad.ownerId, enemy);
  const leftPost = squad.stance === 'guard' && !!squad.anchor && !!enemy
    && distance(squad.anchor, enemy) > world.rules.visionRadius;
  if (unseen || leftPost) squad.attackTargetId = null;
}
function acquireStanceTarget(world: World, squad: Squad): void {
  if (squad.attackTargetId || UNIT_STATS[squad.kind].damage <= 0) return;
  if (squad.stance !== 'guard' && squad.stance !== 'attack') return;
  const origin = squad.stance === 'guard' && squad.anchor ? squad.anchor : squad;
  const bonus = squad.stance === 'attack' ? UNIT_STATS[squad.kind].visionBonus : 0;
  const foe = nearestFoe(world, squad, origin, world.rules.visionRadius + bonus);
  if (foe) squad.attackTargetId = foe.id;
}
function nearestFoe(world: World, squad: Squad, origin: Position, radius: number): Squad | Guardian | undefined {
  const foes: Array<Squad | Guardian> = [
    ...world.squads.filter((unit) => unit.hp > 0 && unit.ownerId !== squad.ownerId),
    ...world.guardians.filter((unit) => guardianActive(world, unit)),
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
  if (enemy && enemy.hp > 0) {
    if (withinReach({ diagonalReach: world.surface !== null }, squad, enemy)) return null;
    return enemy;
  }
  return squad.target ?? guardDestination(squad);
}
function clearStuckRoute(squad: Squad): void {
  squad.target = null;
  squad.gather = null;
  squad.route = [];
  squad.attackTargetId = null;
}
function toAi(world: World, unit: Squad): AiUnit {
  return {
    id: unit.id, position: { x: unit.x, y: unit.y }, health: unit.hp, maxHealth: unit.maxHp,
    // Diego's AI measures Manhattan distance; a diagonal neighbour is 2 on sector maps.
    attackRange: world.surface ? 2 : ATTACK_RANGE, sightRange: world.rules.visionRadius + UNIT_STATS[unit.kind].visionBonus,
  };
}
function enemyScene(world: World, difficulty: RivalDifficulty): EnemyScene {
  const units = world.squads.filter((unit) => unit.ownerId === 'p2' && unit.hp > 0);
  const patrolByUnit: Record<string, Position[]> = {};
  const retreatByUnit: Record<string, Position> = {};
  const goals = world.economy ? rivalGoals(world, 'p2', (target) => canSee(world, 'p2', target), difficulty) : new Map<string, Position>();
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
    units: units.map((unit) => toAi(world, unit)),
    enemies: world.squads.filter((unit) => unit.ownerId === 'p1' && unit.hp > 0).map((unit) => toAi(world, unit)),
    patrolByUnit, retreatByUnit,
  };
}
/** Training rival only. A seated human on p2 must not call this. */
export function planTrainingEnemy(world: World, memories: ReadonlyMap<string, AiMemory>, difficulty: RivalDifficulty = 'medium'): {
  memories: ReadonlyMap<string, AiMemory>;
  orders: readonly AiOrder[];
} {
  return planEnemyTurn(enemyScene(world, difficulty), memories);
}
/** One full rival turn for an empty p2 seat: hangar order, then fleet orders. */
export function runTrainingRival(world: World, memories: ReadonlyMap<string, AiMemory>, difficulty: RivalDifficulty = 'medium'): {
  world: World; memories: ReadonlyMap<string, AiMemory>;
} {
  let next = world;
  const kind = world.economy ? rivalProduction(world, 'p2', difficulty) : null;
  if (kind) {
    next = cloneWorld(world);
    startProduction(next, 'p2', kind);
  }
  const planned = planTrainingEnemy(next, memories, difficulty);
  return { world: applyEnemyOrders(next, planned.orders), memories: planned.memories };
}
/** Applies rival orders without touching player sequence numbers. */
export function applyEnemyOrders(world: World, orders: readonly AiOrder[]): World {
  if (orders.length === 0) return world;
  const next = cloneWorld(world);
  for (const order of orders) {
    const squad = next.squads.find((unit) => unit.id === order.unitId && unit.ownerId === 'p2' && unit.hp > 0);
    if (!squad) continue;
    if (order.kind === 'attack') {
      const target = attackTarget(next, order.targetId);
      if (!target || target.hp <= 0 || ('ownerId' in target && target.ownerId !== 'p1')) continue;
      squad.attackTargetId = order.targetId;
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
