import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markersOfKind, terrainAt, type MapMarker } from '../src/game-map';
import { assignMoveTargets } from '../src/click-targets';
import { advanceUnits, createMovingUnit, DEFAULT_MOVEMENT_RULES, orderMove } from '../src/movement';
import { TileOccupancy } from '../src/occupancy';
import { findPath } from '../src/pathfinding';
import type { TileCoord } from '../src/grid';
import { loadTiledMap, type TiledMapJson } from '../src/tiled-loader';

const exported = JSON.parse(readFileSync(new URL('../../trascendencia-estelar.json', import.meta.url), 'utf8')) as TiledMapJson;
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
const OWNERS = [1, 2, 3, 4];
const map = loadTiledMap(json, TICKS_PER_SECOND);

function spawnOf(owner: number): MapMarker {
  const spawn = markersOfKind(map, 'spawn').find((marker) => marker.properties.owner === owner);
  if (!spawn) throw new Error(`Falta el spawn ${owner}`);
  return spawn;
}

const steps = (from: TileCoord, to: TileCoord) => (findPath(map, { from, to, weight: 'medium', tick: 0 }) ?? []).length;
const core = markersOfKind(map, 'pilar')[0]!.tile;
const besideCore = { x: core.x + 4, y: core.y };

describe('mapa Trascendencia Estelar', () => {
  it('mide 163×163 y trae cuatro bases en dos equipos', () => {
    expect([map.width, map.height]).toEqual([163, 163]);
    expect(OWNERS.map((owner) => spawnOf(owner).properties.equipo)).toEqual([1, 2, 1, 2]);
  });

  it('tiene seis pronexos, veinte recursos y ningún agujero de gusano', () => {
    expect(markersOfKind(map, 'pronexo')).toHaveLength(6);
    expect(markersOfKind(map, 'recurso')).toHaveLength(20);
    expect(map.wormholes).toHaveLength(0);
  });

  it('es justo para las cuatro flotas: ninguna base tiene un camino mucho más corto', () => {
    const pronexos = markersOfKind(map, 'pronexo').map((marker) => marker.tile);
    const resources = markersOfKind(map, 'recurso').map((marker) => marker.tile);
    const nearest = (from: TileCoord, targets: TileCoord[], count: number) =>
      targets.map((to) => steps(from, to)).sort((a, b) => a - b).slice(0, count).reduce((sum, length) => sum + length, 0);
    const scores = OWNERS.map((owner) => {
      const from = spawnOf(owner).tile;
      return { center: steps(from, besideCore), pronexos: nearest(from, pronexos, 3), resources: nearest(from, resources, 5) };
    });
    for (const field of ['center', 'pronexos', 'resources'] as const) {
      const values = scores.map((score) => score[field]);
      expect(Math.min(...values)).toBeGreaterThan(0);
      expect((Math.max(...values) - Math.min(...values)) / Math.max(...values)).toBeLessThan(0.1);
    }
  });

  it('una nave mediana llega desde cada base a las otras, a los pronexos y a los recursos', () => {
    const targets = [...markersOfKind(map, 'spawn'), ...markersOfKind(map, 'pronexo'), ...markersOfKind(map, 'recurso')].map((marker) => marker.tile);
    for (const owner of OWNERS) {
      const from = spawnOf(owner).tile;
      for (const to of targets) {
        if (to.x === from.x && to.y === from.y) continue;
        expect(findPath(map, { from, to, weight: 'medium', tick: 0 })).toBeDefined();
      }
    }
  });

  it('con las barreras en pie, toda ruta entre dos bases cruza la isla central', () => {
    for (const [from, to] of [[1, 2], [1, 3], [1, 4], [3, 4]] as const) {
      const path = findPath(map, { from: spawnOf(from).tile, to: spawnOf(to).tile, weight: 'medium', tick: 0 }) ?? [];
      expect(path.length).toBeGreaterThan(100);
      expect(path.some((tile) => Math.hypot(tile.x - core.x, tile.y - core.y) <= 21)).toBe(true);
    }
  });

  it('tiene dieciséis barreras destruibles que cierran el camino de ronda', () => {
    const barriers = markersOfKind(map, 'barrera_destruible');
    expect(barriers).toHaveLength(16);
    expect(barriers.map((marker) => marker.properties.material).sort()).toEqual([...Array(8).fill('chatarra'), ...Array(8).fill('hielo')]);
    for (const barrier of barriers) {
      expect(barrier.properties.hp).toBeGreaterThan(0);
      const cells = String(barrier.properties.celdas).split(';').map((pair) => pair.split(',').map(Number));
      expect(cells.length).toBeGreaterThanOrEqual(4);
      for (const [x, y] of cells) expect(terrainAt(map, { x: x!, y: y! }, 0)).toBe('blocked');
    }
  });

  it('al romper las barreras se abre un atajo de la base a la isla de pronexo vecina', () => {
    const from = spawnOf(1).tile;
    const neighbour = markersOfKind(map, 'pronexo').map((marker) => marker.tile)
      .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0]!;
    const closed = steps(from, neighbour);
    const opened = loadTiledMap({
      ...json,
      layers: json.layers.map((layer) => {
        if (layer.name !== 'logica' || !layer.data) return layer;
        const data = [...layer.data];
        for (const barrier of markersOfKind(map, 'barrera_destruible')) {
          for (const pair of String(barrier.properties.celdas).split(';')) {
            const [x, y] = pair.split(',').map(Number);
            data[y! * map.width + x!] = 1;
          }
        }
        return { ...layer, data };
      }),
    }, TICKS_PER_SECOND);
    const shortcut = (findPath(opened, { from, to: neighbour, weight: 'medium', tick: 0 }) ?? []).length;
    expect(shortcut).toBeGreaterThan(0);
    expect(shortcut).toBeLessThan(closed * 0.6);
  });

  it('un grupo de 12 naves llega al centro sin trabarse', () => {
    const occupancy = new TileOccupancy(map);
    const context = { map, occupancy, tick: 0, rules: DEFAULT_MOVEMENT_RULES };
    const squad = [...Array(12).keys()].map((id) => ({ id, tile: spawnOf(1).tile, weight: 'medium' as const }));
    const starts = assignMoveTargets({ map, tick: 0 }, spawnOf(1).tile, squad);
    const ships = squad.map((ship) => createMovingUnit(ship.id, 'medium', 500, starts.get(ship.id) ?? ship.tile));
    ships.forEach((ship) => occupancy.moveTo(ship.id, ship.tile));
    const goals = assignMoveTargets({ map, tick: 0, occupancy }, besideCore, ships);
    ships.forEach((ship) => orderMove(context, ship, goals.get(ship.id) ?? ship.tile));
    for (let tick = 1; tick <= 1500; tick++) advanceUnits(map, ships, occupancy, tick);
    const arrived = ships.filter((ship) => !ship.goal).length;
    expect(arrived).toBeGreaterThanOrEqual(10);
  }, 60_000);
});
