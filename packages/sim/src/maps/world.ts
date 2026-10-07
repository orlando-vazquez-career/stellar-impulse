import { MAX_GROUP_UNITS, parseBattlefieldCommand } from '@impulso/input';
import type { Core, Guardian, Player, PlayerId, ResourceNode, Rules, Squad } from '../index.js';
import { advanceCapture, captureContext, resolveCombat } from './mechanics.js';
import { advanceOccupancy } from './occupancy.js';
import { findPath } from './pathfinding.js';
import { planFormation } from '../mecanicas/formations.js';
import { defineMapSpec, type MapCell, type MapSpec } from './types.js';
import { computeVisibility, MAX_VISIBILITY_RADIUS, unionExplored } from './visibility.js';

export interface BattlefieldSquad extends Squad { kind: 'interceptor'; route: MapCell[] }

/** Separate schema: the legacy training World remains untouched. */
export interface BattlefieldWorld {
  schemaVersion: 2;
  mode: 'battlefield';
  tick: number;
  width: number;
  height: number;
  map: MapSpec;
  rules: Rules;
  players: Record<PlayerId, Player>;
  squads: BattlefieldSquad[];
  guardians: Guardian[];
  nodes: ResourceNode[];
  core: Core;
  visible: Record<PlayerId, boolean[]>;
  explored: Record<PlayerId, boolean[]>;
  winner: PlayerId | null;
}

export type BattlefieldRejection = 'invalid_command' | 'unknown_player' | 'match_finished' | 'stale_sequence'
  | 'unit_unavailable' | 'out_of_bounds' | 'blocked' | 'unreachable' | 'budget_exceeded'
  | 'unknown_target' | 'friendly_target' | 'target_destroyed' | 'target_not_visible' | 'cannot_attack'
  | 'target_unavailable';
export type BattlefieldCommandResult =
  | { accepted: true; world: BattlefieldWorld; expansions: number }
  | { accepted: false; reason: BattlefieldRejection; world: BattlefieldWorld; expansions: number };

const PLAYERS: readonly PlayerId[] = ['p1', 'p2'];
const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const indexOf = (map: MapSpec, cell: MapCell): number => cell.y * map.width + cell.x;

function updateFog(world: BattlefieldWorld): void {
  for (const player of PLAYERS) {
    const sources: MapCell[] = [world.players[player].base,
      ...world.squads.filter((unit) => unit.ownerId === player && unit.hp > 0)];
    const visible = computeVisibility(world.map, sources, world.rules.visionRadius);
    world.visible[player] = visible;
    world.explored[player] = unionExplored(world.explored[player], visible);
  }
}

