import { distance, statsFor, moveInterval, type ShipStats, type Guardian, type PlayerId, type PlayerStance, type Position, type ResourceNode, type Rules, type Squad, type UnitKind, type World } from '@impulso/sim';
export { UNIT_STATS, damageAgainst, findPath } from '@impulso/sim';
export type { UnitKind } from '@impulso/sim';

export interface VisibleSquad extends Omit<Squad, 'target' | 'attackTargetId' | 'stance' | 'anchor' | 'gather' | 'route'> {
  stats?: ShipStats;
  moveTicks?: number;
  /** Rival destinations remain private even while their units are visible. */
  target?: Position | null;
  attackTargetId?: string | null;
  stance?: PlayerStance;
  anchor?: Position | null;
  route?: Position[];
}
export interface PlayerView {
  schemaVersion: 1;
  mode: 'training';
  tick: number;
  duration?: World['duration'];
  playerId: PlayerId;
  width: number;
  height: number;
  obstacles: Position[];
  walkable?: boolean[];
  level?: number[];
  rules: Rules;
  unitStats?: Record<UnitKind, ShipStats>;
  /** Metal and the hangar queue are private to their owner. */
  players: Record<PlayerId, { id: PlayerId; base: Position; metal?: number; baseUpgrades?: { damage: number; capacity: number }; production?: { kind: UnitKind; remainingTicks: number } | null }>;
  squads: VisibleSquad[];
  guardians: Guardian[];
  nodes: ResourceNode[];
  core: World['core'];
  visibleCells: Position[];
  winner: PlayerId | null;
}
/** Fresh whitelist snapshot. Never send the authoritative world to a player. */
export function viewFor(world: World, playerId: PlayerId): PlayerView {
  if (playerId !== 'p1' && playerId !== 'p2') throw new Error('Unknown player');
  const sources: { position: Position; bonus: number }[] = [
    { position: world.players[playerId].base, bonus: 0 },
    ...world.squads.filter((unit) => unit.ownerId === playerId && unit.hp > 0)
      .map((unit) => ({ position: unit, bonus: statsFor(world, playerId, unit.kind).vision - world.rules.visionRadius })),
  ];
  const visible = (position: Position): boolean => sources.some((source) => distance(source.position, position) <= world.rules.visionRadius + source.bonus);
  const visibleCells: Position[] = [];
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) if (visible({ x, y })) visibleCells.push({ x, y });
  }
  const players: PlayerView['players'] = {
    p1: { id: 'p1', base: { ...world.players.p1.base } },
    p2: { id: 'p2', base: { ...world.players.p2.base } },
  };
  players[playerId].metal = world.players[playerId].metal;
  players[playerId].baseUpgrades = { ...(world.players[playerId].baseUpgrades ?? { damage: 0, capacity: 0 }) };
  const order = world.production[playerId];
  players[playerId].production = order ? { kind: order.kind, remainingTicks: Math.max(0, order.readyTick - world.tick) } : null;
  return {
    schemaVersion: 1, mode: 'training', tick: world.tick, playerId, duration: world.duration,
    width: world.width, height: world.height, obstacles: world.obstacles.map((point) => ({ ...point })),
    ...(world.surface ? { walkable: [...world.surface.walkable], level: [...world.surface.level] } : {}),
    rules: { ...world.rules }, players,
    unitStats: Object.fromEntries(['explorer', 'interceptor', 'frigate', 'bomber'].map((kind) => [kind, statsFor(world, playerId, kind as UnitKind)])) as Record<UnitKind, ShipStats>,
    squads: world.squads.filter((unit) => unit.ownerId === playerId || (unit.hp > 0 && visible(unit))).map((unit) => {
      const { target, attackTargetId } = unit;
      const publicUnit = {
        id: unit.id, ownerId: unit.ownerId, kind: unit.kind,
        x: unit.x, y: unit.y, hp: unit.hp, maxHp: unit.maxHp, damage: statsFor(world, unit.ownerId, unit.kind).damage,
        stats: statsFor(world, unit.ownerId, unit.kind), moveTicks: moveInterval(world, unit.ownerId, unit.kind),
      };
      return unit.ownerId === playerId
        ? {
          ...publicUnit, target: target ? { ...target } : null, attackTargetId, stance: unit.stance,
          anchor: unit.anchor ? { ...unit.anchor } : null, route: unit.route.map((cell) => ({ ...cell })),
        }
        : publicUnit;
    }),
    guardians: world.guardians.filter(visible).map((unit) => ({
      id: unit.id, objectiveId: unit.objectiveId, x: unit.x, y: unit.y,
      hp: unit.hp, maxHp: unit.maxHp, damage: unit.damage,
    })),
    nodes: world.nodes.filter(visible).map((node) => ({
      id: node.id, kind: node.kind, guardianId: node.guardianId, x: node.x, y: node.y,
      ownerId: node.ownerId, progress: { p1: node.progress.p1, p2: node.progress.p2 },
    })),
    // The central objective timer and capture score are public rules.
    core: {
      id: world.core.id, guardianId: world.core.guardianId, x: world.core.x, y: world.core.y,
      open: world.core.open, progress: { p1: world.core.progress.p1, p2: world.core.progress.p2 },
    },
    visibleCells, winner: world.winner,
  };
}

export { battlefieldViewFor, encodeBattlefieldMask, decodeBattlefieldMask } from './battlefield.js';
export type {
  BattlefieldView, BattlefieldMask, BattlefieldPublicPlayer, BattlefieldPublicSquad, BattlefieldOwnSquad,
} from './battlefield.js';
export type { CampaignPhase, CampaignPhaseView, CampaignSectorResult, CampaignResult } from './campaign.js';
