import { parseCommand } from '@impulso/input';

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
  target: Position | null;
  attackTargetId: string | null;
}
export function createSquad(id: string, ownerId: PlayerId, kind: UnitKind, position: Position): Squad {
  const stats = UNIT_STATS[kind];
  return { id, ownerId, kind, x: position.x, y: position.y,
    hp: stats.maxHp, maxHp: stats.maxHp, damage: stats.damage, target: null, attackTargetId: null };
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
  kind: 'metal';
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
  | 'out_of_bounds' | 'blocked_destination' | 'unreachable_destination' | 'match_finished'
  | 'unknown_target' | 'friendly_target' | 'target_destroyed' | 'target_not_visible' | 'cannot_attack' | 'target_unavailable';
export type CommandResult =
  | { accepted: true; world: World }
  | { accepted: false; reason: CommandRejection; world: World };

export function createWorld(): World {
  return {
    schemaVersion: 1, mode: 'training', tick: 0, width: 20, height: 20,
    obstacles: TRAINING_OBSTACLES.map((point) => ({ ...point })),
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
    squads: world.squads.map((unit) => ({ ...unit, target: unit.target ? { ...unit.target } : null })),
    guardians: world.guardians.map((unit) => ({ ...unit })),
    nodes: world.nodes.map((node) => ({ ...node, progress: { ...node.progress } })),
    core: { ...world.core, progress: { ...world.core.progress } },
  };
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
    if (!findPath(squad, target, world.width, world.height, world.obstacles).length) return reject('unreachable_destination');
    const next = cloneWorld(world);
    next.players[playerId].lastSequence = command.seq;
    const nextSquad = next.squads.find((unit) => unit.id === squad.id)!;
    nextSquad.target = null;
    nextSquad.attackTargetId = command.targetId;
    return { accepted: true, world: next };
  }
  if (command.x < 0 || command.y < 0 || command.x >= world.width || command.y >= world.height) return reject('out_of_bounds');
  if (world.obstacles.some((point) => point.x === command.x && point.y === command.y)) return reject('blocked_destination');
  if (!findPath(squad, command, world.width, world.height, world.obstacles).length) return reject('unreachable_destination');
  const next = cloneWorld(world);
  next.players[playerId].lastSequence = command.seq;
  const nextSquad = next.squads.find((unit) => unit.id === squad.id)!;
  nextSquad.target = { x: command.x, y: command.y };
  nextSquad.attackTargetId = null;
  return { accepted: true, world: next };
}
function guardianActive(world: World, guardian: Guardian): boolean {
  return guardian.hp > 0 && (guardian.id !== world.core.guardianId || world.core.open);
}
function moveSquads(world: World): void {
  for (const squad of world.squads) {
    if (squad.hp <= 0) continue;
    const enemy = squad.attackTargetId ? attackTarget(world, squad.attackTargetId) : undefined;
    if (squad.attackTargetId && (!enemy || enemy.hp <= 0 || !canSee(world, squad.ownerId, enemy))) squad.attackTargetId = null;
    const destination = squad.attackTargetId && enemy ? enemy : squad.target;
    if (!destination || (squad.attackTargetId && distance(squad, destination) <= 1)) continue;
    const interval = Math.max(1, Math.round(world.rules.moveEveryTicks * UNIT_STATS[squad.kind].moveIntervalFactor));
    if (world.tick % interval !== 0) continue;
    const path = findPath(squad, destination, world.width, world.height, world.obstacles);
    if (path.length < 2) { squad.target = null; squad.attackTargetId = null; continue; }
    squad.x = path[1]!.x;
    squad.y = path[1]!.y;
    if (squad.target && squad.x === squad.target.x && squad.y === squad.target.y) squad.target = null;
  }
}
function resolveCombat(world: World): void {
  if (world.tick % world.rules.attackEveryTicks !== 0) return;
  const hits = new Map<string, number>();
  const hit = (id: string, damage: number): void => { hits.set(id, (hits.get(id) ?? 0) + damage); };
  const byId = (a: { id: string }, b: { id: string }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  // All attacks are planned before applying damage, including fatal replies.
  for (const squad of world.squads.filter((unit) => unit.hp > 0 && UNIT_STATS[unit.kind].damage > 0)) {
    const enemies: (Squad | Guardian)[] = [
      ...world.squads.filter((unit) => unit.hp > 0 && unit.ownerId !== squad.ownerId),
      ...world.guardians.filter((unit) => guardianActive(world, unit)),
    ];
    const inRange = enemies.filter((unit) => distance(squad, unit) <= 1).sort(byId);
    const target = inRange.find((unit) => unit.id === squad.attackTargetId) ?? inRange[0];
    if (target) hit(target.id, 'kind' in target ? damageAgainst(squad.kind, target.kind, squad.damage) : squad.damage);
  }
  for (const guardian of world.guardians.filter((unit) => guardianActive(world, unit))) {
    const target = world.squads.filter((unit) => unit.hp > 0 && distance(guardian, unit) <= 1).sort(byId)[0];
    if (target) hit(target.id, guardian.damage);
  }
  for (const unit of [...world.squads, ...world.guardians]) unit.hp = Math.max(0, unit.hp - (hits.get(unit.id) ?? 0));
}
function advanceCapture(world: World, objective: CaptureObjective, required: number): PlayerId | null {
  if (world.guardians.some((unit) => unit.id === objective.guardianId && unit.hp > 0)) return null;
  const present = new Set(world.squads
    .filter((unit) => unit.hp > 0 && UNIT_STATS[unit.kind].canCapture && distance(unit, objective) <= world.rules.captureRadius)
    .map((unit) => unit.ownerId));
  if (present.size === 2) return null;
  for (const playerId of ['p1', 'p2'] as const) {
    objective.progress[playerId] = present.has(playerId)
      ? Math.min(required, objective.progress[playerId] + 1)
      : Math.max(0, objective.progress[playerId] - 1);
  }
  for (const playerId of ['p1', 'p2'] as const) {
    if (objective.progress[playerId] >= required && present.has(playerId)) return playerId;
  }
  return null;
}
/** Exactly one integer tick; no clock, RNG, chain, renderer or inventory. */
export function stepWorld(world: World): World {
  if (world.winner !== null) return world;
  const next = cloneWorld(world);
  next.tick += 1;
  next.core.open = next.tick >= next.rules.coreOpenTick;
  moveSquads(next);
  resolveCombat(next);
  for (const node of next.nodes) {
    const captor = advanceCapture(next, node, next.rules.nodeCaptureTicks);
    if (captor) node.ownerId = captor;
    if (node.ownerId && next.tick % next.rules.tickRate === 0) next.players[node.ownerId].metal += 1;
  }
  if (next.core.open) next.winner = advanceCapture(next, next.core, next.rules.coreCaptureTicks);
  return next;
}
