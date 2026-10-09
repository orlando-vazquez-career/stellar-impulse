import type { PlayerId, Position, World } from '../index.js';

/** A `niebla_movil` of the map's `eventos` layer, with its `ruta_niebla` polylines already walked into cells. */
export interface NebulaCloudSpec {
  id: string;
  /** Cell at the centre of the cloud while it rests in its nebula. */
  home: Position;
  /** Side of the square the cloud covers, in cells. */
  size: number;
  /** Each route: the cells after `home`, one step apart, at most the map's `maxCells`. Routes take turns. */
  routes: Position[][];
  cellsPerSecond: number;
  warningSeconds: number;
  holdSeconds: number;
  restSeconds: number;
  /** Seconds into the match of the first departure (its warning starts `warningSeconds` earlier). */
  startSeconds: number;
}
/** Purple nebula read from a map: the cells painted as nebula and the clouds that leave them. */
export interface NebulaSpec {
  /** Row-major nebula cells of the logic layer; absent when the map leaves the static nebula inert. */
  cells?: boolean[];
  clouds: NebulaCloudSpec[];
  /** A ship inside the nebula needs this many times its usual beats per cell. */
  slowFactor: number;
  /** Vision radius of a ship inside the nebula. */
  visionRadius: number;
}
export interface NebulaCloud {
  id: string;
  home: Position;
  size: number;
  routes: readonly (readonly Position[])[];
  stepTicks: number;
  warningTicks: number;
  holdTicks: number;
  restTicks: number;
  /** Tick on which the first warning starts. */
  firstWarningTick: number;
}
/** Immutable for the whole match: every position derives from the tick, so clones share it. */
export interface NebulaField {
  width: number;
  height: number;
  cells: readonly boolean[] | null;
  clouds: readonly NebulaCloud[];
  slowFactor: number;
  visionRadius: number;
}
export type NebulaPhase = 'resting' | 'warning' | 'advancing' | 'holding' | 'returning';
/** Where a cloud is on a tick, and what it is doing. Public: everyone sees the purple mass move. */
export interface NebulaCloudState extends Position {
  id: string;
  size: number;
  phase: NebulaPhase;
  /** Route the cloud is on, or the next one while it rests (0-based). */
  route: number;
  /** Tick on which the current phase ends. */
  phaseEndsAt: number;
  /** Cells of that route, home first: what the warning paints on the map. */
  path: Position[];
}

/** Ships inside the nebula are hidden from rivals farther than this (Chebyshev cells). */
export const NEBULA_REVEAL_RADIUS = 2;

export function createNebula(spec: NebulaSpec | undefined, width: number, height: number, tickRate: number): NebulaField | undefined {
  if (!spec || (!spec.cells && spec.clouds.length === 0)) return undefined;
  const ticks = (seconds: number) => Math.max(0, Math.round(seconds * tickRate));
  return Object.freeze({
    width, height,
    cells: spec.cells ? Object.freeze([...spec.cells]) : null,
    slowFactor: spec.slowFactor,
    visionRadius: spec.visionRadius,
    clouds: Object.freeze(spec.clouds.map((cloud) => Object.freeze({
      id: cloud.id,
      home: Object.freeze({ ...cloud.home }),
      size: cloud.size,
      routes: Object.freeze(cloud.routes.map((route) => Object.freeze(route.map((cell) => Object.freeze({ ...cell }))))),
      stepTicks: Math.max(1, Math.round(tickRate / cloud.cellsPerSecond)),
      warningTicks: ticks(cloud.warningSeconds),
      holdTicks: ticks(cloud.holdSeconds),
      restTicks: ticks(cloud.restSeconds),
      firstWarningTick: Math.max(0, ticks(cloud.startSeconds) - ticks(cloud.warningSeconds)),
    }))),
  });
}

/**
 * Each route is one sortie: warning, advance one cell per step, hold at the far end, come back, rest.
 * Sorties alternate between the routes forever. `tick` may be fractional for drawing in between ticks;
 * then x/y are interpolated too.
 */
