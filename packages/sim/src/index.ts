import { parseCommand } from '@impulso/input';
import { planEnemyTurn, type EnemyScene } from './inteligencia-enemiga/training.js';
import type { AiMemory, AiOrder, AiUnit } from './inteligencia-enemiga/types.js';
import { advanceCapture, captureContext, guardianActive, resolveCombat } from './maps/mechanics.js';
import { BATTLEFIELD_MAP } from './maps/battlefield.js';
import { createBattlefieldWorldInternal } from './maps/world.js';
import {
  appendDestination, armAttack, blockedCells, consumeWaypoint, guardDestination, holdGround,
  leashBlocks, loopRoute, MAX_ROUTE_POINTS, refreshArrivals, replaceDestination,
  type PlayerStance, type WalkBoard,
} from './mecanicas/orders.js';
import { findPath as findSurfacePath } from './maps/pathfinding.js';
import { ESPIRAL } from './mapas/espiral.js';
import type { SectorLeido, Superficie } from './mapas/leer-tiled.js';

export { defineMapSpec, MAX_MAP_SIDE, MAX_MAP_CELLS } from './maps/types.js';
export type { MapCell, MapObjective, MapSpec } from './maps/types.js';
export { parseTiledJson, MAX_TILED_JSON_BYTES, MAX_TILED_LAYERS } from './maps/tiled.js';
export type { TiledGrid } from './maps/tiled.js';
export { BATTLEFIELD_MAP } from './maps/battlefield.js';
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
}
export type CommandRejection =
  | 'invalid_command' | 'unknown_player' | 'stale_sequence'
  | 'unknown_squad' | 'not_owner' | 'squad_destroyed'
  | 'out_of_bounds' | 'blocked_destination' | 'unreachable_destination' | 'route_full' | 'match_finished'
  | 'unknown_target' | 'friendly_target' | 'target_destroyed' | 'target_not_visible' | 'cannot_attack' | 'target_unavailable';
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
  };
}
export function createWorldOn(sector: SectorLeido): World {
  const node = (input: { id: string; kind: 'metal' | 'capture'; x: number; y: number }): ResourceNode => ({
    id: input.id, kind: input.kind, x: input.x, y: input.y,
    guardianId: `${input.id}-guardian`, ownerId: null, progress: { p1: 0, p2: 0 },
  });
  return {
    schemaVersion: 1, mode: 'training', tick: 0, width: sector.width, height: sector.height,
    obstacles: [],
    surface: {
      width: sector.width, height: sector.height,
      walkable: [...sector.walkable], level: [...sector.level], ramp: [...sector.ramp],
    },
    rules: { ...TRAINING_RULES },
    players: {
      p1: { id: 'p1', base: { ...sector.bases.p1 }, metal: 0, lastSequence: 0 },
      p2: { id: 'p2', base: { ...sector.bases.p2 }, metal: 0, lastSequence: 0 },
    },
    squads: [
      createSquad('p1-interceptor', 'p1', 'interceptor', sector.bases.p1),
      createSquad('p2-interceptor', 'p2', 'interceptor', sector.bases.p2),
    ],
    guardians: [],
    nodes: [
      ...sector.metals.map((cell, index) => node({ id: `metal-${index + 1}`, kind: 'metal', x: cell.x, y: cell.y })),
      ...sector.captures.map((cell, index) => node({ id: `capture-${index + 1}`, kind: 'capture', x: cell.x, y: cell.y })),
    ],
    core: { id: 'core', x: sector.core.x, y: sector.core.y, guardianId: 'core-guardian', open: false, progress: { p1: 0, p2: 0 } },
    winner: null,
  };
}
export function createSectorWorld(): World {
  return createWorldOn(ESPIRAL);
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
      p1: { ...world.players.p1, base: { ...world.players.p1.base } },
      p2: { ...world.players.p2, base: { ...world.players.p2.base } },
    },
    squads: world.squads.map((unit) => ({
      ...unit,
      anchor: unit.anchor ? { ...unit.anchor } : null,
      gather: unit.gather ? { ...unit.gather } : null,
      target: unit.target ? { ...unit.target } : null,
      route: unit.route.map((cell) => ({ ...cell })),
    })),
    guardians: world.guardians.map((unit) => ({ ...unit })),
    nodes: world.nodes.map((node) => ({ ...node, progress: { ...node.progress } })),
    core: { ...world.core, progress: { ...world.core.progress } },
    surface: copySurface(world.surface),
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
function cellOccupied(world: World, cell: Position, selfId: string): boolean {
  if (!world.surface) return false;
  const ship = world.squads.some((unit) => unit.hp > 0 && unit.id !== selfId && unit.x === cell.x && unit.y === cell.y);
  const guardian = world.guardians.some((unit) => unit.hp > 0 && unit.x === cell.x && unit.y === cell.y);
  return ship || guardian;
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
function moveSquads(world: World): void {
  for (const squad of world.squads) {
    if (squad.hp <= 0) continue;
    releaseLostTarget(world, squad);
    acquireStanceTarget(world, squad);
    const destination = movementDestination(world, squad);
    if (!destination) continue;
    const interval = Math.max(1, Math.round(world.rules.moveEveryTicks * UNIT_STATS[squad.kind].moveIntervalFactor));
    if (world.tick % interval !== 0) continue;
    const next = nextStep(world, squad, destination);
    if (!next) {
      if (squad.x === destination.x && squad.y === destination.y) consumeWaypoint(squad);
      else if (squad.attackTargetId && destination !== squad.target) squad.attackTargetId = null;
      else clearStuckRoute(squad);
      continue;
    }
    if (leashBlocks(squad, next, world.rules.visionRadius) || cellOccupied(world, next, squad.id)) continue;
    squad.x = next.x;
    squad.y = next.y;
    consumeWaypoint(squad);
  }
  refreshArrivals(world.squads.filter((unit) => unit.hp > 0), boardOf(world));
}
/** Exactly one integer tick; no clock, RNG, chain, renderer or inventory. */
export function stepWorld(world: World): World {
  if (world.winner !== null) return world;
  const next = cloneWorld(world);
  next.tick += 1;
  next.core.open = next.tick >= next.rules.coreOpenTick;
  moveSquads(next);
  resolveCombat(next.surface ? { ...next, level: next.surface.level } : next);
  const capture = captureContext(next);
  for (const node of next.nodes) {
    const captor = advanceCapture(next, node, next.rules.nodeCaptureTicks, capture);
    if (captor) node.ownerId = captor;
    if (node.kind === 'metal' && node.ownerId && next.tick % next.rules.tickRate === 0) next.players[node.ownerId].metal += 1;
  }
  if (next.core.open) next.winner = advanceCapture(next, next.core, next.rules.coreCaptureTicks, capture);
  return next;
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
    if (distance(squad, enemy) <= ATTACK_RANGE) return null;
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
    attackRange: ATTACK_RANGE, sightRange: world.rules.visionRadius + UNIT_STATS[unit.kind].visionBonus,
  };
}
function enemyScene(world: World): EnemyScene {
  const units = world.squads.filter((unit) => unit.ownerId === 'p2' && unit.hp > 0);
  const patrolByUnit: Record<string, Position[]> = {};
  const retreatByUnit: Record<string, Position> = {};
  for (const unit of units) {
    const base = world.players[unit.ownerId].base;
    patrolByUnit[unit.id] = PATROL_OFFSETS
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
export function planTrainingEnemy(world: World, memories: ReadonlyMap<string, AiMemory>): {
  memories: ReadonlyMap<string, AiMemory>;
  orders: readonly AiOrder[];
} {
  return planEnemyTurn(enemyScene(world), memories);
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
