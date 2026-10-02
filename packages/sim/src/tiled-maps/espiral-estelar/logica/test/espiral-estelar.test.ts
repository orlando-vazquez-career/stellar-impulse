import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markersOfKind, terrainAt, type MapMarker } from '../src/game-map';
import { findPath } from '../src/pathfinding';
import { loadTiledMap, type TiledMapJson } from '../src/tiled-loader';

const json = JSON.parse(readFileSync(new URL('../../espiral-estelar.json', import.meta.url), 'utf8')) as TiledMapJson;
const map = loadTiledMap(json, 20);
const LAST = map.width - 1;

function spawnOf(owner: number): MapMarker {
  const spawn = markersOfKind(map, 'spawn').find((marker) => marker.properties.owner === owner);
  if (!spawn) throw new Error(`Falta el spawn ${owner}`);
  return spawn;
}

describe('mapa Espiral Estelar', () => {
  it('es simétrico para que el 1v1 sea justo', () => {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        expect(terrainAt(map, { x, y }, 0)).toBe(terrainAt(map, { x: LAST - x, y: LAST - y }, 0));
      }
    }
  });

  it('una nave mediana llega de base a base y a los cuatro pronexos', () => {
    const from = spawnOf(1).tile;
    const targets = [spawnOf(2), ...markersOfKind(map, 'pronexo')].map((marker) => marker.tile);
    for (const to of targets) {
      expect(findPath(map, { from, to, weight: 'medium', tick: 0 })).toBeDefined();
    }
  });

  it('tiene dos pares de agujeros de gusano y cuatro pronexos', () => {
    expect(map.wormholes.map((network) => network.endpoints.length)).toEqual([2, 2]);
    expect(markersOfKind(map, 'pronexo')).toHaveLength(4);
  });
});
