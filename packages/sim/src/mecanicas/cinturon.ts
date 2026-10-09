import type { Guardian, Position, Squad, World } from '../index.js';
import type { Superficie } from '../mapas/leer-tiled.js';

/** Touching `asteroid_gate` rectangles of the map's `objetos` layer: one passage the asteroid belt crosses. */
export interface BeltGateSpec {
  id: string;
  cells: Position[];
  cycleSeconds: number;
  /** Seconds of each cycle the passage is clear; the belt fills it for the rest. */
  openSeconds: number;
  /** Last seconds of the clear window, announced: the belt is about to close. */
  warningSeconds: number;
}
export interface BeltGate {
  id: string;
  cells: readonly Position[];
  cycleTicks: number;
  openTicks: number;
  warningTicks: number;
}
/** Immutable for the whole match: every state derives from the tick, so clones share it. */
export interface BeltField {
  gates: readonly BeltGate[];
  /** The map with every passage closed. */
  closed: Superficie;
}
export type BeltPhase = 'open' | 'warning' | 'closed';
/** What a passage is doing on a tick. Public: the belt is visible from anywhere. */
export interface BeltGateState {
  id: string;
  phase: BeltPhase;
  /** Tick on which the current phase ends. */
  phaseEndsAt: number;
}

export function createBelt(specs: readonly BeltGateSpec[] | undefined, surface: Superficie, tickRate: number): BeltField | undefined {
  if (!specs?.length) return undefined;
  const walkable = [...surface.walkable];
  for (const spec of specs) for (const cell of spec.cells) walkable[cell.y * surface.width + cell.x] = false;
  return Object.freeze({
    closed: frozenSurface({ ...surface, walkable }),
    gates: Object.freeze(specs.map((spec) => {
      const cycleTicks = Math.max(2, Math.round(spec.cycleSeconds * tickRate));
      const openTicks = Math.max(1, Math.min(cycleTicks - 1, Math.round(spec.openSeconds * tickRate)));
      return Object.freeze({
        id: spec.id, cells: Object.freeze(spec.cells.map((cell) => Object.freeze({ ...cell }))),
        cycleTicks, openTicks, warningTicks: Math.max(0, Math.min(openTicks, Math.round(spec.warningSeconds * tickRate))),
      });
    })),
  });
}

/** Each cycle starts clear, warns during the last seconds of the clear window and then stays closed. */
export function gateAt(gate: BeltGate, tick: number): BeltGateState {
  const start = Math.floor(tick / gate.cycleTicks) * gate.cycleTicks;
  const into = tick - start;
  if (into < gate.openTicks - gate.warningTicks) return { id: gate.id, phase: 'open', phaseEndsAt: start + gate.openTicks - gate.warningTicks };
  if (into < gate.openTicks) return { id: gate.id, phase: 'warning', phaseEndsAt: start + gate.openTicks };
  return { id: gate.id, phase: 'closed', phaseEndsAt: start + gate.cycleTicks };
}

export function beltGates(world: Pick<World, 'belt' | 'tick'>): BeltGateState[] {
  return world.belt ? world.belt.gates.map((gate) => gateAt(gate, world.tick)) : [];
}

// One frozen surface per combination of clear passages, so path caches keyed by surface stay valid.
const surfaces = new WeakMap<BeltField, Map<string, Superficie>>();

/** The map as ships find it on a tick: the closed map with the clear passages opened. */
export function beltSurface(field: BeltField, tick: number): Superficie {
  const clear = field.gates.map((gate) => gateAt(gate, tick).phase !== 'closed');
  if (!clear.includes(true)) return field.closed;
  const key = clear.map(Number).join('');
  let cache = surfaces.get(field);
  if (!cache) { cache = new Map(); surfaces.set(field, cache); }
  let surface = cache.get(key);
  if (!surface) {
    const walkable = [...field.closed.walkable];
    field.gates.forEach((gate, index) => {
      if (clear[index]) for (const cell of gate.cells) walkable[cell.y * field.closed.width + cell.x] = true;
    });
    surface = frozenSurface({ ...field.closed, walkable });
    cache.set(key, surface);
  }
  return surface;
}

/** Put the world on the terrain of this tick. A ship caught on a cell that closed is pushed to the nearest free cell, unharmed. */
export function settleOn(world: World, surface: Superficie): void {
  if (!world.surface || surface.walkable === world.surface.walkable) return;
  world.surface = surface;
  // Barriers stand on the rock they seal: they are never in the way nor moved.
  const units: (Squad | Guardian)[] = [...world.squads, ...world.guardians].filter((unit) => unit.hp > 0 && !('role' in unit && unit.role === 'barrier'));
  const taken = new Set(units.map((unit) => unit.y * surface.width + unit.x));
  const caught = units.filter((unit) => surface.walkable[unit.y * surface.width + unit.x] !== true)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const unit of caught) {
    const cell = nearestFree(surface, unit, taken);
    if (!cell) continue;
    taken.add(cell.y * surface.width + cell.x);
    unit.transit = undefined;
    unit.x = cell.x;
    unit.y = cell.y;
    if ('ownerId' in unit) unit.lastMovedTick = world.tick;
  }
}

/** Breadth-first over every cell, rock included: the closest open cell no ship holds. */
function nearestFree(surface: Superficie, from: Position, taken: ReadonlySet<number>): Position | null {
  const { width, height } = surface;
  const seen = new Uint8Array(width * height);
  const queue = [from.y * width + from.x];
  seen[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head]!, x = index % width, y = Math.floor(index / width);
    if (surface.walkable[index] === true && !taken.has(index)) return { x, y };
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return null;
}

function frozenSurface(surface: Superficie): Superficie {
  return Object.freeze({
    width: surface.width, height: surface.height,
    walkable: Object.freeze([...surface.walkable]) as boolean[],
    level: Object.freeze([...surface.level]) as number[],
    ramp: Object.freeze([...surface.ramp]) as Superficie['ramp'],
  });
}
