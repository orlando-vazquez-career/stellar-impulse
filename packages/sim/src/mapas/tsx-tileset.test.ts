import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isLogicaTilesetSource, LOGICA_TERRAIN_BY_TILE_ID, parseTiledTsx } from './tsx-tileset.js';

const logicaXml = readFileSync(new URL('../tiled-maps/espiral-estelar/tilesets/logica.tsx', import.meta.url), 'utf8');

describe('tsx-tileset', () => {
  it('keeps the hardcoded logica terrains in sync with the Tiled file', () => {
    const tileset = parseTiledTsx({ xml: logicaXml, firstgid: 1, tsxPathFromMap: 'tilesets/logica.tsx' });
    const terrains = (tileset.tiles ?? [])
      .sort((left, right) => left.id - right.id)
      .map((tile) => tile.properties?.find((property) => property.name === 'terrain')?.value);
    expect(terrains).toEqual([...LOGICA_TERRAIN_BY_TILE_ID]);
    expect(tileset.image).toBe('tilesets/img/logica.png');
  });

  it('recognizes the external logica tileset path Tiled writes into JSON', () => {
    expect(isLogicaTilesetSource('tilesets/logica.tsx')).toBe(true);
    expect(isLogicaTilesetSource('tilesets\\logica.tsx')).toBe(true);
    expect(isLogicaTilesetSource('planetafondo.tsx')).toBe(false);
  });
});
