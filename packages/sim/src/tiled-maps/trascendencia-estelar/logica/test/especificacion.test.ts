import { describe, expect, it } from 'vitest';
import { CritterManager } from '../client/critter-manager';
import { canPass, terrainForZone } from '../src/collision';
import { effectiveVisionRadius, FogOfWar } from '../src/fog-of-war';
import { canEnterTile, terrainAt } from '../src/game-map';
import { loadTiledMap, type TiledMapJson } from '../src/tiled-loader';

describe('colisión filtrada por tipo de nave', () => {
  it('HEAVY_ONLY deja pasar solo a las pesadas y ALL_UNITS_BLOCKED a nadie', () => {
    expect(canPass('HEAVY_ONLY', 'HEAVY')).toBe(true);
    expect(canPass('HEAVY_ONLY', 'MEDIUM')).toBe(false);
    expect(canPass('HEAVY_ONLY', 'LIGHT')).toBe(false);
    expect(canPass('ALL_UNITS_BLOCKED', 'HEAVY')).toBe(false);
    expect(canPass('NONE', 'LIGHT')).toBe(true);
  });

  it('traduce cada objeto de la especificación a un terreno', () => {
    expect(terrainForZone({ collision_type: 'HEAVY_ONLY', blocks_vision: false })).toBe('ice');
    expect(terrainForZone({ collision_type: 'ALL_UNITS_BLOCKED', blocks_vision: true })).toBe('blocked');
    expect(terrainForZone({ collision_type: 'NONE', vision_modifier: 'REDUCE_TO_1_TILE' })).toBe('ion_storm');
  });
});

type TiledObjects = NonNullable<TiledMapJson['layers'][number]['objects']>;

function mapWith(objects: TiledObjects): TiledMapJson {
  return {
    width: 12, height: 12, tileheight: 32,
    tilesets: [{ firstgid: 1, tiles: [{ id: 0, properties: [{ name: 'terrain', value: 'empty' }] }] }],
    layers: [{ name: 'logica', data: Array(144).fill(1) }, { name: 'objetos', objects: [] }, { name: 'Objects_Interactive', objects }],
  };
}

describe('objetos de Objects_Interactive', () => {
  it('el anillo de hielo bloquea a las medianas en el borde y deja libre el centro', () => {
    const ring = { id: 1, type: 'OBSTACLE_RING', x: 64, y: 64, width: 160, height: 160,
      properties: [{ name: 'collision_type', value: 'HEAVY_ONLY' }, { name: 'blocks_vision', value: false }] };
    const map = loadTiledMap(mapWith([ring]), 20);
    expect(canEnterTile(map, { x: 2, y: 4 }, 'medium', 0)).toBe(false);
    expect(canEnterTile(map, { x: 2, y: 4 }, 'heavy', 0)).toBe(true);
    expect(terrainAt(map, { x: 4, y: 4 }, 0)).toBe('empty');
  });

  it('la tormenta de iones fuerza la visión a 1 y tapa lo que hay detrás', () => {
    const storm = { id: 2, type: 'ENVIRONMENTAL_HAZARD', x: 160, y: 0, width: 64, height: 384,
      properties: [{ name: 'collision_type', value: 'NONE' }, { name: 'vision_modifier', value: 'REDUCE_TO_1_TILE' },
        { name: 'blocks_vision', value: true }] };
    const map = loadTiledMap(mapWith([storm]), 20);
    expect(effectiveVisionRadius(map, { tile: { x: 5, y: 5 }, visionRadius: 8, seesThroughNebula: true }, 0)).toBe(1);
    const fog = new FogOfWar(map);
    fog.update(map, [{ tile: { x: 1, y: 5 }, visionRadius: 9 }], 0);
    expect(fog.isVisible({ x: 5, y: 5 })).toBe(true);
    expect(fog.isVisible({ x: 9, y: 5 })).toBe(false);
  });
});

describe('CritterManager', () => {
  const spawner = { position: { x: 0, y: 0 }, maxUnits: 3, fleeDistance: 150, fleeThresholdUnits: 5 };
  const cover = [{ x: 300, y: 0 }, { x: -80, y: 40 }];

  it('crea los drones de cada spawner y huyen a la cobertura más cercana', () => {
    const army = Array.from({ length: 5 }, (_, i) => ({ x: 20 + i, y: 0 }));
    const manager = new CritterManager([spawner], { getVisibleEnemies: () => army }, cover, { x: 0, y: -200 }, () => 0);
    manager.update(16);
    expect(manager.critters).toHaveLength(3);
    expect(manager.critters.every((critter) => critter.state === 'flee')).toBe(true);
    expect(manager.nearestShelter({ x: 0, y: 0 })).toEqual({ x: -80, y: 40 });
  });

  it('sin cobertura vuelven a la estación, y no reaccionan a enemigos que el jugador no ve', () => {
    const manager = new CritterManager([spawner], { getVisibleEnemies: () => [] }, [], { x: 0, y: -200 }, () => 0);
    manager.update(16);
    expect(manager.critters.every((critter) => critter.state === 'idle')).toBe(true);
    expect(manager.nearestShelter({ x: 10, y: 10 })).toEqual({ x: 0, y: -200 });
  });
});
