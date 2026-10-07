/** Group march orders: every selected ship gets its own seat in a shape that faces the march. */
import { FORMATION_KINDS, type FormationKindName } from '@impulso/input';

export const FORMATIONS = FORMATION_KINDS;
export type FormationKind = FormationKindName;
export const MAX_FORMATION_SHIPS = 24;

export interface FormationCell { readonly x: number; readonly y: number }
export interface FormationUnit extends FormationCell { readonly id: string }

export function isFormation(value: unknown): value is FormationKind {
  return typeof value === 'string' && (FORMATIONS as readonly string[]).includes(value);
}

/**
 * Seats in the formation's own frame: `side` runs across the march, `depth` is 0 at the
 * front and negative behind it. Index 0 is the front of the formation.
 */
export function formationShape(kind: FormationKind, count: number): { side: number; depth: number }[] {
  const seats: { side: number; depth: number }[] = [];
  if (count <= 0) return seats;
  const row = (width: number, depth: number, step = 1) => {
    for (let index = 0; index < width; index++) seats.push({ side: (index - (width - 1) / 2) * step, depth });
  };
  if (kind === 'line') row(count, 0);
  else if (kind === 'column') for (let index = 0; index < count; index++) seats.push({ side: 0, depth: -index });
  else if (kind === 'wedge') {
    // Leader on the point, each row one ship wider: a filled arrowhead.
    for (let depth = 0; seats.length < count; depth++) row(Math.min(depth + 1, count - seats.length), -depth, 2);
  } else if (kind === 'box') {
    const side = Math.ceil(Math.sqrt(count));
    for (let depth = 0; seats.length < count; depth++) row(Math.min(side, count - seats.length), -depth);
  } else if (kind === 'ranks') {
    // Wide firing lines: up to five ships per rank, at least two ranks once there are four ships.
    const ranks = count < 4 ? 1 : Math.max(2, Math.ceil(count / 5));
    const width = Math.ceil(count / ranks);
    for (let depth = 0; seats.length < count; depth++) row(Math.min(width, count - seats.length), -depth * 2);
  } else {
    if (count === 1) return [{ side: 0, depth: 0 }];
    // Ring around the clicked cell, wide enough that neighbours do not share a cell.
    const radius = Math.max(1, Math.ceil(count / 6.2));
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      seats.push({ side: Math.sin(angle) * radius, depth: Math.cos(angle) * radius });
    }
    return seats;
  }
  // The clicked cell sits in the middle of the shape, not at its front edge.
  const minDepth = Math.min(...seats.map((seat) => seat.depth));
  const shift = Math.round(minDepth / 2);
  return seats.map((seat) => ({ side: seat.side, depth: seat.depth - shift }));
}

const DIRECTIONS: readonly FormationCell[] = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
];

/** The march heading snapped to one of the eight grid directions. */
export function marchHeading(from: FormationCell, to: FormationCell, fallback: FormationCell = { x: 0, y: -1 }): FormationCell {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return fallback;
  const sector = Math.round(Math.atan2(dx, -dy) / (Math.PI / 4));
  return DIRECTIONS[((sector % 8) + 8) % 8]!;
}

/**
 * Seat cells for the shape, rotated to the heading. Diagonal headings use the diagonal lattice,
 * so the shape keeps its proportions instead of collapsing when rounded to the grid.
 */
export function formationCells(kind: FormationKind, count: number, center: FormationCell, heading: FormationCell): FormationCell[] {
  // A ring has no front; keep it round instead of stretching it along a diagonal.
  const forward = kind === 'circle' ? { x: 0, y: -1 } : heading;
  // Right-hand side of the march. On a diagonal heading both axes are diagonal steps.
  const across = { x: -forward.y, y: forward.x };
  return formationShape(kind, count).map((seat) => ({
    x: center.x + Math.round(seat.side * across.x + seat.depth * forward.x),
    y: center.y + Math.round(seat.side * across.y + seat.depth * forward.y),
  }));
}

export interface FormationBoard {
  /** Walkable and inside the map. */
  open(cell: FormationCell): boolean;
  /** The unit can fly there. Optional because it is the expensive check. */
  reachable?(from: FormationCell, to: FormationCell): boolean;
}

const key = (cell: FormationCell) => `${cell.x},${cell.y}`;
const squared = (a: FormationCell, b: FormationCell) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Closest open cell to `cell`, searched in growing squares, avoiding taken cells. */
function nearestOpen(cell: FormationCell, taken: ReadonlySet<string>, board: FormationBoard, ok: (cell: FormationCell) => boolean): FormationCell | null {
  for (let radius = 0; radius <= 6; radius++) {
    let best: FormationCell | null = null;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const candidate = { x: cell.x + dx, y: cell.y + dy };
      if (taken.has(key(candidate)) || !board.open(candidate) || !ok(candidate)) continue;
      if (!best || squared(candidate, cell) < squared(best, cell)
        || (squared(candidate, cell) === squared(best, cell) && (candidate.y - best.y || candidate.x - best.x) < 0)) best = candidate;
    }
    if (best) return best;
  }
  return null;
}

const NEIGHBOURS: readonly FormationCell[] = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];
const FORMATION_REACH = 12;
const MAX_SHIFT = 2;

/** Open cells joined to `from` without crossing rock (diagonals need both sides open), by steps. */
function connectedCells(from: FormationCell, board: FormationBoard): Map<string, { cell: FormationCell; depth: number }> {
  const found = new Map<string, { cell: FormationCell; depth: number }>();
  if (!board.open(from)) return found;
  found.set(key(from), { cell: from, depth: 0 });
  let frontier = [from];
  for (let depth = 1; depth <= FORMATION_REACH && frontier.length; depth++) {
    const next: FormationCell[] = [];
    for (const cell of frontier) for (const step of NEIGHBOURS) {
      const to = { x: cell.x + step.x, y: cell.y + step.y };
      if (found.has(key(to)) || !board.open(to)) continue;
      if (step.x && step.y && (!board.open({ x: to.x, y: cell.y }) || !board.open({ x: cell.x, y: to.y }))) continue;
      found.set(key(to), { cell: to, depth });
      next.push(to);
    }
    frontier = next;
  }
  return found;
}

