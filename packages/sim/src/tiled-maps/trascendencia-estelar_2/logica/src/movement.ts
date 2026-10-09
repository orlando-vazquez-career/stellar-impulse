import { canEnterTile, terrainAt, wormholeExit, type GameMap } from './game-map';
import { sameTile, stepCost, type TileCoord } from './grid';
import type { TileOccupancy } from './occupancy';
import { findPath } from './pathfinding';
import { TERRAIN_RULES, type ShipWeight } from './terrain';

/** Avance necesario para cruzar una casilla en línea recta. Una diagonal cuesta 1414. */
export const TILE_PROGRESS = 1000;

export interface MovingUnit {
  readonly id: number;
  readonly weight: ShipWeight;
  /** Avance por tick sobre terreno normal: 1000 = una casilla por tick. */
  readonly speedPerTick: number;
  tile: TileCoord;
  goal: TileCoord | undefined;
  path: TileCoord[];
  progress: number;
  blockedTicks: number;
}

export interface MovementRules {
  /** Si es false, las naves se atraviesan (formación solo visual, como dice el brief v0.3). */
  readonly bodyBlocking: boolean;
  readonly repathAfterBlockedTicks: number;
  readonly giveUpAfterBlockedTicks: number;
}

export const DEFAULT_MOVEMENT_RULES: MovementRules = {
  bodyBlocking: true,
  repathAfterBlockedTicks: 3,
  giveUpAfterBlockedTicks: 12,
};

export interface MovementContext {
  readonly map: GameMap;
  readonly occupancy: TileOccupancy;
  readonly tick: number;
  readonly rules: MovementRules;
}

export function createMovingUnit(id: number, weight: ShipWeight, speedPerTick: number, tile: TileCoord): MovingUnit {
  return { id, weight, speedPerTick, tile, goal: undefined, path: [], progress: 0, blockedTicks: 0 };
}

/** El camino inicial ignora a las demás naves: se mueven, así que solo se esquivan si de verdad bloquean. */
export function orderMove(context: MovementContext, unit: MovingUnit, goal: TileCoord): boolean {
  const path = planPath(context, unit, goal, false);
  if (!path) return false;
  unit.goal = goal;
  unit.path = path;
  unit.blockedTicks = 0;
  return true;
}

/** Avanza todas las unidades un tick, en orden de id para que el resultado sea determinista. */
export function advanceUnits(
  map: GameMap,
  units: readonly MovingUnit[],
  occupancy: TileOccupancy,
  tick: number,
  rules: MovementRules = DEFAULT_MOVEMENT_RULES,
): void {
  const context: MovementContext = { map, occupancy, tick, rules };
  [...units].sort((a, b) => a.id - b.id).forEach((unit) => advanceUnit(context, unit));
}

function advanceUnit(context: MovementContext, unit: MovingUnit): void {
  const next = unit.path[0];
  if (!unit.goal || !next) {
    stop(unit);
    return;
  }
  unit.progress += progressGain(context, unit, next);
  while (unit.path.length > 0) {
    const step = unit.path[0] as TileCoord;
    if (!isValidStep(context, unit, step)) {
      replanAroundTerrain(context, unit);
      return;
    }
    const cost = isWormholeHop(context, unit.tile, step) ? 0 : stepCost(unit.tile, step);
    if (unit.progress < cost) return;
    if (!tryEnter(context, unit, step)) {
      handleBlocked(context, unit, cost);
      return;
    }
    unit.progress -= cost;
  }
  stop(unit);
}

function progressGain(context: MovementContext, unit: MovingUnit, next: TileCoord): number {
  const { speedPercent } = TERRAIN_RULES[terrainAt(context.map, next, context.tick)];
  return Math.floor((unit.speedPerTick * speedPercent) / 100);
}

function isAdjacent(a: TileCoord, b: TileCoord): boolean {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

function isWormholeHop(context: MovementContext, from: TileCoord, to: TileCoord): boolean {
  const exit = wormholeExit(context.map, from, context.tick);
  return exit !== undefined && sameTile(exit, to);
}

function isValidStep(context: MovementContext, unit: MovingUnit, step: TileCoord): boolean {
  const reachable = isAdjacent(unit.tile, step) || isWormholeHop(context, unit.tile, step);
  return reachable && canEnterTile(context.map, step, unit.weight, context.tick);
}

function tryEnter(context: MovementContext, unit: MovingUnit, step: TileCoord): boolean {
  if (context.rules.bodyBlocking && context.occupancy.isOccupiedByOther(step, unit.id)) return false;
  context.occupancy.moveTo(unit.id, step);
  unit.tile = step;
  unit.path.shift();
  unit.blockedTicks = 0;
  return true;
}

function handleBlocked(context: MovementContext, unit: MovingUnit, cost: number): void {
  unit.progress = Math.min(unit.progress, cost);
  unit.blockedTicks++;
  if (unit.blockedTicks >= context.rules.giveUpAfterBlockedTicks) {
    stop(unit);
  } else if (unit.blockedTicks % context.rules.repathAfterBlockedTicks === 0) {
    replanAroundUnits(context, unit);
  }
}

/** El terreno cambió (un paso se cerró): si ya no hay camino, la nave se detiene. */
function replanAroundTerrain(context: MovementContext, unit: MovingUnit): void {
  const path = unit.goal ? planPath(context, unit, unit.goal, false) : undefined;
  if (path) unit.path = path;
  else stop(unit);
}

/** Otra nave tapa el paso: si hay desvío se toma; si no, se sigue esperando. */
function replanAroundUnits(context: MovementContext, unit: MovingUnit): void {
  const path = unit.goal ? planPath(context, unit, unit.goal, true) : undefined;
  if (path) unit.path = path;
}

function planPath(
  context: MovementContext,
  unit: MovingUnit,
  goal: TileCoord,
  avoidUnits: boolean,
): TileCoord[] | undefined {
  const shouldAvoid = avoidUnits && context.rules.bodyBlocking;
  return findPath(context.map, {
    from: unit.tile,
    to: goal,
    weight: unit.weight,
    tick: context.tick,
    isBlocked: (tile) => shouldAvoid && context.occupancy.isOccupiedByOther(tile, unit.id),
  });
}

function stop(unit: MovingUnit): void {
  unit.goal = undefined;
  unit.path = [];
  unit.progress = 0;
  unit.blockedTicks = 0;
}
