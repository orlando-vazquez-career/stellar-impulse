import { beforeEach, describe, expect, it } from 'vitest';
import { PRACTICE_MAPS } from '@impulso/input';
import { createSectorWorld } from '@impulso/sim';
import { sectorMap, sectorSurface, cellAtPixel, cellToPixel, routeAcrossSector, planSectorMove, selectMap } from './sector-map';

describe('Visual Sector 01 Tiled map', () => {
  beforeEach(() => {
    selectMap('sector-01');
  });

  it('reads the editable isometric TMJ and its gameplay walkability from the same source', () => {
    expect(sectorMap.orientation).toBe('isometric');
    expect(sectorMap.width).toBe(29);
    expect(sectorMap.height).toBe(29);
    expect(sectorMap.layers.map((layer) => layer.name)).toContain('obstaculos');
    expect(sectorSurface.bases.p1).not.toEqual(sectorSurface.bases.p2);
    expect(sectorSurface.walkable[sectorSurface.core.y * 29 + sectorSurface.core.x]).toBe(true);
    expect(sectorSurface.walkable.some((walkable) => !walkable)).toBe(true);
  });

  it('projects and picks a valid Tiled cell', () => {
    const point = cellToPixel(sectorSurface.bases.p1);
    expect(cellAtPixel(point.x, point.y)).toEqual(sectorSurface.bases.p1);
    expect(cellAtPixel(-200, -200)).toBeNull();
  });

  it('matches the server training surface and objective coordinates', () => {
    const world = createSectorWorld();
    if (!world.surface) throw new Error('Sector 01 must include a surface');
    expect(world.surface.walkable).toEqual(sectorSurface.walkable);
    expect(world.surface.level).toEqual(sectorSurface.level);
    expect(world.surface.ramp).toEqual(sectorSurface.ramp);
    expect(world.players.p1.base).toEqual(sectorSurface.bases.p1);
    expect(world.players.p2.base).toEqual(sectorSurface.bases.p2);
    expect({ x: world.core.x, y: world.core.y }).toEqual(sectorSurface.core);
  });

  it('plans a route using the same terrain and ramp rules as the simulation', () => {
    const path = routeAcrossSector(sectorSurface.bases.p1, sectorSurface.core);
    expect(path[0]).toEqual(sectorSurface.bases.p1);
    expect(path.at(-1)).toEqual(sectorSurface.core);
    expect(path.slice(1).every((cell) => sectorSurface.walkable[cell.y * sectorSurface.width + cell.x])).toBe(true);
    expect(routeAcrossSector(sectorSurface.bases.p1, { x: -1, y: -1 })).toEqual([]);
    const blocked = sectorSurface.walkable.findIndex((walkable) => !walkable);
    expect(routeAcrossSector(sectorSurface.bases.p1,
      { x: blocked % sectorSurface.width, y: Math.floor(blocked / sectorSurface.width) })).toEqual([]);
  });
  it('plans continuous movement only through traversable Tiled terrain', () => {
    const start = { x: 3, y: 3 };
    const target = { x: 4.35, y: 3.15 };
    expect(planSectorMove(start, target)).toEqual([start, target]);
    const blocked = sectorSurface.walkable.findIndex((walkable) => !walkable);
    expect(planSectorMove(start, { x: blocked % sectorMap.width, y: Math.floor(blocked / sectorMap.width) })).toEqual([]);
    const path = planSectorMove(start, sectorSurface.core);
    expect(path[0]).toEqual(start);
    expect(path.at(-1)).toEqual(sectorSurface.core);
    expect(path.length).toBeGreaterThan(2);
  });
});

describe('map selection', () => {
  it('switches every live binding to Espiral Estelar and back', async () => {
    const map = await import('./sector-map');
    map.selectMap('espiral');
    expect(map.activeMapId).toBe('espiral');
    expect(map.sectorMap.width).toBe(96);
    expect(map.sectorSurface.width).toBe(96);
    expect(map.ISO_WORLD_WIDTH).toBe(96 * map.TILE_WIDTH);
    expect(map.mapImageUrl('tilesets/img/suelo.png')).toBeTruthy();
    expect(map.mapImageUrl('tilesets/img/base_jugador.png')).toBeTruthy();
    expect(map.mapImageUrl('3831233578.png')).toBeTruthy();
    expect(map.sectorMap.tilesets.some((set) => set.image === 'tilesets/img/logica.png')).toBe(true);
    expect(map.sectorMap.tilesets.some((set) => set.name === 'planetafondo')).toBe(true);
    const point = map.cellToPixel(map.sectorSurface.bases.p1);
    expect(map.cellAtPixel(point.x, point.y)).toEqual(map.sectorSurface.bases.p1);
    map.selectMap('sector-01');
    expect(map.sectorMap.width).toBe(29);
    expect(map.mapImageUrl('stellar-plataformas.png')).toBeTruthy();
  });

  it('loads Caos Estelar from espiral-estelar_2', async () => {
    const map = await import('./sector-map');
    expect(map.playableMapLabel('espiral')).toBe('Espiral Estelar');
    expect(map.playableMapLabel('espiral-2')).toBe('Caos Estelar');
    map.selectMap('espiral-2');
    expect(map.activeMapId).toBe('espiral-2');
    expect(map.sectorMap.width).toBe(96);
    expect(map.sectorSurface.width).toBe(96);
    expect(map.activeMapSourceFile()).toBe('espiral-estelar_2.json');
    map.selectMap('sector-01');
    expect(map.sectorMap.width).toBe(29);
  });

  it('labels a map in the player language, Spanish unless told otherwise', async () => {
    const map = await import('./sector-map');
    const trascendencia = PRACTICE_MAPS.find((option) => option.id === 'trascendencia')!;
    expect(map.playableMapLabel('trascendencia', 'en')).toBe(trascendencia.name.en);
    expect(map.playableMapLabel('trascendencia', 'es')).toBe(trascendencia.name.es);
    expect(map.playableMapLabel('espiral-2', 'en')).toBe('Stellar Chaos');
  });
});
