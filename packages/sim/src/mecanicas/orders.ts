/** Player march orders. Shift appends a finite route; patrol is the only loop. */

export const MAX_ROUTE_POINTS = 8;
export const ARRIVAL_RING_RADIUS = 1;

export type PlayerStance = 'march' | 'guard' | 'patrol' | 'attack';

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface RouteUnit {
  id: string;
  ownerId?:string;
  arrivalLocked?:boolean;
  arrivalSeat?:Cell|null;
  x: number;
  y: number;
  stance: PlayerStance;
  anchor: Cell | null;
  gather: Cell | null;
  target: Cell | null;
  route: Cell[];
  attackTargetId: string | null;
  attackMemory?: Cell & { seenAt: number };
}

export interface WalkBoard {
  width: number;
  height: number;
  blocked: ReadonlySet<string>;
}

const RING: readonly Cell[] = Object.freeze([
  { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
  { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
]);

const cellKey = (cell: Cell): string => `${cell.x},${cell.y}`;
const copy = (cell: Cell): Cell => ({ x: cell.x, y: cell.y });
const sameCell = (left: Cell, right: Cell): boolean => left.x === right.x && left.y === right.y;

export function blockedCells(obstacles: readonly Cell[]): Set<string> {
  return new Set(obstacles.map(cellKey));
}

export function ringAround(origin: Cell, board: WalkBoard): Cell[] {
  const seats: Cell[] = [];
  for (const offset of RING) {
    const cell = { x: origin.x + offset.x * ARRIVAL_RING_RADIUS, y: origin.y + offset.y * ARRIVAL_RING_RADIUS };
    if (cell.x < 0 || cell.y < 0 || cell.x >= board.width || cell.y >= board.height) continue;
    if (board.blocked.has(cellKey(cell))) continue;
    seats.push(cell);
  }
  return seats;
}

/** One ship keeps the clicked cell. Several ships share the ring, lowest id first. */
export function assignArrival(ids: readonly string[], origin: Cell, board: WalkBoard): Map<string, Cell> {
  const ordered = [...ids].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const assigned = new Map<string, Cell>();
  const first = ordered[0];
  if (!first) return assigned;
  if (ordered.length === 1) {
    const open = origin.x >= 0 && origin.y >= 0 && origin.x < board.width && origin.y < board.height
      && !board.blocked.has(cellKey(origin));
    assigned.set(first, open ? copy(origin) : ringAround(origin, board)[0] ?? copy(origin));
    return assigned;
  }
  const ring = ringAround(origin, board);
  // Expand the formation instead of sending overflow ships to the same centre pixel.
  for (let radius = 2; ring.length < ordered.length && radius < Math.max(board.width, board.height); radius++) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const cell = { x: origin.x + dx, y: origin.y + dy };
      if (cell.x >= 0 && cell.y >= 0 && cell.x < board.width && cell.y < board.height
        && !board.blocked.has(cellKey(cell))) ring.push(cell);
    }
  }
  for (let index = 0; index < ordered.length; index += 1) {
    const id = ordered[index];
    if (id && ring[index]) assigned.set(id, ring[index]!);
  }
  return assigned;
}

export function refreshArrivals<T extends RouteUnit>(units: readonly T[], board: WalkBoard, canReach:(from:Cell,to:Cell)=>boolean=()=>true): void {
  const groups = new Map<string, T[]>();
  for (const unit of units) {
    if (!unit.gather) continue;
    const key = `${unit.ownerId??''}:${cellKey(unit.gather)}`;
    const group = groups.get(key);
    if (group) group.push(unit);
    else groups.set(key, [unit]);
  }
  for (const group of groups.values()) {
    if(group.every(u=>u.arrivalLocked))continue;
    const origin = group[0]?.gather;
    if (!origin) continue;
    const seats = assignArrival(group.map((unit) => unit.id), origin, board);
    const reserved=new Set(units.filter(u=>u.ownerId===group[0]!.ownerId&&u.arrivalLocked&&u.arrivalSeat
      &&(u.target||sameCell(u,u.arrivalSeat))).map(u=>cellKey(u.arrivalSeat!)));
    const candidates=[copy(origin),...assignArrival(Array.from({length:units.length+8},(_,i)=>String(i)),origin,board).values()];
    for (const unit of [...group].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)) {
      if(unit.arrivalLocked)continue;
      const desired=seats.get(unit.id);
      const usable=(cell:Cell)=>!reserved.has(cellKey(cell))&&!board.blocked.has(cellKey(cell))&&canReach(unit,cell);
      const seat=desired&&usable(desired)?desired:candidates.find(usable);
      if(seat){unit.target=copy(seat);unit.arrivalSeat=copy(seat);reserved.add(cellKey(seat));}
    }
  }
}

