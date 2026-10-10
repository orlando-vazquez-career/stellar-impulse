import type { CoreState, SquadOwner, SquadType } from '../model';
import { objectCell, type DrawableMapObject, type NexusStyle } from '../../map/map-objects';
import { captureEllipse } from './capture-geometry';

export const GAME_FACTIONS = ['blue', 'red', 'neutral'] as const;
export type GameFaction = typeof GAME_FACTIONS[number];

/** Full playable ship roster. The AX-7 art is the in-game interceptor. */
export const GAME_SHIP_TYPES: readonly SquadType[] = ['interceptor', 'explorer', 'frigate', 'bomber'];
const SHIP_ART_ID: Record<SquadType, string> = {
  interceptor: 'ax7',
  explorer: 'explorer',
  frigate: 'frigate',
  bomber: 'bomber',
};

/** Ship hull sizes in battlefield world pixels; intentionally compact for 64px map tiles. */
export const SHIP_DISPLAY_SIZE: Record<SquadType, number> = {
  interceptor: 40,
  explorer: 40,
  frigate: 44,
  bomber: 40,
};

/** Top-view footprint sizes in world pixels; larger than one tile, without using Tiled's 256px placeholders. */
export const STRUCTURE_DISPLAY_SIZE = { commandBase: 96, nexusCore: 88 } as const;
/** The neutral turret: a base plate and, over it, the gun head that turns toward its target. */
export const TURRET_DISPLAY_SIZE = { base: 64, head: 42 } as const;
export type IntegratedStructure = 'command-base' | 'nexus-core' | 'turret-base' | 'turret-head';

/**
 * Draw order of the battlefield scene: terrain layers, floor emblems, flat platforms, capture rings, then ships
 * and map structures sorted by screen y, then routes, the Core's progress and the selection box.
 */
export const SCENE_DEPTH = {
  sky: 1, layer: 10000, emblems: 89000, platforms: 89500, nodes: 90000, units: 100000, route: 200000, core: 200001, selection: 300000,
} as const;

/**
 * Depth of the flat platforms (the command bases and the top-down nexus disc). Above the floor emblems and below
 * every ship, so a ship flying over a base is never hidden by it; `nodes + 1` is the attack range layer.
 */
export function platformDepth(): number {
  return SCENE_DEPTH.platforms;
}

export interface RuntimeGameAsset {
  key: string;
  src: string;
  kind: 'ship' | 'structure';
  faction: GameFaction;
  displaySize: number;
  shipType?: SquadType;
  structure?: IntegratedStructure;
}

export const GAME_ASSET_MANIFEST: RuntimeGameAsset[] = [
  ...GAME_SHIP_TYPES.flatMap((shipType) => GAME_FACTIONS.map((faction) => {
    const artId = SHIP_ART_ID[shipType];
    return {
      kind: 'ship' as const,
      shipType,
      faction,
      key: shipTextureKey(faction, shipType),
      src: `/assets/game/ships/${artId}-${faction}.png`,
      displaySize: SHIP_DISPLAY_SIZE[shipType],
    };
  })),
  ...(['command-base', 'nexus-core'] as const).flatMap((structure) => GAME_FACTIONS.map((faction) => ({
    kind: 'structure' as const,
    structure,
    faction,
    key: structureTextureKey(structure, faction),
    src: `/assets/game/structures/${structure}-top-${faction}.png`,
    displaySize: structure === 'command-base' ? STRUCTURE_DISPLAY_SIZE.commandBase : STRUCTURE_DISPLAY_SIZE.nexusCore,
  }))),
  // Turrets are only ever neutral guardians.
  ...(['turret-base', 'turret-head'] as const).map((structure) => ({
    kind: 'structure' as const,
    structure,
    faction: 'neutral' as const,
    key: structureTextureKey(structure, 'neutral'),
    src: `/assets/game/structures/${structure}-neutral.png`,
    displaySize: structure === 'turret-base' ? TURRET_DISPLAY_SIZE.base : TURRET_DISPLAY_SIZE.head,
  })),
];

export function shipTextureKey(owner: SquadOwner, shipType: SquadType): string {
  return `ship-${SHIP_ART_ID[shipType]}-${owner}`;
}

/** The player's own hull of a ship class, for HUD icons such as the hangar queue. */
export function shipIconSrc(shipType: SquadType): string {
  return `/assets/game/ships/${SHIP_ART_ID[shipType]}-blue.png`;
}

export function structureTextureKey(structure: IntegratedStructure, faction: GameFaction): string {
  return `structure-${structure}-${faction}`;
}

export function coreFactionForState(state: CoreState): GameFaction {
  if (state === 'blue-capturing' || state === 'blue-controlled') return 'blue';
  if (state === 'red-capturing' || state === 'red-controlled') return 'red';
  return 'neutral';
}

export function factionForOwner(owner: SquadOwner): GameFaction {
  return owner;
}

/**
 * Cell, in scene coordinates, where the art of an `OBSTACLE_RING` point (or any Tiled tile object) stands. Tiled
 * points are measured from the cell corners and the scene's cells from their centres, so the point is half a cell
 * back on both axes.
 */
export function obstacleAnchor(point: { x: number; y: number }): { x: number; y: number } {
  return { x: point.x - 0.5, y: point.y - 0.5 };
}

/** Display size of an obstacle's art: its own proportions, never wider than the ground ellipse of the cells it closes. */
export function obstacleDisplaySize(texture: { width: number; height: number }, radius: number): { width: number; height: number } {
  if (texture.width <= 0 || texture.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, captureEllipse(radius).width / texture.width);
  return { width: texture.width * scale, height: texture.height * scale };
}

/** How far from the Core cell (in cells) a map pillar still counts as the nexus. */
const PILLAR_REACH = 3;

/**
 * Whether the scene draws the top-down nexus disc. The disc style always does. The pillar style leaves the nexus to
 * the map's pillar and shield, but a map with no pillar at the Core (Sector 01, the offline sandbox, only marks the
 * Core cell) gets the disc instead, so the Core never stands with no art at all.
 */
export function drawsCoreDisc(style: NexusStyle, drawn: readonly DrawableMapObject[], core: { x: number; y: number }): boolean {
  if (style === 'disc') return true;
  return !drawn.some((entry) => {
    const image = entry.tileset.tiles?.find((tile) => tile.id === entry.tile)?.image?.split('/').pop()?.replace(/\.png$/i, '');
    if (entry.object.name !== 'pilar' && image !== 'pilar') return false;
    const cell = obstacleAnchor(objectCell(entry.object));
    return Math.max(Math.abs(cell.x - core.x), Math.abs(cell.y - core.y)) <= PILLAR_REACH;
  });
}
