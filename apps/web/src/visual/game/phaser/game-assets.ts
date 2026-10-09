import type { CoreState, SquadOwner, SquadType } from '../model';

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
export type IntegratedStructure = 'command-base' | 'nexus-core';

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
];

export function shipTextureKey(owner: SquadOwner, shipType: SquadType): string {
  return `ship-${SHIP_ART_ID[shipType]}-${owner}`;
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
