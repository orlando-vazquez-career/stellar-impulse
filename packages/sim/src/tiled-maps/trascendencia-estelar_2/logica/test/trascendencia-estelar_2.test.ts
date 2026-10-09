import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markersOfKind, terrainAt, type MapMarker } from '../src/game-map';
import { findPath } from '../src/pathfinding';
import type { TileCoord } from '../src/grid';
import { loadTiledMap, type TiledMapJson } from '../src/tiled-loader';

const exported = JSON.parse(readFileSync(new URL('../../trascendencia-estelar_2.json', import.meta.url), 'utf8')) as TiledMapJson;
/** Tiled exports the tilesets as `.tsx` references: read their tile properties as "Embed tilesets" would. */
const json: TiledMapJson = {
  ...exported,
  tilesets: exported.tilesets.map((tileset) => {
    if (!tileset.source) return tileset;
    const xml = readFileSync(new URL(`../../${tileset.source}`, import.meta.url), 'utf8');
    return {
      firstgid: tileset.firstgid,
      tiles: [...xml.matchAll(/<tile[^>]*id="(\d+)"[^>]*>([\s\S]*?)<\/tile>/g)].map((tile) => ({
        id: Number(tile[1]),
        properties: [...tile[2]!.matchAll(/<property[^>]*name="([^"]*)"[^>]*value="([^"]*)"/g)]
          .map((property) => ({ name: property[1]!, type: 'string', value: property[2]! })),
      })),
    };
  }),
};
const map = loadTiledMap(json, 20);

function spawnOf(owner: number): MapMarker {
  const spawn = markersOfKind(map, 'spawn').find((marker) => marker.properties.owner === owner);
  if (!spawn) throw new Error(`Falta el spawn ${owner}`);
  return spawn;
}
const steps = (from: TileCoord, to: TileCoord) => (findPath(map, { from, to, weight: 'medium', tick: 0 }) ?? []).length;
const core = markersOfKind(map, 'pilar')[0]!.tile;
const besideCore = { x: core.x + 4, y: core.y };

describe('mapa Trascendencia Estelar para dos flotas', () => {
  it('mide 115×115 y trae dos bases y dos estaciones neutrales', () => {
    expect([map.width, map.height]).toEqual([115, 115]);
    expect(markersOfKind(map, 'spawn').map((marker) => marker.properties.owner).sort()).toEqual([1, 2]);
    const stations = markersOfKind(map, 'estacion');
    expect(stations).toHaveLength(2);
    expect(stations.map((marker) => marker.properties.factorPrecio)).toEqual([3, 3]);
  });

  it('tiene cuatro pronexos, diez recursos y ocho barreras que cierran el camino de ronda', () => {
    expect(markersOfKind(map, 'pronexo')).toHaveLength(4);
    expect(markersOfKind(map, 'recurso')).toHaveLength(10);
    const barriers = markersOfKind(map, 'barrera_destruible');
    expect(barriers.map((marker) => marker.properties.material).sort()).toEqual([...Array(4).fill('chatarra'), ...Array(4).fill('hielo')]);
    for (const barrier of barriers) {
      const cells = String(barrier.properties.celdas).split(';').map((pair) => pair.split(',').map(Number));
      for (const [x, y] of cells) expect(terrainAt(map, { x: x!, y: y! }, 0)).toBe('blocked');
    }
  });

  it('es justo: las dos bases quedan a la misma distancia del centro, de las estaciones y de sus recursos', () => {
    const targets = (kind: string) => markersOfKind(map, kind).map((marker) => marker.tile);
    const score = (owner: number) => {
      const from = spawnOf(owner).tile;
      const sum = (list: TileCoord[]) => list.map((to) => steps(from, to)).sort((a, b) => a - b).reduce((total, length) => total + length, 0);
      // Each base is measured against its own side of the core.
      const beside = owner === 1 ? besideCore : { x: core.x - 4, y: core.y };
      return [steps(from, beside), sum(targets('estacion')), sum(targets('pronexo')), sum(targets('recurso'))];
    };
    const [blue, red] = [score(1), score(2)];
    blue.forEach((value, index) => {
      expect(value).toBeGreaterThan(0);
      expect(Math.abs(value - red[index]!) / value).toBeLessThan(0.05);
    });
  });

  it('con las barreras en pie, la ruta entre las bases cruza la isla central', () => {
    const path = findPath(map, { from: spawnOf(1).tile, to: spawnOf(2).tile, weight: 'medium', tick: 0 }) ?? [];
    expect(path.length).toBeGreaterThan(70);
    expect(path.some((tile) => Math.hypot(tile.x - core.x, tile.y - core.y) <= 8)).toBe(true);
  });
});