/** Build the default two-squad roster; tests may add squads up to the 128-unit scenario. */
export function createBattlefieldWorldInternal(mapInput: MapSpec, rules: Rules): BattlefieldWorld {
  const map = defineMapSpec(mapInput);
  if (!Number.isSafeInteger(rules.visionRadius) || rules.visionRadius < 0 || rules.visionRadius > MAX_VISIBILITY_RADIUS
    || !Number.isSafeInteger(rules.tickRate) || rules.tickRate < 1
    || !Number.isSafeInteger(rules.moveEveryTicks) || rules.moveEveryTicks < 1
    || !Number.isSafeInteger(rules.attackEveryTicks) || rules.attackEveryTicks < 1
    || !Number.isSafeInteger(rules.captureRadius) || rules.captureRadius < 0 || rules.captureRadius > MAX_VISIBILITY_RADIUS
    || !Number.isSafeInteger(rules.nodeCaptureTicks) || rules.nodeCaptureTicks < 1
    || !Number.isSafeInteger(rules.coreOpenTick) || rules.coreOpenTick < 0
    || !Number.isSafeInteger(rules.coreCaptureTicks) || rules.coreCaptureTicks < 1) throw new Error('Invalid battlefield rules');
  const coreSpec = map.objectives.find((objective) => objective.kind === 'core')!;
  const rosterIds = new Set(['p1-interceptor', 'p2-interceptor']);
  if (map.objectives.some((objective) => rosterIds.has(objective.id) || rosterIds.has(objective.guardianId))) {
    throw new Error('Map entity ID collides with roster');
  }
  const players: BattlefieldWorld['players'] = {
    p1: { id: 'p1', base: { ...map.bases.p1 }, metal: 0, lastSequence: 0 },
    p2: { id: 'p2', base: { ...map.bases.p2 }, metal: 0, lastSequence: 0 },
  };
  const squads: BattlefieldSquad[] = PLAYERS.map((player) => ({
    id: `${player}-interceptor`, ownerId: player, kind: 'interceptor',
    x: players[player].base.x, y: players[player].base.y,
    hp: 120, maxHp: 120, damage: 12, stance: 'march', anchor: null, gather: null,
    target: null, attackTargetId: null, route: [],
  }));
  const guardians: Guardian[] = map.objectives.map((objective) => ({
    id: objective.guardianId, objectiveId: objective.id,
    x: objective.guardianCell.x, y: objective.guardianCell.y,
    hp: objective.kind === 'core' ? 60 : 36,
    maxHp: objective.kind === 'core' ? 60 : 36,
    damage: objective.kind === 'core' ? 3 : 2,
  }));
  const nodes: ResourceNode[] = map.objectives.filter((objective) => objective.kind === 'metal').map((objective) => ({
    id: objective.id, kind: 'metal', x: objective.cell.x, y: objective.cell.y,
    guardianId: objective.guardianId, ownerId: null, progress: { p1: 0, p2: 0 },
  }));
  const core: Core = { id: coreSpec.id, x: coreSpec.cell.x, y: coreSpec.cell.y,
    guardianId: coreSpec.guardianId, open: rules.coreOpenTick === 0, progress: { p1: 0, p2: 0 } };
  const blank = () => Array<boolean>(map.width * map.height).fill(false);
  const world: BattlefieldWorld = {
    schemaVersion: 2, mode: 'battlefield', tick: 0, width: map.width, height: map.height, map,
    rules: { ...rules }, players, squads, guardians, nodes, core,
    visible: { p1: blank(), p2: blank() }, explored: { p1: blank(), p2: blank() }, winner: null,
  };
  updateFog(world);
  return world;
}

/** Clone every dynamic nested value. The validated, frozen MapSpec is shared. */
export function cloneBattlefieldWorld(world: BattlefieldWorld): BattlefieldWorld {
  return {
    ...world, rules: { ...world.rules }, map: world.map,
    players: {
      p1: { ...world.players.p1, base: { ...world.players.p1.base } },
      p2: { ...world.players.p2, base: { ...world.players.p2.base } },
    },
    squads: world.squads.map((unit) => ({ ...unit,
      target: unit.target ? { ...unit.target } : null,
      attackMemory: unit.attackMemory ? { ...unit.attackMemory } : undefined,
      lastShot: unit.lastShot ? { ...unit.lastShot, from: { ...unit.lastShot.from }, to: { ...unit.lastShot.to } } : undefined,
      route: unit.route.map((cell) => ({ ...cell })) })),
    guardians: world.guardians.map((unit) => ({ ...unit })),
    nodes: world.nodes.map((node) => ({ ...node, progress: { ...node.progress } })),
    core: { ...world.core, progress: { ...world.core.progress } },
    visible: { p1: [...world.visible.p1], p2: [...world.visible.p2] },
    explored: { p1: [...world.explored.p1], p2: [...world.explored.p2] },
  };
}

