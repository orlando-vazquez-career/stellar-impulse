import { canCrossHeight, type RampDirection } from '../mapas/alturas.js';
import { MAX_MAP_SIDE, type MapCell } from './types.js';

export interface PathMap {
  readonly width: number;
  readonly height: number;
  readonly walkable: readonly boolean[];
  readonly level?: readonly number[];
  readonly ramp?: readonly (RampDirection | null)[];
}
export interface PathOptions { readonly maxExpansions?: number }
export type PathResult =
  | { readonly status: 'found'; readonly path: MapCell[]; readonly expansions: number }
  | { readonly status: 'blocked' | 'unreachable' | 'budget_exceeded' | 'invalid'; readonly expansions: number };

interface Node { index: number; g: number; h: number; f: number }

/** Compare equal-cost nodes by h, then row-major cell index. */
function before(a: Node, b: Node): boolean {
  return a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.index < b.index)));
}

class MinHeap {
  private readonly nodes: Node[] = [];
  get length(): number { return this.nodes.length; }

  push(node: Node): void {
    const nodes = this.nodes;
    let index = nodes.length;
    nodes.push(node);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (!before(node, nodes[parent]!)) break;
      nodes[index] = nodes[parent]!;
      index = parent;
    }
    nodes[index] = node;
  }

  pop(): Node {
    const nodes = this.nodes;
    const first = nodes[0]!;
    const last = nodes.pop()!;
    if (nodes.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < nodes.length) {
      let child = index * 2 + 1;
      if (child + 1 < nodes.length && before(nodes[child + 1]!, nodes[child]!)) child++;
      if (!before(nodes[child]!, last)) break;
      nodes[index] = nodes[child]!;
      index = child;
    }
    nodes[index] = last;
    return first;
  }
}

/** Static-terrain A*: four neighbors in N,E,S,W order; Manhattan distance.
 * Returned path omits start and includes goal. All outcomes report popped-cell expansions.
 */
export function findPath(map: PathMap, start: MapCell, goal: MapCell, options: PathOptions = {}): PathResult {
  const { width, height, walkable, level, ramp } = map;
  const validCell = (cell: MapCell): boolean => Number.isSafeInteger(cell.x) && Number.isSafeInteger(cell.y)
    && cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height;
  const cells = width * height;
  const requested = options.maxExpansions ?? cells;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > MAX_MAP_SIDE || height > MAX_MAP_SIDE || walkable.length !== cells
    || !Number.isSafeInteger(requested) || requested < 0 || !validCell(start) || !validCell(goal)
    || (level === undefined) !== (ramp === undefined)
    || (level !== undefined && ramp !== undefined && (level.length !== cells || ramp.length !== cells))) {
    return { status: 'invalid', expansions: 0 };
  }
  const startIndex = start.y * width + start.x;
  const goalIndex = goal.y * width + goal.x;
  if (walkable[startIndex] !== true || walkable[goalIndex] !== true) return { status: 'blocked', expansions: 0 };
  if (startIndex === goalIndex) return { status: 'found', path: [], expansions: 0 };
  const cap = Math.min(requested, cells);
  const bestG = new Int32Array(cells).fill(0x7fffffff);
  const previous = new Int32Array(cells).fill(-1);
  const closed = new Uint8Array(cells);
  const heap = new MinHeap();
  const heuristic = (x: number, y: number): number => Math.abs(goal.x - x) + Math.abs(goal.y - y);
  const firstH = heuristic(start.x, start.y);
  bestG[startIndex] = 0;
  heap.push({ index: startIndex, g: 0, h: firstH, f: firstH });
  let expansions = 0;
  while (heap.length > 0) {
    const current = heap.pop();
    if (closed[current.index] || current.g !== bestG[current.index]) continue;
    if (expansions >= cap) return { status: 'budget_exceeded', expansions };
    closed[current.index] = 1;
    expansions++;
    if (current.index === goalIndex) {
      const path: MapCell[] = [];
      for (let index = goalIndex; index !== startIndex; index = previous[index]!) {
        path.push({ x: index % width, y: Math.floor(index / width) });
      }
      path.reverse();
      return { status: 'found', path, expansions };
    }
    const x = current.index % width;
    const y = Math.floor(current.index / width);
    const neighbors = [
      y > 0 ? current.index - width : -1,
      x + 1 < width ? current.index + 1 : -1,
      y + 1 < height ? current.index + width : -1,
      x > 0 ? current.index - 1 : -1,
    ];
    for (const next of neighbors) {
      if (next < 0 || closed[next] || walkable[next] !== true) continue;
      if (level && ramp && !canCrossHeight({ width, level, ramp, from: current.index, to: next })) continue;
      const g = current.g + 1;
      if (g >= bestG[next]!) continue;
      const h = heuristic(next % width, Math.floor(next / width));
      bestG[next] = g;
      previous[next] = current.index;
      heap.push({ index: next, g, h, f: g + h });
    }
  }
  return { status: 'unreachable', expansions };
}
