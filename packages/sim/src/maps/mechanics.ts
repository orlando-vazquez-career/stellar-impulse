import { captureDuration, counterBonus, statsForUnit, isConcealed, type EffectContext } from '../augments/effects.js';
import { statsFor, damageAgainst, type World, type Player, type SimEvent, type CaptureObjective, type Core, type Guardian, type PlayerId, type Rules, type Squad } from '../index.js';
import { createSpatialIndex, type SpatialIndex } from './spatial-index.js';

/** Structural mechanics shared by training and battlefield without changing either world type. */
export interface MechanicsWorld {
  mode?: 'training' | 'battlefield';
  width: number;
  height: number;
  tick: number;
  suddenDeath?: boolean;
  rules: Rules;
  squads: Squad[];
  guardians: Guardian[];
  core: Core;
  level?: readonly number[];
  /** Eight-way maps: a diagonal neighbour is also in weapons range. */
  diagonalReach?: boolean;
  players?: Record<PlayerId, Player>;
  events?: SimEvent[];
}

/** Adjacent for combat: orthogonal only, or any of the eight neighbours on diagonal maps. */
export function withinReach(world: Pick<MechanicsWorld, 'diagonalReach'>, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return world.diagonalReach ? Math.max(dx, dy) <= 1 : dx + dy <= 1;
}

export const guardianActive = (world: MechanicsWorld, guardian: Guardian): boolean =>
  guardian.hp > 0 && (guardian.id !== world.core.guardianId || world.core.open);

export function squadIndex(world: MechanicsWorld): SpatialIndex {
  return createSpatialIndex(world, world.squads.filter((unit) => unit.hp > 0));
}

export interface CaptureContext {
  index: SpatialIndex;
  owners: ReadonlyMap<string, PlayerId>;
  liveGuardians: ReadonlySet<string>;
}

/** Build once after combat; local objective queries then avoid full roster scans. */
export function captureContext(world: MechanicsWorld): CaptureContext {
  return {
    index: squadIndex(world),
    owners: new Map(world.squads.filter((unit) => unit.hp > 0 && statsFor(world, unit.ownerId, unit.kind).canCapture && !unit.isDecoy)
      .map((unit) => [unit.id, unit.ownerId])),
    liveGuardians: new Set(world.guardians.filter((unit) => unit.hp > 0).map((unit) => unit.id)),
  };
}

/** Simultaneous shots with class-specific cadence, counter-before-armor and hostile-only splash. */
export function resolveCombat(world: MechanicsWorld): void {
  const squads = world.squads.filter((unit) => unit.hp > 0);
  const guardians = world.guardians.filter((unit) => guardianActive(world, unit));
  const all = [...squads, ...guardians];
  const hits = new Map<string, { damage: number; attacker?: Squad; shot: string }[]>();
  const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => world.diagonalReach
    ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) : Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const add = (target: Squad | Guardian, damage: number, shot: string, attacker?: Squad) => {
    const list = hits.get(target.id) ?? []; list.push({ damage, attacker, shot }); hits.set(target.id, list);
  };
  for (const squad of squads) {
    const stats = statsForUnit(world,squad);
    if (stats.damage <= 0 || world.tick % stats.attackTicks !== 0) continue;
    const inRange = all.filter((unit) => unit.id !== squad.id && gap(squad, unit) <= stats.range
      && (!('kind' in unit) || !isConcealed(world as World, unit))
      && (!('ownerId' in unit) || unit.ownerId !== squad.ownerId))
      .sort((a, b) => gap(squad, a) - gap(squad, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const chosen = squad.attackTargetId ? inRange.find((unit) => unit.id === squad.attackTargetId) : undefined;
    const target = world.mode === 'battlefield'
      ? squad.attackTargetId ? chosen : squad.stance === 'attack' ? inRange[0] : undefined : chosen ?? inRange[0];
    if (!target) continue;
    squad.lastAttackTick = world.tick;
    const shot = `${world.tick}:${squad.id}`;
    for (const victim of inRange.length ? all : []) {
      if ('ownerId' in victim && victim.ownerId === squad.ownerId) continue;
      const primary = victim.id === target.id;
      if (!primary && (stats.splashRadius === 0 || gap(target, victim) > stats.splashRadius)) continue;
      const armor = 'kind' in victim ? statsForUnit(world,victim).armor : 0;
      const damage = damageAgainst(squad.kind, 'kind' in victim ? victim.kind : 'guardian', (stats.damage + ('kind' in victim ? counterBonus(world,squad,victim.kind) : 0)) * (primary ? 1 : stats.splashFactor), armor);
      add(victim, damage, shot, squad);
    }
  }
  if (world.tick % world.rules.attackEveryTicks === 0) for (const guardian of guardians) {
    const target = squads.filter((unit) => withinReach(world, guardian, unit))
      .sort((a,b) => gap(guardian,a) - gap(guardian,b) || (a.id < b.id ? -1 : 1))[0];
    if (target) add(target, Math.max(1, guardian.damage - statsForUnit(world,target).armor), `${world.tick}:${guardian.id}`);
  }
  for (const unit of all) {
    const attacks = hits.get(unit.id) ?? [];
    const before = unit.hp;
    unit.hp = Math.max(0, unit.hp - attacks.reduce((total, hit) => total + hit.damage, 0));
    if ('kind' in unit && attacks.length) unit.lastDamageTick = world.tick;
    if ('kind' in unit && !unit.isDecoy && before > 0 && unit.hp === 0) {
      // The first planned hostile shot crossing zero receives the official kill.
      let health = before;
      const fatal = attacks.find((hit) => { health -= hit.damage; return health <= 0; });
      if (fatal) {
        if (fatal.attacker) fatal.attacker.kills = (fatal.attacker.kills ?? 0) + 1;
        world.events?.push({ type: 'destroyed', tick: world.tick, attackerId: fatal.attacker?.id ?? fatal.shot.split(':')[1]!,
          attackerOwner: fatal.attacker?.ownerId ?? null, victimId: unit.id, victimOwner: unit.ownerId, kind: unit.kind,
          cost: statsFor(world, unit.ownerId, unit.kind).cost, shot: fatal.shot });
      }
    }
  }
}

/** Shared capture progress/decay. Pass a once-per-tick index in large battlefield worlds. */
export function advanceCapture(world: MechanicsWorld, objective: CaptureObjective, required: number,
  context = captureContext(world)): PlayerId | null {
  if (context.liveGuardians.has(objective.guardianId)) return null;
  const present = new Set(context.index.queryManhattan(objective, world.rules.captureRadius)
    .map((point) => context.owners.get(point.id))
    .filter((owner): owner is PlayerId => owner === 'p1' || owner === 'p2'));
  if (present.size === 2) return null;
  for (const playerId of ['p1', 'p2'] as const) {
    const duration=captureDuration(world,playerId,required,objective.id===world.core.id);
    objective.progress[playerId] = present.has(playerId)
      ? Math.min(duration, objective.progress[playerId] + 1)
      : Math.max(0, objective.progress[playerId] - 1);
  }
  for (const playerId of ['p1', 'p2'] as const) {
    if (objective.progress[playerId] >= captureDuration(world,playerId,required,objective.id===world.core.id) && present.has(playerId)) return playerId;
  }
  return null;
}
