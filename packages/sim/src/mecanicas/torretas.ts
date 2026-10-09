import type { Guardian, Position } from '../index.js';

/** A `torreta` point of the map's `objetos` layer: a neutral gun that fires at any ship in range. */
export interface TurretSpec extends Position {
  id: string;
  hp: number;
  damage: number;
  /** Cells around the turret it reaches (eight-way). */
  range: number;
}

/** Values a `torreta` takes when the map leaves a property out. */
export const TURRET_DEFAULTS = Object.freeze({ hp: 150, damage: 4, range: 4 });

/** Turrets are guardians that never move: ships target, see and destroy them the same way. */
export function createTurrets(specs: readonly TurretSpec[] | undefined, objectives: readonly (Position & { id: string })[]): Guardian[] {
  return (specs ?? []).map((spec) => {
    const gap = (objective: Position) => Math.max(Math.abs(objective.x - spec.x), Math.abs(objective.y - spec.y));
    // It stands watch over the closest objective.
    const post = [...objectives].sort((a, b) => gap(a) - gap(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    return {
      id: spec.id, objectiveId: post?.id ?? spec.id, x: spec.x, y: spec.y,
      hp: spec.hp, maxHp: spec.hp, damage: spec.damage, role: 'turret', range: spec.range,
    };
  });
}
