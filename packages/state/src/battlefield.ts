import {
  MAX_MAP_SIDE, type BattlefieldWorld, type Guardian, type MapCell, type PlayerId, type ResourceNode, type Rules,
} from '@impulso/sim';

/** Row-major cells, bit 0 first within each byte; trailing padding bits are zero. */
export interface BattlefieldMask {
  encoding: 'bitset-lsb0';
  width: number;
  height: number;
  data: number[];
}

const validDimensions = (width: number, height: number): boolean =>
  Number.isSafeInteger(width) && Number.isSafeInteger(height)
  && width >= 1 && height >= 1 && width <= MAX_MAP_SIDE && height <= MAX_MAP_SIDE;

/** Read a dense ordinary array without invoking indexed accessors. */
function ownArrayValues<T>(value: readonly T[], length: number, valid: (item: unknown) => item is T): T[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length !== length || Reflect.ownKeys(value).length !== length + 1) return null;
  const result: T[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !valid(descriptor.value)) return null;
    result.push(descriptor.value);
  }
  return result;
}

export function encodeBattlefieldMask(cells: readonly boolean[], width: number, height: number): BattlefieldMask {
  const count = width * height;
  if (!validDimensions(width, height)) throw new Error('Invalid battlefield mask');
  const values = ownArrayValues(cells, count, (item): item is boolean => typeof item === 'boolean');
  if (!values) throw new Error('Invalid battlefield mask');
  const data = Array<number>(Math.ceil(count / 8)).fill(0);
  for (let index = 0; index < count; index++) if (values[index] === true) data[index >>> 3]! |= 1 << (index & 7);
  return { encoding: 'bitset-lsb0', width, height, data };
}

/** Decode a network mask to a fresh row-major boolean array. */
export function decodeBattlefieldMask(mask: BattlefieldMask): boolean[] {
  const { width, height, data } = mask;
  const count = width * height;
  if (mask.encoding !== 'bitset-lsb0' || !validDimensions(width, height)) throw new Error('Invalid battlefield mask');
  const bytes = ownArrayValues(data, Math.ceil(count / 8),
    (item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 255);
  if (!bytes || (count % 8 !== 0 && bytes[bytes.length - 1]! >>> (count % 8) !== 0)) {
    throw new Error('Invalid battlefield mask');
  }
  return Array.from({ length: count }, (_, index) => (bytes[index >>> 3]! & (1 << (index & 7))) !== 0);
}

export interface BattlefieldPublicSquad {
  id: string;
  ownerId: PlayerId;
  kind: 'interceptor';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
}
export interface BattlefieldOwnSquad extends BattlefieldPublicSquad {
  target: MapCell | null;
  route: MapCell[];
  attackTargetId: string | null;
}
export interface BattlefieldPublicPlayer { id: PlayerId; base: MapCell; metal?: number; lastSequence?: number }
export interface BattlefieldView {
  schemaVersion: 2;
  mode: 'battlefield';
  mapId: string;
  mapVersion: number;
  tick: number;
  playerId: PlayerId;
  width: number;
  height: number;
  rules: Rules;
  players: Record<PlayerId, BattlefieldPublicPlayer>;
  squads: (BattlefieldPublicSquad | BattlefieldOwnSquad)[];
  guardians: Guardian[];
  nodes: ResourceNode[];
  core: BattlefieldWorld['core'];
  visible: BattlefieldMask;
  explored: BattlefieldMask;
  winner: PlayerId | null;
}

/** Whitelist snapshot from World-owned fog; projection neither computes nor advances fog. */
export function battlefieldViewFor(world: BattlefieldWorld, playerId: PlayerId): BattlefieldView {
  if (playerId !== 'p1' && playerId !== 'p2') throw new Error('Unknown player');
  const mask = world.visible[playerId];
  const canSee = (unit: MapCell): boolean => mask[unit.y * world.width + unit.x] === true;
  const players: BattlefieldView['players'] = {
    p1: { id: 'p1', base: { x: world.players.p1.base.x, y: world.players.p1.base.y } },
    p2: { id: 'p2', base: { x: world.players.p2.base.x, y: world.players.p2.base.y } },
  };
  players[playerId].metal = world.players[playerId].metal;
  players[playerId].lastSequence = world.players[playerId].lastSequence;
  return {
    schemaVersion: 2, mode: 'battlefield', mapId: world.map.id, mapVersion: world.map.version,
    tick: world.tick, playerId, width: world.width, height: world.height,
    rules: {
      tickRate: world.rules.tickRate, moveEveryTicks: world.rules.moveEveryTicks,
      attackEveryTicks: world.rules.attackEveryTicks, visionRadius: world.rules.visionRadius,
      captureRadius: world.rules.captureRadius, nodeCaptureTicks: world.rules.nodeCaptureTicks,
      coreOpenTick: world.rules.coreOpenTick, coreCaptureTicks: world.rules.coreCaptureTicks,
    },
    players,
    squads: world.squads.filter((unit) => unit.ownerId === playerId || (unit.hp > 0 && canSee(unit)))
      .map((unit) => {
        const publicUnit: BattlefieldPublicSquad = {
          id: unit.id, ownerId: unit.ownerId, kind: unit.kind,
          x: unit.x, y: unit.y, hp: unit.hp, maxHp: unit.maxHp, damage: unit.damage,
        };
        return unit.ownerId === playerId ? {
          ...publicUnit,
          target: unit.target ? { x: unit.target.x, y: unit.target.y } : null,
          route: unit.route.map((cell) => ({ x: cell.x, y: cell.y })),
          attackTargetId: unit.attackTargetId,
        } : publicUnit;
      }),
    guardians: world.guardians.filter(canSee).map((unit) => ({
      id: unit.id, objectiveId: unit.objectiveId, x: unit.x, y: unit.y,
      hp: unit.hp, maxHp: unit.maxHp, damage: unit.damage,
    })),
    nodes: world.nodes.filter(canSee).map((node) => ({
      id: node.id, kind: node.kind, guardianId: node.guardianId,
      x: node.x, y: node.y, ownerId: node.ownerId,
      progress: { p1: node.progress.p1, p2: node.progress.p2 },
    })),
    core: {
      id: world.core.id, guardianId: world.core.guardianId, x: world.core.x, y: world.core.y,
      open: world.core.open, progress: { p1: world.core.progress.p1, p2: world.core.progress.p2 },
    },
    visible: encodeBattlefieldMask(world.visible[playerId], world.width, world.height),
    explored: encodeBattlefieldMask(world.explored[playerId], world.width, world.height),
    winner: world.winner,
  };
}
