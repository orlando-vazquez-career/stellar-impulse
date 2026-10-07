import { randomFor } from '../augments/random.js';
import { statsForUnit } from '../augments/effects.js';
import { statsFor, type Position, type World } from '../index.js';

/** A `zona_caida` rectangle from the map's `eventos` layer, in cells and seconds. */
export interface DropZoneSpec extends Position {
  id: string;
  width: number;
  height: number;
  damage: number;
  /** Cells around the impact that take the hit (eight-way). */
  radius: number;
  intervalSeconds: number;
  warningSeconds: number;
  /** Satellites per wave. */
  amount: number;
}
export interface DropZone extends Position {
  id: string;
  width: number;
  height: number;
  damage: number;
  radius: number;
  intervalTicks: number;
  warningTicks: number;
  amount: number;
}
/** One announced satellite: public from `warnTick`, it hits on `impactTick`. */
export interface SatelliteFall extends Position {
  id: string;
  zoneId: string;
  radius: number;
  damage: number;
  warnTick: number;
  impactTick: number;
}
export interface SatelliteState {
  zones: readonly DropZone[];
  falls: SatelliteFall[];
}
/** A finished fall stays in the state this long so a late view still shows the blast. */
export const SATELLITE_AFTERMATH_TICKS = 10;

export function createSatellites(specs: readonly DropZoneSpec[] | undefined, tickRate: number): SatelliteState | undefined {
  if (!specs?.length) return undefined;
  return {
    zones: Object.freeze(specs.map((spec) => Object.freeze({
      id: spec.id, x: spec.x, y: spec.y, width: spec.width, height: spec.height,
      damage: spec.damage, radius: spec.radius, amount: spec.amount,
      intervalTicks: Math.max(1, spec.intervalSeconds * tickRate),
      warningTicks: Math.max(1, spec.warningSeconds * tickRate),
    }))),
    falls: [],
  };
}

export function cloneSatellites(state: SatelliteState | undefined): SatelliteState | undefined {
  return state && { zones: state.zones, falls: state.falls.map((fall) => ({ ...fall })) };
}

/** Announce new waves and resolve the impacts due this tick. Every roll comes from the match seed. */
export function runSatellites(world: World): void {
  const state = world.satellites;
  if (!state) return;
  state.falls = state.falls.filter((fall) => world.tick < fall.impactTick + SATELLITE_AFTERMATH_TICKS);
  for (const fall of state.falls) if (fall.impactTick === world.tick) strike(world, fall);
  const seed = world.seed ?? 1;
  for (const zone of state.zones) {
    // Each zone keeps its own beat, offset by the seed so they do not all fire together.
    const phase = Math.floor(randomFor(seed, 'satellite', zone.id, 'phase')() * zone.intervalTicks);
    if (world.tick < zone.intervalTicks || (world.tick - phase) % zone.intervalTicks !== 0) continue;
    const wave = Math.floor((world.tick - phase) / zone.intervalTicks);
    const cells = openCells(world, zone);
    const rng = randomFor(seed, 'satellite', zone.id, wave);
    for (let index = 0; index < zone.amount && cells.length > 0; index += 1) {
      const [cell] = cells.splice(Math.floor(rng() * cells.length), 1);
      state.falls.push({
        id: `satellite-${zone.id}-${wave}-${index}`, zoneId: zone.id, x: cell!.x, y: cell!.y,
        radius: zone.radius, damage: zone.damage, warnTick: world.tick, impactTick: world.tick + zone.warningTicks,
      });
    }
  }
}

function openCells(world: World, zone: DropZone): Position[] {
  const cells: Position[] = [];
  for (let y = zone.y; y < zone.y + zone.height; y += 1) for (let x = zone.x; x < zone.x + zone.width; x += 1) {
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
    if (world.surface ? world.surface.walkable[y * world.width + x] === true
      : !world.obstacles.some((point) => point.x === x && point.y === y)) cells.push({ x, y });
  }
  return cells;
}

/** Neutral damage to every ship under the blast, friend or foe; armor still counts. */
function strike(world: World, fall: SatelliteFall): void {
  for (const unit of world.squads) {
    if (unit.hp <= 0 || Math.max(Math.abs(unit.x - fall.x), Math.abs(unit.y - fall.y)) > fall.radius) continue;
    unit.hp = Math.max(0, unit.hp - Math.max(1, fall.damage - statsForUnit(world, unit).armor));
    unit.lastDamageTick = world.tick;
    if (unit.hp === 0 && !unit.isDecoy) world.events?.push({
      type: 'destroyed', tick: world.tick, attackerId: fall.id, attackerOwner: null, victimId: unit.id,
      victimOwner: unit.ownerId, kind: unit.kind, cost: statsFor(world, unit.ownerId, unit.kind).cost, shot: fall.id,
    });
  }
}
