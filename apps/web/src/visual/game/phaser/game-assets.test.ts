import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GAME_ASSET_MANIFEST,
  GAME_FACTIONS,
  GAME_SHIP_TYPES,
  SHIP_DISPLAY_SIZE,
  STRUCTURE_DISPLAY_SIZE,
  coreFactionForState,
  shipTextureKey,
  structureTextureKey,
} from './game-assets';

describe('runtime game art manifest', () => {
  it('covers the four playable ship classes and only the approved structures', () => {
    expect(GAME_SHIP_TYPES).toEqual(['interceptor', 'explorer', 'frigate', 'bomber']);
    expect(GAME_ASSET_MANIFEST.filter((asset) => asset.kind === 'ship')).toHaveLength(12);
    expect(GAME_ASSET_MANIFEST.filter((asset) => asset.kind === 'structure')).toHaveLength(6);
    expect(GAME_ASSET_MANIFEST.some((asset) => asset.src.includes('refinery'))).toBe(false);
    expect(GAME_ASSET_MANIFEST.filter((asset) => asset.kind === 'structure').map((asset) => asset.src)).toEqual(
      ['command-base', 'nexus-core'].flatMap((structure) => GAME_FACTIONS.map((faction) =>
        `/assets/game/structures/${structure}-top-${faction}.png`)),
    );
    expect(shipTextureKey('blue', 'interceptor')).toBe('ship-ax7-blue');
    expect(structureTextureKey('nexus-core', 'red')).toBe('structure-nexus-core-red');
  });

  it('maps objective control states onto blue, red, or neutral nexus art', () => {
    expect(coreFactionForState('locked')).toBe('neutral');
    expect(coreFactionForState('available')).toBe('neutral');
    expect(coreFactionForState('blue-capturing')).toBe('blue');
    expect(coreFactionForState('blue-controlled')).toBe('blue');
    expect(coreFactionForState('red-capturing')).toBe('red');
    expect(coreFactionForState('red-controlled')).toBe('red');
    expect(coreFactionForState('contested')).toBe('neutral');
  });

  it('uses intentional display sizes and verifies every manifest image exists in public assets', () => {
    expect(SHIP_DISPLAY_SIZE).toEqual({ interceptor: 40, explorer: 40, frigate: 44, bomber: 40 });
    expect(STRUCTURE_DISPLAY_SIZE).toEqual({ commandBase: 96, nexusCore: 88 });
    for (const asset of GAME_ASSET_MANIFEST) {
      expect(GAME_FACTIONS).toContain(asset.faction);
      expect(existsSync(join(process.cwd(), 'apps/web/public', asset.src.slice(1)))).toBe(true);
    }
  });
});
