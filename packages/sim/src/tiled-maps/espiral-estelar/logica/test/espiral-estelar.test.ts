import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markersOfKind, terrainAt, type MapMarker } from '../src/game-map';
import { assignMoveTargets } from '../src/click-targets';
import { advanceUnits, createMovingUnit, DEFAULT_MOVEMENT_RULES, orderMove } from '../src/movement';
import { TileOccupancy } from '../src/occupancy';
import { findPath } from '../src/pathfinding';
import type { TileCoord } from '../src/grid';
import { loadTiledMap, type TiledMapJson } from '../src/tiled-loader';

const exported = JSON.parse(readFileSync(new URL('../../espiral-estelar.json', import.meta.url), 'utf8')) as TiledMapJson;
/** Tiled may export the tilesets as `.tsx` references: read their tile properties as "Embed tilesets" would. */
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
const TICKS_PER_SECOND = 20;
const map = loadTiledMap(json, TICKS_PER_SECOND);

function spawnOf(owner: number): MapMarker {
  const spawn = markersOfKind(map, 'spawn').find((marker) => marker.properties.owner === owner);
  if (!spawn) throw new Error(`Falta el spawn ${owner}`);
  return spawn;
}

describe('mapa Espiral Estelar', () => {
  it('es justo para el 1v1: ninguna base tiene un camino mucho más corto', () => {
    // The map is hand-edited in Tiled and is no longer a cell-by-cell mirror; what matters is
    // that neither spawn reaches the centre or the contested objectives much faster.
    const steps = (from: TileCoord, to: TileCoord) => (findPath(map, { from, to, weight: 'medium', tick: 0 }) ?? []).length;
    const center = { x: Math.floor(map.width / 2) + 4, y: Math.floor(map.height / 2) };
    const pronexos = markersOfKind(map, 'pronexo').map((marker) => marker.tile);
    const [first, second] = [spawnOf(1).tile, spawnOf(2).tile].map((from) => ({
      center: steps(from, center),
      objectives: pronexos.map((to) => steps(from, to)).sort((a, b) => a - b).slice(0, 2).reduce((sum, length) => sum + length, 0),
    }));
    const gap = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b);
    expect(gap(first!.center, second!.center)).toBeLessThan(0.15);
    expect(gap(first!.objectives, second!.objectives)).toBeLessThan(0.15);
  });

  it('una nave mediana llega de base a base y a los cuatro pronexos', () => {
    const from = spawnOf(1).tile;
    const targets = [spawnOf(2), ...markersOfKind(map, 'pronexo')].map((marker) => marker.tile);
    for (const to of targets) {
      expect(findPath(map, { from, to, weight: 'medium', tick: 0 })).toBeDefined();
    }
  });

  it('el viaje entre bases, con portales y pasos cerrados, no es ni demasiado corto ni demasiado largo', () => {
    const everythingClosedTick = 35 * TICKS_PER_SECOND;
    const request = { from: spawnOf(1).tile, to: spawnOf(2).tile, weight: 'medium' as const, tick: everythingClosedTick };
    const path = findPath(map, request) ?? [];
    expect(path.length).toBeGreaterThan(50);
    expect(path.length).toBeLessThan(200);
  });

  it('un grupo de 12 naves llega al centro sin trabarse', () => {
    const occupancy = new TileOccupancy(map);
    const context = { map, occupancy, tick: 0, rules: DEFAULT_MOVEMENT_RULES };
    const squad = [...Array(12).keys()].map((id) => ({ id, tile: spawnOf(1).tile, weight: 'medium' as const }));
    const starts = assignMoveTargets({ map, tick: 0 }, spawnOf(1).tile, squad);
    const ships = squad.map((ship) => createMovingUnit(ship.id, 'medium', 500, starts.get(ship.id) ?? ship.tile));
    ships.forEach((ship) => occupancy.moveTo(ship.id, ship.tile));
    const center = { x: Math.floor(map.width / 2) + 4, y: Math.floor(map.height / 2) };
    const goals = assignMoveTargets({ map, tick: 0, occupancy }, center, ships);
    ships.forEach((ship) => orderMove(context, ship, goals.get(ship.id) ?? ship.tile));
    for (let tick = 1; tick <= 600; tick++) advanceUnits(map, ships, occupancy, tick);
    const arrived = ships.filter((ship) => !ship.goal).length;
    expect(arrived).toBeGreaterThanOrEqual(10);
  }, 60_000);

  it('tiene dos pares de agujeros de gusano y cuatro pronexos', () => {
    expect(map.wormholes.map((network) => network.endpoints.length)).toEqual([2, 2]);
    expect(markersOfKind(map, 'pronexo')).toHaveLength(4);
  });
});