export type OrderWrite = 'ok' | 'route_full';

/** A plain click replaces the route and cancels guard, patrol and attack. */
export function replaceDestination(unit: RouteUnit, point: Cell): void {
  unit.arrivalLocked=false;unit.arrivalSeat=null;unit.target=null;
  unit.stance = 'march';
  unit.anchor = null;
  unit.attackTargetId = null;
  unit.attackMemory = undefined;
  unit.gather = copy(point);
  unit.route = [];
}

/** Shift-click appends one cell. The route stops at the last cell; it never loops. */
export function appendDestination(unit: RouteUnit, point: Cell): OrderWrite {
  const queued = (unit.gather ? 1 : 0) + unit.route.length;
  if (queued >= MAX_ROUTE_POINTS) return 'route_full';
  if (unit.stance !== 'attack') unit.stance = 'march';
  unit.anchor = null;
  unit.attackTargetId = null;
  unit.attackMemory = undefined;
  if (!unit.gather) { unit.arrivalLocked=false;unit.arrivalSeat=null;unit.target=null;unit.gather = copy(point); }
  else unit.route = [...unit.route, copy(point)];
  return 'ok';
}

export function holdGround(unit: RouteUnit): void {
  unit.arrivalLocked=false;unit.arrivalSeat=null;
  unit.stance = 'guard';
  unit.anchor = { x: unit.x, y: unit.y };
  unit.gather = null;
  unit.target = null;
  unit.route = [];
  unit.attackTargetId = null;
  unit.attackMemory = undefined;
}

export function armAttack(unit: RouteUnit): void {
  unit.stance = 'attack';
  unit.anchor = null;
}

/** Turn the current route into a loop. Without one, pace to the first free ring cell. */
export function loopRoute(unit: RouteUnit, board: WalkBoard): void {
  unit.arrivalLocked=false;unit.arrivalSeat=null;
  const here = { x: unit.x, y: unit.y };
  const planned = [here, ...(unit.gather ? [unit.gather] : []), ...unit.route];
  const loop = collapse(planned);
  const paced = loop.length >= 2 ? loop : paceAround(here, board);
  unit.stance = 'patrol';
  unit.anchor = null;
  unit.attackTargetId = null;
  unit.attackMemory = undefined;
  const start = paced[0];
  const next = paced[1];
  if (!start || !next) {
    unit.gather = null;
    unit.target = null;
    unit.route = [];
    return;
  }
  unit.gather = copy(next);
  unit.route = [...paced.slice(2).map(copy), copy(start)];
}

/** Arriving at the last cell clears the order. Patrol is the only stance that wraps. */
export function consumeWaypoint(unit: RouteUnit): void {
  if (!unit.target || unit.x !== unit.target.x || unit.y !== unit.target.y) return;
  if (unit.stance === 'patrol' && unit.gather) {
    unit.arrivalLocked=false;unit.arrivalSeat=null;
    const next = unit.route[0];
    if (!next) {
      unit.target = null;
      unit.gather = null;
      return;
    }
    unit.route = [...unit.route.slice(1), copy(unit.gather)];
    unit.gather = copy(next);
    unit.target = copy(next);
    return;
  }
  const next = unit.route[0];
  if (!next) {
    unit.target = null;
    unit.gather = null;
    return;
  }
  unit.route = unit.route.slice(1);
  unit.arrivalLocked=false;unit.arrivalSeat=null;
  unit.gather = copy(next);
  unit.target = copy(next);
}

export function guardDestination(unit: RouteUnit): Cell | null {
  if (unit.stance !== 'guard' || !unit.anchor) return null;
  if (sameCell(unit, unit.anchor)) return null;
  return unit.anchor;
}

/** While guarding, a chase step may not leave the anchor's vision. */
export function leashBlocks(unit: RouteUnit, next: Cell, radius: number): boolean {
  if (unit.stance !== 'guard' || !unit.anchor || !unit.attackTargetId) return false;
  return Math.abs(unit.anchor.x - next.x) + Math.abs(unit.anchor.y - next.y) > radius;
}

function collapse(points: readonly Cell[]): Cell[] {
  const loop: Cell[] = [];
  for (const point of points) {
    const previous = loop.at(-1);
    if (!previous || !sameCell(previous, point)) loop.push(copy(point));
  }
  const first = loop[0];
  const last = loop.at(-1);
  if (loop.length > 1 && first && last && sameCell(first, last)) loop.pop();
  return loop;
}

function paceAround(here: Cell, board: WalkBoard): Cell[] {
  const next = ringAround(here, board)[0];
  return next ? [here, next] : [here];
}