export function cloudAt(cloud: NebulaCloud, tick: number): NebulaCloudState {
  const legs = cloud.routes.map((route) => {
    const travel = route.length * cloud.stepTicks;
    return cloud.warningTicks + travel + cloud.holdTicks + travel + cloud.restTicks;
  });
  const cycle = legs.reduce((sum, leg) => sum + leg, 0);
  const base = { id: cloud.id, size: cloud.size };
  const pathOf = (route: number) => [{ ...cloud.home }, ...(cloud.routes[route] ?? []).map((cell) => ({ ...cell }))];
  if (cycle === 0 || tick < cloud.firstWarningTick) {
    return { ...base, ...cloud.home, phase: 'resting', route: 0, phaseEndsAt: cloud.firstWarningTick, path: pathOf(0) };
  }
  const elapsed = tick - cloud.firstWarningTick;
  const round = Math.floor(elapsed / cycle);
  let offset = elapsed - round * cycle;
  let route = 0;
  while (offset >= legs[route]!) { offset -= legs[route]!; route += 1; }
  const legStart = tick - offset;
  const cells = cloud.routes[route]!;
  const travel = cells.length * cloud.stepTicks;
  const at = (steps: number): Position => {
    // Fractional steps glide between neighbouring cells; whole steps land on them.
    const whole = Math.max(0, Math.min(cells.length, Math.floor(steps)));
    const from = whole === 0 ? cloud.home : cells[whole - 1]!;
    const to = whole >= cells.length ? from : cells[whole]!;
    const share = Math.max(0, Math.min(1, steps - whole));
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  };
  const phases: [NebulaPhase, number, (into: number) => Position][] = [
    ['warning', cloud.warningTicks, () => cloud.home],
    ['advancing', travel, (into) => at(into / cloud.stepTicks)],
    ['holding', cloud.holdTicks, () => at(cells.length)],
    ['returning', travel, (into) => at(cells.length - into / cloud.stepTicks)],
    ['resting', cloud.restTicks, () => cloud.home],
  ];
  let start = legStart;
  for (const [phase, length, place] of phases) {
    if (tick < start + length) {
      const position = place(tick - start);
      // While resting the warning to watch is the next sortie's.
      const next = phase === 'resting' ? (route + 1) % cloud.routes.length : route;
      return { ...base, ...position, phase, route: next, phaseEndsAt: start + length, path: pathOf(next) };
    }
    start += length;
  }
  return { ...base, ...cloud.home, phase: 'resting', route: (route + 1) % cloud.routes.length, phaseEndsAt: start, path: pathOf((route + 1) % cloud.routes.length) };
}

/** Cells a cloud covers when centred on a cell: the size×size square around it (6 → three behind, two ahead). */
export function cloudCovers(state: Position & { size: number }, cell: Position): boolean {
  const cx = Math.round(state.x), cy = Math.round(state.y);
  const low = Math.floor(state.size / 2);
  return cell.x >= cx - low && cell.x < cx - low + state.size && cell.y >= cy - low && cell.y < cy - low + state.size;
}

export function nebulaClouds(world: Pick<World, 'nebula' | 'tick'>): NebulaCloudState[] {
  return world.nebula ? world.nebula.clouds.map((cloud) => cloudAt(cloud, world.tick)) : [];
}

// One mask per field and tick: vision checks ask about the same cells many times in a tick.
const masks = new WeakMap<NebulaField, { tick: number; mask: Uint8Array }>();

function maskFor(field: NebulaField, tick: number): Uint8Array {
  const cached = masks.get(field);
  if (cached?.tick === tick) return cached.mask;
  const mask = new Uint8Array(field.width * field.height);
  if (field.cells) field.cells.forEach((inside, index) => { if (inside) mask[index] = 1; });
  for (const cloud of field.clouds) {
    const state = cloudAt(cloud, tick);
    const cx = Math.round(state.x), cy = Math.round(state.y), low = Math.floor(state.size / 2);
    for (let y = cy - low; y < cy - low + state.size; y += 1) {
      for (let x = cx - low; x < cx - low + state.size; x += 1) {
        if (x >= 0 && y >= 0 && x < field.width && y < field.height) mask[y * field.width + x] = 1;
      }
    }
  }
  masks.set(field, { tick, mask });
  return mask;
}

/** Whether the purple nebula (painted or drifting) covers this cell now. */
export function inNebula(world: Pick<World, 'nebula' | 'tick'>, cell: Position): boolean {
  const field = world.nebula;
  if (!field) return false;
  const x = Math.round(cell.x), y = Math.round(cell.y);
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return false;
  return maskFor(field, world.tick)[y * field.width + x] === 1;
}

/** A ship in the nebula drags: every cell costs `slowFactor` times its usual beats. */
export function nebulaSlowdown(world: Pick<World, 'nebula' | 'tick'>, cell: Position): number {
  return world.nebula && inNebula(world, cell) ? world.nebula.slowFactor : 1;
}

/** Inside the nebula a ship only sees `visionRadius` cells around it. */
export function nebulaVision(world: Pick<World, 'nebula' | 'tick'>, cell: Position, radius: number): number {
  return world.nebula && inNebula(world, cell) ? Math.min(radius, world.nebula.visionRadius) : radius;
}

/** Whether a player sees into a nebula cell: only from right beside it. Open space is never hidden by this. */
export function nebulaHides(world: Pick<World, 'nebula' | 'tick' | 'squads'>, player: PlayerId, cell: Position): boolean {
  if (!inNebula(world, cell)) return false;
  return !world.squads.some((unit) => unit.ownerId === player && unit.hp > 0
    && Math.max(Math.abs(unit.x - cell.x), Math.abs(unit.y - cell.y)) <= NEBULA_REVEAL_RADIUS);
}
