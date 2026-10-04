import { randomFor } from '../augments/random.js';
import { FLEET_CAP, UNIT_COSTS } from '../economia.js';
import type { PlayerId, Position, UnitKind, World } from '../index.js';
import { effectiveFleetCap, effectsFor } from '../augments/effects.js';
import { statsFor } from '../stats.js';
import { knownObjectives, explorationGoal } from './knowledge.js';

export type RivalDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Difficulty only changes how the rival plays, never what it knows or earns:
 * same vision, same Metal, same rules as the human.
 */
interface RivalProfile {
  /** Enemy squads this close to the rival base make the fleet fall back. */
  threatRadius: number;
  /** The fleet waits at home until it has this many combat ships, then pushes as a group. */
  attackGroup: number;
  /** Ships the rival keeps alive at most (never above the shared FLEET_CAP). */
  fleetLimit: number;
  /** Minimum ticks between launches: a slow hangar for the easy rival. */
  buildSpacingTicks: number;
  /** Whether it raids Metal nodes the player already owns. */
  raidsPlayer: boolean;
  /** With this many combat ships it splits off a raiding party (0 = never). */
  raidSplitAt: number;
  /** With this many combat ships it expands to two nodes at once (0 = never). */
  expandSplitAt: number;
  buildOrder: readonly UnitKind[];
}

export const RIVAL_PROFILES: Readonly<Record<RivalDifficulty, RivalProfile>> = Object.freeze({
  easy: {
    threatRadius: 4, attackGroup: 5, fleetLimit: 6, buildSpacingTicks: 150, raidsPlayer: false, raidSplitAt: 0, expandSplitAt: 0,
    buildOrder: ['interceptor', 'frigate', 'interceptor', 'explorer'],
  },
  medium: {
    threatRadius: 6, attackGroup: 3, fleetLimit: FLEET_CAP, buildSpacingTicks: 0, raidsPlayer: true, raidSplitAt: 0, expandSplitAt: 0,
    buildOrder: ['interceptor', 'frigate', 'interceptor', 'bomber', 'frigate', 'explorer'],
  },
  hard: {
    threatRadius: 8, attackGroup: 2, fleetLimit: FLEET_CAP, buildSpacingTicks: 0, raidsPlayer: true, raidSplitAt: 6, expandSplitAt: 4,
    buildOrder: ['interceptor', 'bomber', 'frigate', 'interceptor', 'bomber', 'frigate'],
  },
});

const manhattan = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const byDistanceFrom = (origin: Position) => (a: Position & { id: string }, b: Position & { id: string }) =>
  manhattan(origin, a) - manhattan(origin, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Strategic layer for the training rival. Diego's per-ship state machine still decides when to chase,
 * attack or retreat; this only picks where each ship heads when it has nothing in sight.
 * It reads what the rival may know: its own fleet, node ownership and enemies inside its vision.
 */
export function rivalGoals(world: World, rival: PlayerId, canSee: (target: Position) => boolean,
  difficulty: RivalDifficulty = 'medium'): Map<string, Position> {
  const profile = RIVAL_PROFILES[difficulty];
  const base = world.players[rival].base;
  const fleet = world.squads.filter((unit) => unit.ownerId === rival && unit.hp > 0);
  const combat = fleet.filter((unit) => unit.kind !== 'explorer' && !unit.isDecoy);
  const goals = new Map<string, Position>();
  const threatened = world.squads.some((unit) => unit.ownerId !== rival && unit.hp > 0
    && manhattan(unit, base) <= profile.threatRadius && canSee(unit));
  const known=knownObjectives(world,rival);
  const targets = known.filter((node) => node.kind === 'metal' && node.ownerId !== rival
    && (profile.raidsPlayer || node.ownerId === null))
    .sort(byDistanceFrom(base));
  let front: Position;
  const mine = known.filter((node) => node.kind === 'metal' && node.ownerId === rival).length;
  const theirs = known.filter((node) => node.kind === 'metal' && node.ownerId !== null && node.ownerId !== rival).length;
  const contestCore = world.core.open && (world.suddenDeath || mine >= theirs || !targets.length);
  if (world.suddenDeath) front = world.core;
  else if (threatened) front = base;
  else if (contestCore) front = world.core;
  else if (world.core.open && targets[0]) front = targets[0];
  else if (combat.length < profile.attackGroup) front = targets[0] && manhattan(targets[0], base) <= 8 ? targets[0] : base;
  else front = targets[0] ?? explorationGoal(world,rival,combat[0] ?? base);
  // Hard: a big enough fleet sends its newest ships to raid the player's own Metal.
  const raidTarget = known.filter((node) => node.kind === 'metal' && node.ownerId !== null && node.ownerId !== rival)
    .sort(byDistanceFrom(base))[0];
  const raiders = !threatened && !world.core.open && raidTarget && profile.raidSplitAt > 0 && combat.length >= profile.raidSplitAt
    ? new Set(combat.slice(-Math.floor(combat.length / 2)).map((unit) => unit.id)) : new Set<string>();
  // Hard: while the core is closed, a mid-sized fleet takes the two nearest nodes in parallel.
  const second = targets[1];
  const expanding = !threatened && !world.core.open && second && front === targets[0]
    && profile.expandSplitAt > 0 && combat.length >= profile.expandSplitAt;
  combat.forEach((unit, index) => {
    const goal = raiders.has(unit.id) && raidTarget ? raidTarget
      : expanding && index % 2 === 1 ? second : front;
    goals.set(unit.id, { x: goal.x, y: goal.y });
  });
  // Scouts look ahead: the next uncontested node, then the core.
  const scoutTarget = targets[1] ?? targets[0];
  for (const unit of fleet) if (unit.kind === 'explorer') {
    const target=scoutTarget ?? explorationGoal(world,rival,unit);goals.set(unit.id,{x:target.x,y:target.y});
  }
  return goals;
}

/** Next ship the rival orders, or null to keep saving. Cycles a fixed build order. */
export function rivalProduction(world: World, rival: PlayerId, difficulty: RivalDifficulty = 'medium'): UnitKind | null {
  const profile = RIVAL_PROFILES[difficulty];
  if (world.production[rival]) return null;
  const alive = world.squads.filter((unit) => unit.ownerId === rival && unit.hp > 0 && !unit.isDecoy).length;
  if (alive >= Math.min(effectiveFleetCap(world,rival), profile.fleetLimit)) return null;
  if (world.tick < (world.built[rival] + 1) * profile.buildSpacingTicks) return null;
  const allowed=profile.buildOrder.filter((kind)=>!effectsFor(world,rival).some((e)=>e.hook==='no-production' && e.kind===kind));
  const offset=world.seed===undefined?0:Math.floor(randomFor(world.seed,rival,'doctrine')()*allowed.length);
  const kind = allowed[(world.built[rival]+offset) % allowed.length]!;
  return world.players[rival].metal >= statsFor(world, rival, kind).cost ? kind : null;
}