/**
 * Seat cells that fit the terrain. The shape may slide up to two cells from the click to fit
 * better; a seat that still lands on rock moves to the closest free cell joined to the group,
 * never to a pocket on the far side of an asteroid.
 */
function fitSeats(kind: FormationKind, count: number, center: FormationCell, facing: FormationCell, board: FormationBoard): FormationCell[] {
  let best: { center: FormationCell; region: ReturnType<typeof connectedCells>; fit: number; shift: number } | null = null;
  for (let dy = -MAX_SHIFT; dy <= MAX_SHIFT; dy++) for (let dx = -MAX_SHIFT; dx <= MAX_SHIFT; dx++) {
    const shifted = { x: center.x + dx, y: center.y + dy };
    if (!board.open(shifted)) continue;
    const region = connectedCells(shifted, board);
    const fit = formationCells(kind, count, shifted, facing).filter((cell) => region.has(key(cell))).length;
    const shift = dx * dx + dy * dy;
    // Sliding costs a little: a seat gained must be worth moving the whole shape.
    if (!best || fit - shift * 0.4 > best.fit - best.shift * 0.4) best = { center: shifted, region, fit, shift };
  }
  if (!best) return [];
  const { region } = best;
  const wanted = formationCells(kind, count, best.center, facing);
  const taken = new Set<string>();
  const seats: (FormationCell | null)[] = wanted.map((cell) => {
    if (!region.has(key(cell)) || taken.has(key(cell))) return null;
    taken.add(key(cell));
    return cell;
  });
  const spare = [...region.values()].sort((a, b) => a.depth - b.depth || a.cell.y - b.cell.y || a.cell.x - b.cell.x);
  return seats.map((seat, index) => {
    if (seat) return seat;
    const goal = wanted[index]!;
    // Close to the intended seat, but a cell only reached by a long detour round the rock is not close.
    const cost = (option: { cell: FormationCell; depth: number }) => {
      const detour = option.depth - Math.max(Math.abs(option.cell.x - best!.center.x), Math.abs(option.cell.y - best!.center.y));
      return squared(option.cell, goal) + 4 * detour * detour;
    };
    let choice: { cell: FormationCell; depth: number } | null = null;
    for (const option of spare) {
      if (taken.has(key(option.cell))) continue;
      if (!choice || cost(option) < cost(choice)) choice = option;
    }
    if (!choice) return null;
    taken.add(key(choice.cell));
    return choice.cell;
  }).filter((seat): seat is FormationCell => !!seat);
}

/**
 * One seat per ship. The pairing minimises the total squared travel, which also means no two
 * ships cross paths on the way: the ship on the left takes the left seat, the front ship the front.
 * Deterministic for the same input, so client prediction and server agree.
 */
export function planFormation(units: readonly FormationUnit[], center: FormationCell, kind: FormationKind, board: FormationBoard,
  heading?: FormationCell): Map<string, FormationCell> {
  const ordered = [...units].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const plan = new Map<string, FormationCell>();
  if (!ordered.length) return plan;
  const centroid = {
    x: ordered.reduce((sum, unit) => sum + unit.x, 0) / ordered.length,
    y: ordered.reduce((sum, unit) => sum + unit.y, 0) / ordered.length,
  };
  const facing = heading ?? marchHeading(centroid, center);
  const seats = fitSeats(kind, ordered.length, center, facing, board);
  // Start from a sweep pairing (front-to-back, then left-to-right on both sides), then remove
  // any crossing with pairwise swaps until no swap shortens the total travel.
  const across = { x: -facing.y, y: facing.x };
  const rank = (cell: FormationCell) => [-(cell.x * facing.x + cell.y * facing.y), cell.x * across.x + cell.y * across.y] as const;
  const byRank = (a: FormationCell, b: FormationCell) => {
    const [da, sa] = rank(a); const [db, sb] = rank(b);
    return Math.round(da) - Math.round(db) || sa - sb;
  };
  const ships = [...ordered].sort((a, b) => byRank(a, b) || (a.id < b.id ? -1 : 1));
  const places = [...seats].sort(byRank);
  const pairs = ships.slice(0, places.length).map((unit, index) => ({ unit, seat: places[index]! }));
  for (let pass = 0; pass < 12; pass++) {
    let improved = false;
    for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
      const a = pairs[i]!; const b = pairs[j]!;
      const now = squared(a.unit, a.seat) + squared(b.unit, b.seat);
      const swapped = squared(a.unit, b.seat) + squared(b.unit, a.seat);
      if (swapped < now) { const seat = a.seat; a.seat = b.seat; b.seat = seat; improved = true; }
    }
    if (!improved) break;
  }
  // A seat the ship cannot reach (other side of a wall) falls back to the nearest reachable cell.
  const used = new Set(pairs.map((pair) => key(pair.seat)));
  for (const pair of pairs) {
    if (!board.reachable || board.reachable(pair.unit, pair.seat)) { plan.set(pair.unit.id, pair.seat); continue; }
    used.delete(key(pair.seat));
    const fallback = nearestOpen(pair.seat, used, board, (cell) => board.reachable!(pair.unit, cell));
    if (fallback) { used.add(key(fallback)); plan.set(pair.unit.id, fallback); }
  }
  return plan;
}
