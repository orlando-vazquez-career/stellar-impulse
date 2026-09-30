/** Integer grid coordinates are independent of screen projection. */
export interface MapCell { readonly x: number; readonly y: number }

export interface MapObjective {
  readonly id: string;
  readonly kind: 'core' | 'metal';
  readonly cell: MapCell;
  readonly guardianId: string;
  readonly guardianCell: MapCell;
}

/** Static, server-owned content. Dynamic ownership, routes and fog belong in World. */
export interface MapSpec {
  readonly id: string;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly bases: Readonly<{ p1: MapCell; p2: MapCell }>;
  readonly objectives: readonly MapObjective[];
  /** Row-major; index = y * width + x. */
  readonly walkable: readonly boolean[];
  /** Row-major vision blockers; independent of walkability. */
  readonly opaque: readonly boolean[];
}

export const MAX_MAP_SIDE = 128;
export const MAX_MAP_CELLS = MAX_MAP_SIDE * MAX_MAP_SIDE;

const validId = (value: string): boolean => /^[a-z][a-z0-9-]{0,63}$/.test(value);
const positive = (value: number, max: number): boolean => Number.isSafeInteger(value) && value > 0 && value <= max;

/** Validate trusted catalog input, copy every nested value, and freeze the result. */
export function defineMapSpec(input: MapSpec): MapSpec {
  if (!validId(input.id) || !positive(input.version, Number.MAX_SAFE_INTEGER)) throw new Error('Invalid map identity');
  if (!positive(input.width, MAX_MAP_SIDE) || !positive(input.height, MAX_MAP_SIDE)) throw new Error('Invalid map dimensions');
  if (!positive(input.cellSize, 512)) throw new Error('Invalid cell size');
  const cells = input.width * input.height;
  if (cells > MAX_MAP_CELLS || input.walkable.length !== cells || input.opaque.length !== cells) throw new Error('Invalid map masks');
  for (let index = 0; index < cells; index += 1) {
    if (typeof input.walkable[index] !== 'boolean' || typeof input.opaque[index] !== 'boolean') throw new Error('Invalid map masks');
  }
  const inBounds = (cell: MapCell): boolean => Number.isSafeInteger(cell.x) && Number.isSafeInteger(cell.y)
    && cell.x >= 0 && cell.y >= 0 && cell.x < input.width && cell.y < input.height;
  const traversable = (cell: MapCell): boolean => inBounds(cell) && input.walkable[cell.y * input.width + cell.x] === true;
  if (!traversable(input.bases.p1) || !traversable(input.bases.p2)
    || (input.bases.p1.x === input.bases.p2.x && input.bases.p1.y === input.bases.p2.y)) {
    throw new Error('Invalid base cells');
  }
  const ids = new Set<string>();
  const guardianCells = new Set<number>();
  const baseCells = new Set([input.bases.p1.y * input.width + input.bases.p1.x, input.bases.p2.y * input.width + input.bases.p2.x]);
  let cores = 0;
  const objectives = input.objectives.map((objective): MapObjective => {
    const guardianIndex = objective.guardianCell.y * input.width + objective.guardianCell.x;
    if (!validId(objective.id) || !validId(objective.guardianId) || ids.has(objective.id) || ids.has(objective.guardianId)
      || objective.id === objective.guardianId || (objective.kind !== 'core' && objective.kind !== 'metal')
      || !traversable(objective.cell) || !traversable(objective.guardianCell)
      || guardianCells.has(guardianIndex) || baseCells.has(guardianIndex)) throw new Error('Invalid objective');
    ids.add(objective.id);
    ids.add(objective.guardianId);
    guardianCells.add(guardianIndex);
    if (objective.kind === 'core') cores += 1;
    return Object.freeze({
      id: objective.id, kind: objective.kind,
      cell: Object.freeze({ x: objective.cell.x, y: objective.cell.y }),
      guardianId: objective.guardianId,
      guardianCell: Object.freeze({ x: objective.guardianCell.x, y: objective.guardianCell.y }),
    });
  });
  if (cores !== 1) throw new Error('Exactly one core is required');
  return Object.freeze({
    id: input.id, version: input.version, width: input.width, height: input.height, cellSize: input.cellSize,
    bases: Object.freeze({
      p1: Object.freeze({ x: input.bases.p1.x, y: input.bases.p1.y }),
      p2: Object.freeze({ x: input.bases.p2.x, y: input.bases.p2.y }),
    }),
    objectives: Object.freeze(objectives),
    walkable: Object.freeze([...input.walkable]),
    opaque: Object.freeze([...input.opaque]),
  });
}
