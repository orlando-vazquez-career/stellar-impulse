import { applyHeightAdvantage } from '../mapas/alturas.js';
import { UNIT_STATS, damageAgainst, type CaptureObjective, type Core, type Guardian, type PlayerId, type Rules, type Squad } from '../index.js';
import { createSpatialIndex, type SpatialIndex } from './spatial-index.js';

/** Structural mechanics shared by training and battlefield without changing either world type. */
export interface MechanicsWorld {
  mode?: 'training' | 'battlefield';
  width: number;
  height: number;
  tick: number;
  rules: Rules;
  squads: Squad[];
  guardians: Guardian[];
  core: Core;
  level?: readonly number[];
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
    owners: new Map(world.squads.filter((unit) => unit.hp > 0 && UNIT_STATS[unit.kind].canCapture)
      .map((unit) => [unit.id, unit.ownerId])),
    liveGuardians: new Set(world.guardians.filter((unit) => unit.hp > 0).map((unit) => unit.id)),
  };
}

function heightDamage(hit: {
  world: MechanicsWorld;
  damage: number;
  attacker: { x: number; y: number };
  defender: { x: number; y: number };
}): number {
  if (!hit.world.level) return hit.damage;
  return applyHeightAdvantage({
    damage: hit.damage,
    attackerLevel: hit.world.level[hit.attacker.y * hit.world.width + hit.attacker.x] ?? 0,
    defenderLevel: hit.world.level[hit.defender.y * hit.world.width + hit.defender.x] ?? 0,
  });
}

/** Plan every attack before applying damage, preserving fatal replies and ID tie-breaks. */
export function resolveCombat(world: MechanicsWorld): void {
  if (world.tick % world.rules.attackEveryTicks !== 0) return;
  const squads = world.squads.filter((unit) => unit.hp > 0);
  const guardians = world.guardians.filter((unit) => guardianActive(world, unit));
  const all = [...squads, ...guardians];
  const byId = new Map(all.map((unit) => [unit.id, unit]));
  const index = createSpatialIndex(world, all);
  const hits = new Map<string, number>();
  const hit = (id: string, damage: number): void => { hits.set(id, (hits.get(id) ?? 0) + damage); };
  for (const squad of squads) {
    if (UNIT_STATS[squad.kind].damage <= 0) continue;
    const inRange = index.queryManhattan(squad, 1)
      .map((point) => byId.get(point.id)!)
      .filter((unit) => unit.id !== squad.id && (!('ownerId' in unit) || unit.ownerId !== squad.ownerId));
    const target = squad.attackTargetId
      ? inRange.find((unit) => unit.id === squad.attackTargetId)
      : world.mode === 'battlefield'
        ? squad.stance === 'attack' ? inRange[0] : undefined
        : inRange[0];
    if (target) hit(target.id, heightDamage({
      world, attacker: squad, defender: target,
      damage: 'kind' in target ? damageAgainst(squad.kind, target.kind, squad.damage) : squad.damage,
    }));
  }
  for (const guardian of guardians) {
    const target = index.queryManhattan(guardian, 1)
      .map((point) => byId.get(point.id)!)
      .find((unit) => 'ownerId' in unit && unit.hp > 0);
    if (target) hit(target.id, heightDamage({ world, damage: guardian.damage, attacker: guardian, defender: target }));
  }
  for (const unit of [...world.squads, ...world.guardians]) unit.hp = Math.max(0, unit.hp - (hits.get(unit.id) ?? 0));
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
    objective.progress[playerId] = present.has(playerId)
      ? Math.min(required, objective.progress[playerId] + 1)
      : Math.max(0, objective.progress[playerId] - 1);
  }
  for (const playerId of ['p1', 'p2'] as const) {
    if (objective.progress[playerId] >= required && present.has(playerId)) return playerId;
  }
  return null;
}
