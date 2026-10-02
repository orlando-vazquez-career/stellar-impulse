import { FLEET_CAP, UNIT_COSTS } from '../economia.js';
import type { PlayerId, Position, UnitKind, World } from '../index.js';

/** Enemy squads this close to the rival base make the whole fleet fall back. */
const THREAT_RADIUS = 6;
/** The fleet waits at home until it has this many combat ships, then pushes as a group. */
const ATTACK_GROUP = 3;
const BUILD_ORDER: readonly UnitKind[] = ['interceptor', 'frigate', 'interceptor', 'bomber', 'frigate', 'explorer'];

const manhattan = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const byDistanceFrom = (origin: Position) => (a: Position & { id: string }, b: Position & { id: string }) =>
  manhattan(origin, a) - manhattan(origin, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Strategic layer for the training rival. Diego's per-ship state machine still decides when to chase,
 * attack or retreat; this only picks where each ship heads when it has nothing in sight.
 * It reads what the rival may know: its own fleet, node ownership and enemies inside its vision.
 */
export function rivalGoals(world: World, rival: PlayerId, canSee: (target: Position) => boolean): Map<string, Position> {
  const base = world.players[rival].base;
  const fleet = world.squads.filter((unit) => unit.ownerId === rival && unit.hp > 0);
  const combat = fleet.filter((unit) => unit.kind !== 'explorer');
  const goals = new Map<string, Position>();
  const threatened = world.squads.some((unit) => unit.ownerId !== rival && unit.hp > 0
    && manhattan(unit, base) <= THREAT_RADIUS && canSee(unit));
  const targets = world.nodes.filter((node) => node.kind === 'metal' && node.ownerId !== rival)
    .sort(byDistanceFrom(base));
  let front: Position;
  if (threatened) front = base;
  else if (world.core.open) front = world.core;
  else if (combat.length < ATTACK_GROUP) front = targets[0] && manhattan(targets[0], base) <= 8 ? targets[0] : base;
  else front = targets[0] ?? world.core;
  for (const unit of combat) goals.set(unit.id, { x: front.x, y: front.y });
  // Scouts look ahead: the next uncontested node, then the core.
  const scoutTarget = targets[1] ?? targets[0] ?? world.core;
  for (const unit of fleet) if (unit.kind === 'explorer') goals.set(unit.id, { x: scoutTarget.x, y: scoutTarget.y });
  return goals;
}

/** Next ship the rival orders, or null to keep saving. Cycles a fixed build order. */
export function rivalProduction(world: World, rival: PlayerId): UnitKind | null {
  if (world.production[rival]) return null;
  const alive = world.squads.filter((unit) => unit.ownerId === rival && unit.hp > 0).length;
  if (alive >= FLEET_CAP) return null;
  const kind = BUILD_ORDER[world.built[rival] % BUILD_ORDER.length]!;
  return world.players[rival].metal >= UNIT_COSTS[kind] ? kind : null;
}