/** Deterministic Manhattan rings; static map data alone chooses distinct destinations. */
function destinations(map: MapSpec, goal: MapCell, count: number): MapCell[] {
  const selected: MapCell[] = [];
  for (let radius = 0; radius < map.width + map.height && selected.length < count; radius += 1) {
    for (let y = Math.max(0, goal.y - radius); y <= Math.min(map.height - 1, goal.y + radius); y += 1) {
      const dx = radius - Math.abs(goal.y - y);
      const xs = dx === 0 ? [goal.x] : [goal.x - dx, goal.x + dx];
      for (const x of xs) {
        if (x >= 0 && x < map.width && map.walkable[y * map.width + x] === true) selected.push({ x, y });
      }
    }
  }
  return selected;
}

function attackDestinations(map: MapSpec, target: MapCell, count: number): MapCell[] {
  return destinations(map, target, count + 1)
    .filter((cell) => cell.x !== target.x || cell.y !== target.y)
    .slice(0, count);
}

/** All validations and routes complete before cloning or advancing sequence. */
export function applyBattlefieldCommand(world: BattlefieldWorld, playerId: string, raw: unknown,
  remainingExpansions = 32768): BattlefieldCommandResult {
  const reject = (reason: BattlefieldRejection, expansions = 0): BattlefieldCommandResult =>
    ({ accepted: false, reason, world, expansions });
  if (playerId !== 'p1' && playerId !== 'p2') return reject('unknown_player');
  const parsed = parseBattlefieldCommand(raw);
  if (!parsed.ok) return reject('invalid_command');
  if (world.winner !== null) return reject('match_finished');
  const command = parsed.command;
  if (command.seq <= world.players[playerId].lastSequence) return reject('stale_sequence');
  const byId = new Map(world.squads.map((unit) => [unit.id, unit]));
  const units = command.squadIds.map((id) => byId.get(id));
  if (units.some((unit) => !unit || unit.ownerId !== playerId || unit.hp <= 0)) return reject('unit_unavailable');
  const selected = units as BattlefieldSquad[];
  selected.sort((a, b) => compareId(a.id, b.id));
  if (!Number.isSafeInteger(remainingExpansions) || remainingExpansions < 0) return reject('budget_exceeded');
  if (command.type === 'stop') {
    const next = cloneBattlefieldWorld(world);
    const ids = new Set(selected.map((unit) => unit.id));
    for (const unit of next.squads) if (ids.has(unit.id)) {
      unit.route = [];
      unit.target = null;
      unit.attackTargetId = null;
      unit.stance = 'guard';
      unit.anchor = { x: unit.x, y: unit.y };
    }
    next.players[playerId].lastSequence = command.seq;
    return { accepted: true, world: next, expansions: 0 };
  }
  if (command.type === 'attack_group') {
    const target = [...world.squads, ...world.guardians].find((unit) => unit.id === command.targetId);
    if (!target) return reject('unknown_target');
    if (target.hp <= 0) return reject('target_destroyed');
    if (target.id === world.core.guardianId && !world.core.open) return reject('target_unavailable');
    if ('ownerId' in target && target.ownerId === playerId) return reject('friendly_target');
    if (world.visible[playerId][indexOf(world.map, target)] !== true) return reject('target_not_visible');
    if (selected.every((unit) => unit.damage <= 0)) return reject('cannot_attack');
    const assigned = attackDestinations(world.map, target, selected.length);
    if (assigned.length < selected.length) return reject('unreachable');
    const cap = Math.min(remainingExpansions, MAX_GROUP_UNITS * world.map.width * world.map.height, 32768);
    let expansions = 0;
    const routes = new Map<string, { route: MapCell[]; target: MapCell }>();
    for (let index = 0; index < selected.length; index += 1) {
      const unit = selected[index]!;
      if (Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y) <= 1) {
        routes.set(unit.id, { route: [], target: { x: target.x, y: target.y } });
        continue;
      }
      let found: { route: MapCell[]; target: MapCell } | null = null;
      for (const destination of assigned) {
        const result = findPath(world.map, unit, destination, {
          maxExpansions: Math.min(world.map.width * world.map.height, cap - expansions),
        });
        expansions += result.expansions;
        if (result.status === 'found') {
          found = { route: result.path, target: { x: target.x, y: target.y } };
          break;
        }
        if (result.status === 'budget_exceeded') return reject('budget_exceeded', expansions);
      }
      if (!found) return reject('unreachable', expansions);
      routes.set(unit.id, found);
    }
    const next = cloneBattlefieldWorld(world);
    for (const unit of next.squads) {
      const order = routes.get(unit.id);
      if (!order) continue;
      unit.route = order.route.map((cell) => ({ ...cell }));
      unit.target = { ...order.target };
      unit.attackTargetId = target.id;
    }
    next.players[playerId].lastSequence = command.seq;
    return { accepted: true, world: next, expansions };
  }
  const goal = { x: command.x, y: command.y };
  if (goal.x >= world.map.width || goal.y >= world.map.height) return reject('out_of_bounds');
  if (world.map.walkable[indexOf(world.map, goal)] !== true) return reject('blocked');
  const formation = command.type === 'move_formation'
    ? planFormation(selected, goal, command.formation, {
      open: (cell) => cell.x >= 0 && cell.y >= 0 && cell.x < world.width && cell.y < world.height
        && world.map.walkable[indexOf(world.map, cell)] === true,
    }) : null;
  const assigned = formation ? selected.flatMap((unit) => formation.get(unit.id) ?? [])
    : destinations(world.map, goal, selected.length);
  if (assigned.length < selected.length) return reject('unreachable');
  const cap = Math.min(remainingExpansions, MAX_GROUP_UNITS * world.map.width * world.map.height, 32768);
  let expansions = 0;
  const routes = new Map<string, { route: MapCell[]; target: MapCell }>();
  for (let index = 0; index < selected.length; index += 1) {
    const unit = selected[index]!;
    const destination = assigned[index]!;
    const result = findPath(world.map, unit, destination,
      { maxExpansions: Math.min(world.map.width * world.map.height, cap - expansions) });
    expansions += result.expansions;
    if (result.status !== 'found') {
      return reject(result.status === 'invalid' ? 'out_of_bounds' : result.status, expansions);
    }
    routes.set(unit.id, { route: result.path, target: destination });
  }
  const next = cloneBattlefieldWorld(world);
  for (const unit of next.squads) {
    const assignedRoute = routes.get(unit.id);
    if (assignedRoute) {
      unit.stance = 'march';
      unit.anchor = null;
      unit.attackTargetId = null;
      unit.route = assignedRoute.route.map((cell) => ({ ...cell }));
      unit.target = unit.route.length === 0 ? null : { ...assignedRoute.target };
    }
  }
  next.players[playerId].lastSequence = command.seq;
  return { accepted: true, world: next, expansions };
}

/** One pure logical tick; no path searches or hidden-enemy-dependent rerouting. */
export function stepBattlefieldWorld(world: BattlefieldWorld): BattlefieldWorld {
  if (world.winner !== null) return world;
  const next = cloneBattlefieldWorld(world);
  next.tick += 1;
  next.core.open = next.tick >= next.rules.coreOpenTick;
  if (next.tick % next.rules.moveEveryTicks === 0) advanceOccupancy(next);
  updateFog(next);
  const living = next.squads.filter((unit) => unit.hp > 0).length;
  resolveCombat(next);
  const capture = captureContext(next);
  for (const node of next.nodes) {
    const captor = advanceCapture(next, node, next.rules.nodeCaptureTicks, capture);
    if (captor) node.ownerId = captor;
    if (node.ownerId && next.tick % next.rules.tickRate === 0) next.players[node.ownerId].metal += 1;
  }
  if (next.core.open) next.winner = advanceCapture(next, next.core, next.rules.coreCaptureTicks, capture);
  if (next.squads.filter((unit) => unit.hp > 0).length !== living) updateFog(next);
  return next;
}
