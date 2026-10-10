import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OBSTACLE_MODELS, type TrainingMapId } from '@impulso/sim';
import {
  GAME_ASSET_MANIFEST,
  GAME_FACTIONS,
  GAME_SHIP_TYPES,
  SCENE_DEPTH,
  SHIP_DISPLAY_SIZE,
  STRUCTURE_DISPLAY_SIZE,
  TURRET_DISPLAY_SIZE,
  coreFactionForState,
  obstacleAnchor,
  obstacleDisplaySize,
  platformDepth,
  shipIconSrc,
  shipTextureKey,
  structureTextureKey,
} from './game-assets';
import { captureEllipse } from './capture-geometry';
import { cellToIso, projectedWorldBounds, TILE_HALF_HEIGHT } from './isometric';
import { selectMap } from '../../map/sector-map';

describe('runtime game art manifest', () => {
  it('covers the four playable ship classes and only the approved structures', () => {
    expect(GAME_SHIP_TYPES).toEqual(['interceptor', 'explorer', 'frigate', 'bomber']);
    expect(GAME_ASSET_MANIFEST.filter((asset) => asset.kind === 'ship')).toHaveLength(12);
    expect(GAME_ASSET_MANIFEST.filter((asset) => asset.kind === 'structure')).toHaveLength(8);
    expect(GAME_ASSET_MANIFEST.some((asset) => asset.src.includes('refinery'))).toBe(false);
    expect(GAME_ASSET_MANIFEST.filter((asset) => asset.kind === 'structure').map((asset) => asset.src)).toEqual([
      ...['command-base', 'nexus-core'].flatMap((structure) => GAME_FACTIONS.map((faction) =>
        `/assets/game/structures/${structure}-top-${faction}.png`)),
      '/assets/game/structures/turret-base-neutral.png',
      '/assets/game/structures/turret-head-neutral.png',
    ]);
    expect(shipTextureKey('blue', 'interceptor')).toBe('ship-ax7-blue');
    expect(structureTextureKey('nexus-core', 'red')).toBe('structure-nexus-core-red');
  });

  it('adds the neutral turret as a base plate and a head, sized apart from the other structures', () => {
    expect(structureTextureKey('turret-head', 'neutral')).toBe('structure-turret-head-neutral');
    expect(structureTextureKey('turret-base', 'neutral')).toBe('structure-turret-base-neutral');
    expect(TURRET_DISPLAY_SIZE).toEqual({ base: 64, head: 42 });
    const turret = GAME_ASSET_MANIFEST.filter((asset) => asset.structure === 'turret-base' || asset.structure === 'turret-head');
    expect(turret.map(({ key, faction, displaySize }) => ({ key, faction, displaySize }))).toEqual([
      { key: 'structure-turret-base-neutral', faction: 'neutral', displaySize: 64 },
      { key: 'structure-turret-head-neutral', faction: 'neutral', displaySize: 42 },
    ]);
  });

  it('points every ship class at its blue hull for the hangar queue icons', () => {
    expect(GAME_SHIP_TYPES.map(shipIconSrc)).toEqual([
      '/assets/game/ships/ax7-blue.png',
      '/assets/game/ships/explorer-blue.png',
      '/assets/game/ships/frigate-blue.png',
      '/assets/game/ships/bomber-blue.png',
    ]);
    for (const kind of GAME_SHIP_TYPES) {
      expect(existsSync(join(process.cwd(), 'apps/web/public', shipIconSrc(kind).slice(1)))).toBe(true);
    }
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
    expect(GAME_ASSET_MANIFEST).toHaveLength(20);
    for (const asset of GAME_ASSET_MANIFEST) {
      expect(GAME_FACTIONS).toContain(asset.faction);
      expect(existsSync(join(process.cwd(), 'apps/web/public', asset.src.slice(1)))).toBe(true);
    }
  });
});

describe('flat platforms', () => {
  it('draw under every ship on every map and never share the attack range layer', () => {
    for (const map of ['sector-01', 'espiral', 'espiral-2', 'trascendencia'] as TrainingMapId[]) {
      selectMap(map);
      // A ship sorts at DEPTH.units plus its screen y, and no cell of the map projects above the top of the world box.
      expect(platformDepth()).toBeLessThan(SCENE_DEPTH.units + Math.floor(projectedWorldBounds().y));
    }
    expect(platformDepth()).not.toBe(SCENE_DEPTH.nodes + 1);
    expect(platformDepth()).toBeGreaterThan(SCENE_DEPTH.emblems);
    expect(platformDepth()).toBeLessThan(SCENE_DEPTH.nodes);
  });
});

describe('OBSTACLE_RING art', () => {
  it('anchors on the cell the Tiled point marks: Tiled points sit on cell corners, scene cells on their centres', () => {
    expect(obstacleAnchor({ x: 12, y: 30 })).toEqual({ x: 11.5, y: 29.5 });
    expect(obstacleAnchor({ x: 7.25, y: 4.75 })).toEqual({ x: 6.75, y: 4.25 });
    selectMap('espiral');
    // Without the view yaw both anchors would agree; with it, the old one drifted half a tile sideways.
    const anchor = obstacleAnchor({ x: 40, y: 40 });
    const drawn = cellToIso(anchor.x, anchor.y);
    const legacy = cellToIso(40, 40);
    expect(Math.abs(drawn.x - legacy.x)).toBeGreaterThan(8);
    expect(Math.abs(drawn.y - (legacy.y - TILE_HALF_HEIGHT))).toBeLessThan(4);
  });

  it('keeps the art proportions and never draws it wider than the ground the obstacle closes', () => {
    for (const radius of Object.values(OBSTACLE_MODELS)) {
      const widest = captureEllipse(radius).width;
      const big = obstacleDisplaySize({ width: 512, height: 256 }, radius);
      expect(big.width).toBeCloseTo(widest);
      expect(big.height).toBeCloseTo(widest / 2);
    }
    expect(obstacleDisplaySize({ width: 60, height: 90 }, 2)).toEqual({ width: 60, height: 90 });
    expect(obstacleDisplaySize({ width: 0, height: 0 }, 1)).toEqual({ width: 0, height: 0 });
  });
});
