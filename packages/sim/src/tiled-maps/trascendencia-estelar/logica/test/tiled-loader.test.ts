import { describe, expect, it } from 'vitest';
import { terrainAt } from '../src/game-map';
import { loadTiledMap, type TiledMapJson } from '../src/tiled-loader';

const json: TiledMapJson = {
  width: 3,
  height: 2,
  tileheight: 32,
  tilesets: [{
    firstgid: 1,
    tiles: [
      { id: 0, properties: [{ name: 'terrain', value: 'empty' }] },
      { id: 1, properties: [{ name: 'terrain', value: 'nebula' }] },
      { id: 2, properties: [{ name: 'terrain', value: 'asteroid' }] },
    ],
  }],
  layers: [
    { name: 'logica', data: [1, 2, 3, 1, 1, 0] },
    {
      name: 'objetos',
      objects: [
        { id: 1, type: 'spawn', x: 16, y: 16, width: 0, height: 0, properties: [{ name: 'owner', value: 1 }] },
        { id: 2, type: 'agujero', x: 0, y: 32, width: 0, height: 0, properties: [{ name: 'pairId', value: 'A' }] },
        { id: 3, type: 'agujero', x: 64, y: 32, width: 0, height: 0, properties: [{ name: 'pairId', value: 'A' }] },
      ],
    },
  ],
};

describe('cargador de Tiled', () => {
  it('lee terreno, marcadores y agujeros de gusano', () => {
    const map = loadTiledMap(json, 10);
    expect(terrainAt(map, { x: 1, y: 0 }, 0)).toBe('nebula');
    expect(terrainAt(map, { x: 2, y: 0 }, 0)).toBe('asteroid');
    expect(map.markers).toEqual([{ kind: 'spawn', tile: { x: 0, y: 0 }, properties: { owner: 1 } }]);
    expect(map.wormholes[0]?.endpoints).toEqual([{ x: 0, y: 1 }, { x: 2, y: 1 }]);
  });
});
