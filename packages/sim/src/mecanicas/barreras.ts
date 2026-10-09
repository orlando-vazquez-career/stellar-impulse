import type { Guardian, Position, World } from '../index.js';
import type { Superficie } from '../mapas/leer-tiled.js';

/** A `barrera_destruible` point of the map's `objetos` layer: rock or scrap that seals its `celdas` until it is shot down. */
export interface BarrierSpec extends Position {
  id: string;
  material: string;
  hp: number;
  /** Cells it seals. They open when its hull reaches zero. */
  cells: Position[];
}
/** Immutable for the whole match: which barriers stand lives in the world's guardians. */
export interface BarrierField {
  barriers: readonly { id: string; cells: readonly Position[] }[];
  /** The map with every barrier standing. */
  closed: Superficie;
}

/** A barrier is a guardian that neither moves nor fires: ships see, target and destroy it the same way. */
export function createBarriers(specs: readonly BarrierSpec[] | undefined, surface: Superficie): { field: BarrierField; guardians: Guardian[] } | undefined {
  if (!specs?.length) return undefined;
  return {
    field: Object.freeze({
      closed: freeze(surface),
      barriers: Object.freeze(specs.map((spec) => Object.freeze({ id: spec.id, cells: Object.freeze(spec.cells.map((cell) => Object.freeze({ ...cell }))) }))),
    }),
    guardians: specs.map((spec) => ({ id: spec.id, objectiveId: spec.id, x: spec.x, y: spec.y, hp: spec.hp, maxHp: spec.hp, damage: 0, role: 'barrier' })),
  };
}

/** Barriers already shot down, in a stable order. */
export function fallenBarriers(world: Pick<World, 'barriers' | 'guardians'>): string[] {
  if (!world.barriers) return [];
  return world.guardians.filter((unit) => unit.role === 'barrier' && unit.hp <= 0).map((unit) => unit.id).sort();
}

// One frozen surface per base surface and set of fallen barriers, so path caches keyed by surface stay valid.
const surfaces = new WeakMap<Superficie, Map<string, Superficie>>();

/** `base` with the cells of the fallen barriers opened. */
export function barrierSurface(field: BarrierField, base: Superficie, fallen: readonly string[]): Superficie {
  if (fallen.length === 0) return base;
  const key = fallen.join(',');
  let cache = surfaces.get(base);
  if (!cache) { cache = new Map(); surfaces.set(base, cache); }
  let surface = cache.get(key);
  if (!surface) {
    const walkable = [...base.walkable];
    for (const barrier of field.barriers) {
      if (fallen.includes(barrier.id)) for (const cell of barrier.cells) walkable[cell.y * base.width + cell.x] = true;
    }
    surface = freeze({ ...base, walkable });
    cache.set(key, surface);
  }
  return surface;
}

function freeze(surface: Superficie): Superficie {
  return Object.freeze({
    width: surface.width, height: surface.height,
    walkable: Object.freeze([...surface.walkable]) as boolean[],
    level: Object.freeze([...surface.level]) as number[],
    ramp: Object.freeze([...surface.ramp]) as Superficie['ramp'],
  });
}
