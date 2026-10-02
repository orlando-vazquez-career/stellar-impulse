import { canCrossHeight } from '../mapas/alturas.js';
import type { MapCell, MapSpec } from './types.js';

export interface OccupancySquad extends MapCell {
  id: string;
  ownerId: 'p1' | 'p2';
  hp: number;
  x: number;
  y: number;
  route: MapCell[];
  target: MapCell | null;
}

export interface OccupancyWorld {
  map: Pick<MapSpec, 'width' | 'height' | 'walkable' | 'level' | 'ramp'>;
  squads: OccupancySquad[];
  guardians: { id: string; x: number; y: number; hp: number }[];
}

const key = (width: number, cell: MapCell): number => cell.y * width + cell.x;

function canStep(map: OccupancyWorld['map'], from: MapCell, to: MapCell): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return false;
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
  if (to.x < 0 || to.y < 0 || to.x >= map.width || to.y >= map.height) return false;
  if (map.walkable[key(map.width, to)] !== true) return false;
  if (dx !== 0 && dy !== 0) {
    const sideA = { x: to.x, y: from.y };
    const sideB = { x: from.x, y: to.y };
    if (map.walkable[key(map.width, sideA)] !== true || map.walkable[key(map.width, sideB)] !== true) return false;
  }
  if (map.level && map.ramp && !canCrossHeight({
    width: map.width, level: map.level, ramp: map.ramp,
    from: key(map.width, from), to: key(map.width, to),
  })) return false;
  return true;
}

/** Resolve one simultaneous eight-way step. Ally chains and cycles may advance;
 * enemies and live guardians block. Ally cycles reserve their cells first;
 * remaining equal destination claims use squad ID order.
 */
