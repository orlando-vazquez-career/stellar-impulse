import { BinaryHeap } from './binary-heap';
import { canEnterTile, terrainAt, wormholeExit, type GameMap } from './game-map';
import {
  addOffset, NEIGHBOR_OFFSETS, octileDistance, sameTile, stepCost, tileFromIndex, tileIndex, type TileCoord,
} from './grid';
import { MAX_SPEED_PERCENT, TERRAIN_RULES, type ShipWeight } from './terrain';

export interface PathRequest {
  readonly from: TileCoord;
  readonly to: TileCoord;
  readonly weight: ShipWeight;
  readonly tick: number;
  /** Casillas ocupadas temporalmente (por ejemplo, naves detenidas). El destino nunca se considera bloqueado. */
  readonly isBlocked?: (tile: TileCoord) => boolean;
  readonly maxExpandedNodes?: number;
}

const WORMHOLE_TRAVEL_COST = 500;
const DEFAULT_MAX_EXPANDED_NODES = 20000;

interface OpenNode {
  readonly index: number;
  readonly costSoFar: number;
  readonly estimate: number;
}

export function terrainStepCost(map: GameMap, from: TileCoord, to: TileCoord, tick: number): number {
  const { speedPercent } = TERRAIN_RULES[terrainAt(map, to, tick)];
  return Math.floor((stepCost(from, to) * 100) / speedPercent);
}

function heuristic(from: TileCoord, to: TileCoord): number {
  return Math.floor((octileDistance(from, to) * 100) / MAX_SPEED_PERCENT);
}

function compareNodes(a: OpenNode, b: OpenNode): number {
  return a.costSoFar + a.estimate - (b.costSoFar + b.estimate) || a.estimate - b.estimate || a.index - b.index;
}

/** A* sobre la grilla con costo por terreno. Devuelve el camino sin la casilla de origen, o undefined. */
export function findPath(map: GameMap, request: PathRequest): TileCoord[] | undefined {
  if (!canEnterTile(map, request.to, request.weight, request.tick)) return undefined;
  if (sameTile(request.from, request.to)) return [];
  const search = new PathSearch(map, request);
  return search.run();
}

class PathSearch {
  private readonly open = new BinaryHeap<OpenNode>(compareNodes);
  private readonly bestCost = new Map<number, number>();
  private readonly cameFrom = new Map<number, number>();
  private readonly goalIndex: number;

  constructor(private readonly map: GameMap, private readonly request: PathRequest) {
    this.goalIndex = tileIndex(map, request.to);
  }

  run(): TileCoord[] | undefined {
    this.enqueue(tileIndex(this.map, this.request.from), 0);
    let expanded = 0;
    const limit = this.request.maxExpandedNodes ?? DEFAULT_MAX_EXPANDED_NODES;
    while (this.open.size > 0 && expanded < limit) {
      const node = this.open.pop() as OpenNode;
      if (node.index === this.goalIndex) return this.rebuildPath();
      if (node.costSoFar > (this.bestCost.get(node.index) ?? Infinity)) continue;
      expanded++;
      this.expand(node);
    }
    return undefined;
  }

  private expand(node: OpenNode): void {
    const current = tileFromIndex(this.map, node.index);
    for (const offset of NEIGHBOR_OFFSETS) {
      const next = addOffset(current, offset);
      if (this.canStep(current, next)) {
        this.relax(node, next, terrainStepCost(this.map, current, next, this.request.tick));
      }
    }
    const exit = wormholeExit(this.map, current, this.request.tick);
    if (exit && this.isPassable(exit)) this.relax(node, exit, WORMHOLE_TRAVEL_COST);
  }

  private canStep(from: TileCoord, to: TileCoord): boolean {
    if (!this.isPassable(to)) return false;
    const isDiagonal = from.x !== to.x && from.y !== to.y;
    return !isDiagonal || (this.isPassable({ x: to.x, y: from.y }) && this.isPassable({ x: from.x, y: to.y }));
  }

  private isPassable(tile: TileCoord): boolean {
    if (!canEnterTile(this.map, tile, this.request.weight, this.request.tick)) return false;
    if (sameTile(tile, this.request.to)) return true;
    return !(this.request.isBlocked?.(tile) ?? false);
  }

  private relax(node: OpenNode, next: TileCoord, cost: number): void {
    const nextIndex = tileIndex(this.map, next);
    const costSoFar = node.costSoFar + cost;
    if (costSoFar >= (this.bestCost.get(nextIndex) ?? Infinity)) return;
    this.cameFrom.set(nextIndex, node.index);
    this.enqueue(nextIndex, costSoFar);
  }

  private enqueue(index: number, costSoFar: number): void {
    this.bestCost.set(index, costSoFar);
    this.open.push({ index, costSoFar, estimate: heuristic(tileFromIndex(this.map, index), this.request.to) });
  }

  private rebuildPath(): TileCoord[] {
    const path: TileCoord[] = [];
    const startIndex = tileIndex(this.map, this.request.from);
    for (let index = this.goalIndex; index !== startIndex; index = this.cameFrom.get(index) as number) {
      path.push(tileFromIndex(this.map, index));
    }
    return path.reverse();
  }
}
