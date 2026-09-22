import { distance, type Guardian, type PlayerId, type Position, type ResourceNode, type Rules, type Squad, type World } from '@impulso/sim';

export interface VisibleSquad extends Omit<Squad, 'target'> {
  /** Rival destinations remain private even while their units are visible. */
  target?: Position | null;
}
export interface PlayerView {
  schemaVersion: 1;
  mode: 'training';
  tick: number;
  playerId: PlayerId;
  width: number;
  height: number;
  rules: Rules;
  players: Record<PlayerId, { id: PlayerId; base: Position; metal?: number }>;
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
  const sources: Position[] = [world.players[playerId].base, ...world.squads.filter((unit) => unit.ownerId === playerId && unit.hp > 0)];
  const visible = (position: Position): boolean => sources.some((source) => distance(source, position) <= world.rules.visionRadius);
  const visibleCells: Position[] = [];
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) if (visible({ x, y })) visibleCells.push({ x, y });
  }
  const players: PlayerView['players'] = {
    p1: { id: 'p1', base: { ...world.players.p1.base } },
    p2: { id: 'p2', base: { ...world.players.p2.base } },
  };
  players[playerId].metal = world.players[playerId].metal;
  return {
    schemaVersion: 1, mode: 'training', tick: world.tick, playerId,
    width: world.width, height: world.height, rules: { ...world.rules }, players,
    squads: world.squads.filter((unit) => unit.ownerId === playerId || (unit.hp > 0 && visible(unit))).map((unit) => {
      const { target } = unit;
      const publicUnit = {
        id: unit.id, ownerId: unit.ownerId, kind: unit.kind,
        x: unit.x, y: unit.y, hp: unit.hp, maxHp: unit.maxHp, damage: unit.damage,
      };
      return unit.ownerId === playerId
        ? { ...publicUnit, target: target ? { ...target } : null }
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