export function advanceOccupancy(world: OccupancyWorld): number {
  const { map } = world;
  const units = world.squads.filter((unit) => unit.hp > 0).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const occupants = new Map<number, { id: string; ownerId?: 'p1' | 'p2' }>();
  for (const unit of [...units, ...world.guardians.filter((guardian) => guardian.hp > 0)]) {
    const cell = key(map.width, unit);
    if (occupants.has(cell)) throw new Error('Overlapping live units');
    occupants.set(cell, unit);
  }
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const intents = new Map<string, { unit: OccupancySquad; next: MapCell; cell: number;
    yieldFrom?: MapCell; priorRoute?: MapCell[]; priorTarget?: MapCell | null }>();
  const claimed = new Set<number>();
  const proposed = new Map<string, { unit: OccupancySquad; next: MapCell; cell: number }>();
  for (const unit of units) {
    const next = unit.route[0];
    if (!next || !Number.isSafeInteger(next.x) || !Number.isSafeInteger(next.y)
      || !canStep(map, unit, next)) continue;
    const cell = key(map.width, next);
    if (map.walkable[cell] !== true) continue;
    proposed.set(unit.id, { unit, next, cell });
  }
  // Reserve complete ally cycles before ordinary claims. Otherwise an earlier
  // third-party claimant can break a cycle and strand a valid route forever.
  for (const unit of units) {
    if (intents.has(unit.id)) continue;
    const path: string[] = [];
    const seen = new Map<string, number>();
    let current: OccupancySquad | undefined = unit;
    while (current && !seen.has(current.id)) {
      const proposal = proposed.get(current.id);
      if (!proposal || claimed.has(proposal.cell)) break;
      seen.set(current.id, path.length);
      path.push(current.id);
      const blocker = occupants.get(proposal.cell);
      const ally = blocker && byId.get(blocker.id);
      current = ally?.ownerId === unit.ownerId ? ally : undefined;
    }
    if (!current || !seen.has(current.id)) continue;
    for (const id of path.slice(seen.get(current.id)!)) {
      const proposal = proposed.get(id)!;
      claimed.add(proposal.cell);
      intents.set(id, proposal);
    }
  }
  for (const unit of units) {
    const proposal = proposed.get(unit.id);
    if (!proposal || intents.has(unit.id) || claimed.has(proposal.cell)) continue;
    claimed.add(proposal.cell);
    intents.set(unit.id, proposal);
  }
  const cellAt = (index: number): MapCell => ({ x: index % map.width, y: Math.floor(index / map.width) });
  const displaceIdleChain = (blocker: OccupancySquad, ownerId: 'p1' | 'p2'): boolean => {
    const start = key(map.width, blocker);
    const parent = new Map<number, number>([[start, -1]]);
    const queue = [start];
    let free = -1;
    for (let head = 0; head < queue.length && free < 0; head += 1) {
      const cell = cellAt(queue[head]!);
      const neighbors = [
        cell.y > 0 ? key(map.width, { x: cell.x, y: cell.y - 1 }) : -1,
        cell.x + 1 < map.width ? key(map.width, { x: cell.x + 1, y: cell.y }) : -1,
        cell.y + 1 < map.height ? key(map.width, { x: cell.x, y: cell.y + 1 }) : -1,
        cell.x > 0 ? key(map.width, { x: cell.x - 1, y: cell.y }) : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || parent.has(next) || claimed.has(next) || map.walkable[next] !== true) continue;
        if (!canStep(map, cell, cellAt(next))) continue;
        const occupant = occupants.get(next);
        if (occupant) {
          const ally = byId.get(occupant.id);
          if (!ally || ally.ownerId !== ownerId || ally.route.length > 1 || intents.has(ally.id)) continue;
        }
        parent.set(next, queue[head]!);
        if (!occupant) { free = next; break; }
        queue.push(next);
      }
    }
    if (free < 0) return false;
    const chain = [free];
    for (let cursor = free; cursor !== start; cursor = parent.get(cursor)!) chain.push(parent.get(cursor)!);
    chain.reverse();
    for (let index = 0; index + 1 < chain.length; index += 1) {
      const from = chain[index]!;
      const to = chain[index + 1]!;
      const ally = byId.get(occupants.get(from)!.id)!;
      intents.set(ally.id, { unit: ally, next: cellAt(to), cell: to, yieldFrom: cellAt(from),
        priorRoute: ally.route.map((step) => ({ ...step })),
        priorTarget: ally.target ? { ...ally.target } : null });
      claimed.add(to);
    }
    return true;
  };
  // Settled allies may shift as a short local chain toward a vacant cell, then
  // return to their own destinations. This is occupancy resolution, not A*.
  for (const intent of [...intents.values()]) {
    if (intent.unit.route.length <= 1) continue;
    const occupant = occupants.get(intent.cell);
    if (!occupant || occupant.ownerId !== intent.unit.ownerId || intents.has(occupant.id)) continue;
    const blocker = byId.get(occupant.id);
    if (!blocker || blocker.route.length > 1) continue;
    if (displaceIdleChain(blocker, intent.unit.ownerId)) continue;
    // A fully packed pocket can still exchange the blocker with the mover.
    const origin = { x: intent.unit.x, y: intent.unit.y };
    const originIndex = key(map.width, origin);
    if (claimed.has(originIndex) || !canStep(map, blocker, origin)) continue;
    claimed.add(originIndex);
    intents.set(blocker.id, { unit: blocker, next: origin, cell: originIndex,
      yieldFrom: { x: blocker.x, y: blocker.y },
      priorRoute: blocker.route.map((step) => ({ ...step })),
      priorTarget: blocker.target ? { ...blocker.target } : null });
  }
  const decisions = new Map<string, boolean>();
  const visiting = new Set<string>();
  const canMove = (id: string): boolean => {
    if (decisions.has(id)) return decisions.get(id)!;
    if (visiting.has(id)) return true; // A closed ally cycle moves simultaneously.
    const intent = intents.get(id);
    if (!intent) return false;
    visiting.add(id);
    const blocker = occupants.get(intent.cell);
    const allowed = !blocker || (blocker.ownerId === intent.unit.ownerId && canMove(blocker.id));
    visiting.delete(id);
    decisions.set(id, allowed);
    return allowed;
  };
  for (const id of intents.keys()) canMove(id);
  let moved = 0;
  for (const unit of units) {
    if (decisions.get(unit.id) !== true) continue;
    const next = intents.get(unit.id)!.next;
    unit.x = next.x;
    unit.y = next.y;
    const intent = intents.get(unit.id)!;
    const yielded = intent.yieldFrom;
    if (yielded) {
      unit.route = [yielded, ...(intent.priorRoute ?? [])];
      unit.target = intent.priorTarget ?? yielded;
    } else {
      unit.route.shift();
      if (unit.route.length === 0) unit.target = null;
    }
    moved += 1;
  }
  return moved;
}
