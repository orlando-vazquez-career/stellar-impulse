import { captureDuration, counterBonus, statsForUnit, isConcealed, type EffectContext } from '../augments/effects.js';
import { canSee, statsFor, damageAgainst, type World, type Player, type SimEvent, type CaptureObjective, type Core, type Guardian, type PlayerId, type Rules, type Squad } from '../index.js';
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
  visible?: Record<PlayerId, boolean[]>;
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
  const standing = world.guardians.filter((unit) => guardianActive(world, unit));
  // Barriers never fire, and ships only shoot at one when ordered to.
  const guardians = standing.filter((unit) => unit.role !== 'barrier');
  const all = [...squads, ...standing];
  const hits = new Map<string, { damage: number; attacker?: Squad; shot: string }[]>();
  const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => world.diagonalReach
    ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) : Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const add = (target: Squad | Guardian, damage: number, shot: string, attacker?: Squad) => {
    const list = hits.get(target.id) ?? []; list.push({ damage, attacker, shot }); hits.set(target.id, list);
  };
  for (const squad of squads) {
    const stats = statsForUnit(world,squad);
    const readyAt = squad.nextAttackTick ?? (squad.lastAttackTick ?? 0) + stats.attackTicks;
    if (stats.damage <= 0 || world.tick < readyAt) continue;
    const inRange = all.filter((unit) => unit.id !== squad.id && gap(squad, unit) <= stats.range
      && (world.visible ? world.visible[squad.ownerId][unit.y * world.width + unit.x] === true
        : !world.players || canSee(world as World, squad.ownerId, unit))
      && (!('kind' in unit) || !isConcealed(world as World, unit))
      && (!('ownerId' in unit) || unit.ownerId !== squad.ownerId)
      && (!('role' in unit) || unit.role !== 'barrier' || unit.id === squad.attackTargetId))
      .sort((a, b) => gap(squad, a) - gap(squad, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const chosen = squad.attackTargetId ? inRange.find((unit) => unit.id === squad.attackTargetId) : undefined;
    const target = world.mode === 'battlefield'
      ? squad.attackTargetId ? chosen : squad.stance === 'attack' ? inRange[0] : undefined : chosen ?? inRange[0];
    if (!target) continue;
    // An idle ship keeps an opponent it has actually engaged. March orders still take priority.
    if (world.mode !== 'battlefield' && squad.stance === 'march' && !squad.attackTargetId
      && !squad.target && !squad.gather && squad.route.length === 0) {
      squad.attackTargetId = target.id;
      squad.attackMemory = { x: target.x, y: target.y, seenAt: world.tick };
    }
    squad.lastAttackTick = world.tick;
    squad.nextAttackTick = world.tick + stats.attackTicks;
    squad.lastShot = { tick: world.tick, from: { x: squad.x, y: squad.y },
      to: { x: target.x, y: target.y }, splashRadius: stats.splashRadius };
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
    const range = guardian.range;
    const target = squads.filter((unit) => range === undefined ? withinReach(world, guardian, unit) : gap(guardian, unit) <= range)
      .sort((a,b) => gap(guardian,a) - gap(guardian,b) || (a.id < b.id ? -1 : 1))[0];
    if (!target) continue;
    add(target, Math.max(1, guardian.damage - statsForUnit(world,target).armor), `${world.tick}:${guardian.id}`);
    if (guardian.role !== 'turret') continue;
    guardian.lastShot = { tick: world.tick, to: { x: target.x, y: target.y } };
    // An armed ship with nothing else to do answers the turret instead of sitting under its fire.
    if (world.mode !== 'battlefield' && target.stance === 'march' && !target.attackTargetId && !target.target
      && !target.gather && target.route.length === 0 && statsForUnit(world, target).damage > 0) {
      target.attackTargetId = guardian.id;
      target.attackMemory = { x: guardian.x, y: guardian.y, seenAt: world.tick };
    }
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

/** Capture pace by capturing ships in the area: the second and third add half a ship each, more add nothing. */
export const CAPTURE_PACE: readonly number[] = Object.freeze([0, 1, 1.5, 2]);
/** A side that only outnumbers its rival captures with its spare ships, at this share of their pace. */
export const CONTESTED_CAPTURE_FACTOR = 0.5;
const capturePace = (ships: number): number => CAPTURE_PACE[Math.min(ships, CAPTURE_PACE.length - 1)]!;

/**
 * Shared capture progress/decay. Pass a once-per-tick index in large battlefield worlds.
 * Nodes: more ships capture faster, and in a dispute the larger side still advances (slowly) while the
 * smaller one is pushed back; an even dispute freezes. The core keeps one pace and freezes in any dispute.
 */
export function advanceCapture(world: MechanicsWorld, objective: CaptureObjective, required: number,
  context = captureContext(world)): PlayerId | null {
  if (context.liveGuardians.has(objective.guardianId)) return null;
  const core = objective.id === world.core.id;
  const radius = objective.radius ?? world.rules.captureRadius;
  const ships: Record<PlayerId, number> = { p1: 0, p2: 0 };
  // The area is a disc; the diamond query of twice the radius is only its cheap superset.
  for (const point of context.index.queryManhattan(objective, radius * 2)) {
    const owner = context.owners.get(point.id);
    if (owner && (point.x - objective.x) ** 2 + (point.y - objective.y) ** 2 <= radius * radius) ships[owner] += 1;
  }
  const disputed = ships.p1 > 0 && ships.p2 > 0;
  if (disputed && (core || ships.p1 === ships.p2)) return null;
  const leader: PlayerId = ships.p1 >= ships.p2 ? 'p1' : 'p2';
  const pace = core ? 1 : disputed
    ? capturePace(Math.abs(ships.p1 - ships.p2)) * CONTESTED_CAPTURE_FACTOR : capturePace(ships[leader]);
  let captor: PlayerId | null = null;
  for (const playerId of ['p1', 'p2'] as const) {
    const duration = captureDuration(world, playerId, required, core);
    if (ships[playerId] > 0 && playerId === leader) {
      objective.progress[playerId] = Math.min(duration, objective.progress[playerId] + pace);
      if (objective.progress[playerId] >= duration) captor = playerId;
    } else {
      // Absent sides decay at the usual pace; an outnumbered one is pushed back as fast as its rival advances.
      objective.progress[playerId] = Math.max(0, objective.progress[playerId] - (disputed ? pace : 1));
    }
  }
  return captor;
}
