import { parseCommand } from '@impulso/input';

export type PlayerId = 'p1' | 'p2';
export interface Position { x: number; y: number }
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
export interface Player {
  id: PlayerId;
  base: Position;
  metal: number;
  lastSequence: number;
}
export interface Squad extends Position {
  id: string;
  ownerId: PlayerId;
  kind: 'interceptor';
  hp: number;
  maxHp: number;
  damage: number;
  target: Position | null;
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
  | 'out_of_bounds' | 'match_finished';
export type CommandResult =
  | { accepted: true; world: World }
  | { accepted: false; reason: CommandRejection; world: World };

export function createWorld(): World {
  return {
    schemaVersion: 1, mode: 'training', tick: 0, width: 12, height: 12,
    rules: { ...TRAINING_RULES },
    // Reflection through x=y gives both players equal travel distances.
    players: {
      p1: { id: 'p1', base: { x: 1, y: 10 }, metal: 0, lastSequence: 0 },
      p2: { id: 'p2', base: { x: 10, y: 1 }, metal: 0, lastSequence: 0 },
    },
    squads: [
      { id: 'p1-interceptor', ownerId: 'p1', kind: 'interceptor', x: 1, y: 10, hp: 120, maxHp: 120, damage: 12, target: null },
      { id: 'p2-interceptor', ownerId: 'p2', kind: 'interceptor', x: 10, y: 1, hp: 120, maxHp: 120, damage: 12, target: null },
    ],
    guardians: [
      { id: 'metal-guardian', objectiveId: 'metal-1', x: 3, y: 3, hp: 36, maxHp: 36, damage: 2 },
      { id: 'core-guardian', objectiveId: 'core', x: 6, y: 6, hp: 60, maxHp: 60, damage: 3 },
    ],
    nodes: [{ id: 'metal-1', kind: 'metal', x: 3, y: 3, guardianId: 'metal-guardian', ownerId: null, progress: { p1: 0, p2: 0 } }],
    core: { id: 'core', x: 6, y: 6, guardianId: 'core-guardian', open: false, progress: { p1: 0, p2: 0 } },
    winner: null,
  };
}
export function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
function cloneWorld(world: World): World {
  return {
    ...world, rules: { ...world.rules },
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
  if (command.x < 0 || command.y < 0 || command.x >= world.width || command.y >= world.height) return reject('out_of_bounds');
  const next = cloneWorld(world);
  next.players[playerId].lastSequence = command.seq;
  next.squads.find((unit) => unit.id === squad.id)!.target = { x: command.x, y: command.y };
  return { accepted: true, world: next };
}
function guardianActive(world: World, guardian: Guardian): boolean {
  return guardian.hp > 0 && (guardian.id !== world.core.guardianId || world.core.open);
}
function moveSquads(world: World): void {
  if (world.tick % world.rules.moveEveryTicks !== 0) return;
  for (const squad of world.squads) {
    if (squad.hp <= 0 || squad.target === null) continue;
    // Empty training arena. Obstacles and general pathfinding are future work.
    if (squad.x !== squad.target.x) squad.x += squad.target.x > squad.x ? 1 : -1;
    else if (squad.y !== squad.target.y) squad.y += squad.target.y > squad.y ? 1 : -1;
    if (squad.x === squad.target.x && squad.y === squad.target.y) squad.target = null;
  }
}
function resolveCombat(world: World): void {
  if (world.tick % world.rules.attackEveryTicks !== 0) return;
  const hits = new Map<string, number>();
  const hit = (id: string, damage: number): void => { hits.set(id, (hits.get(id) ?? 0) + damage); };
  const byId = (a: { id: string }, b: { id: string }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  // All attacks are planned before applying damage, including fatal replies.
  for (const squad of world.squads.filter((unit) => unit.hp > 0)) {
    const enemies: (Squad | Guardian)[] = [
      ...world.squads.filter((unit) => unit.hp > 0 && unit.ownerId !== squad.ownerId),
      ...world.guardians.filter((unit) => guardianActive(world, unit)),
    ];
    const target = enemies.filter((unit) => distance(squad, unit) <= 1).sort(byId)[0];
    if (target) hit(target.id, squad.damage);
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
    .filter((unit) => unit.hp > 0 && distance(unit, objective) <= world.rules.captureRadius)
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
