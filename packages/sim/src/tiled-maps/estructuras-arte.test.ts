import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTiledTsx } from '../mapas/tsx-tileset.js';

/**
 * Guard for the watch tower art shared by the three playable kits. Any new sprite (drawn by hand or
 * generated) has to keep the tileset canvas, the bottom anchor every map object was placed with, and the
 * same file in every kit. The legacy `trascendencia-estelar` kit is not loaded by the game and is left out.
 */
const KITS = [
  { folder: 'espiral-estelar', map: 'espiral-estelar.json' },
  { folder: 'espiral-estelar_2', map: 'espiral-estelar_2.json' },
  { folder: 'trascendencia-estelar_2', map: 'trascendencia-estelar_2.json' },
] as const;
const TOWER = { name: 'torre_vigilancia', image: 'img/torre_vigilancia.png', width: 80, height: 128 } as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** IHDR colour type for truecolour with alpha. */
const RGBA_COLOR_TYPE = 6;
/** Tiled stores flip flags in the top bits of every gid. */
const GID_MASK = 0x1fffffff;
const STRUCTURES_TSX = 'tilesets/estructuras.tsx';

interface MapObject { name?: string; gid?: number; width: number; height: number }
interface MapLayer { type: string; objects?: MapObject[]; layers?: MapLayer[] }
interface MapJson { layers: MapLayer[]; tilesets: { firstgid: number; source?: string }[] }

const kitFile = (folder: string, file: string) => new URL(`./${folder}/${file}`, import.meta.url);

function pngHeader(bytes: Buffer) {
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(bytes.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

function structuresTileset(folder: string) {
  const xml = readFileSync(kitFile(folder, STRUCTURES_TSX), 'utf8');
  return parseTiledTsx({ xml, firstgid: 0, tsxPathFromMap: STRUCTURES_TSX });
}

function towerTile(folder: string) {
  const tile = structuresTileset(folder).tiles?.find((candidate) => candidate.image === `tilesets/${TOWER.image}`);
  if (!tile) throw new Error(`${folder}: ${STRUCTURES_TSX} has no ${TOWER.name} tile`);
  return tile;
}

function objectsOf(layers: MapLayer[]): MapObject[] {
  return layers.flatMap((layer) => [...(layer.objects ?? []), ...objectsOf(layer.layers ?? [])]);
}

/** Tile objects drawn with the tower image, found by gid so unnamed copies count too. */
function towerObjects(folder: string, mapFile: string): MapObject[] {
  const map = JSON.parse(readFileSync(kitFile(folder, mapFile), 'utf8')) as MapJson;
  const structures = map.tilesets.find((tileset) => tileset.source?.replaceAll('\\', '/') === STRUCTURES_TSX);
  if (!structures) throw new Error(`${mapFile} does not reference ${STRUCTURES_TSX}`);
  const gid = structures.firstgid + towerTile(folder).id;
  return objectsOf(map.layers).filter((object) => object.gid !== undefined && (object.gid & GID_MASK) === gid);
}

describe('watch tower art (torre_vigilancia)', () => {
  for (const kit of KITS) {
    describe(kit.folder, () => {
      const bytes = readFileSync(kitFile(kit.folder, `tilesets/${TOWER.image}`));

      it(`is an RGBA PNG of exactly ${TOWER.width}x${TOWER.height}`, () => {
        expect(pngHeader(bytes)).toEqual({ width: TOWER.width, height: TOWER.height, colorType: RGBA_COLOR_TYPE });
      });

      it('matches the image size declared in estructuras.tsx', () => {
        const tile = towerTile(kit.folder);
        const header = pngHeader(bytes);
        expect(tile.properties?.find((property) => property.name === 'nombre')?.value).toBe(TOWER.name);
        expect({ width: tile.imagewidth, height: tile.imageheight }).toEqual({ width: header.width, height: header.height });
      });

      it(`is placed at ${TOWER.width}x${TOWER.height} by every tower object of the map`, () => {
        const objects = towerObjects(kit.folder, kit.map);
        expect(objects.length).toBeGreaterThan(0);
        for (const object of objects) expect({ width: object.width, height: object.height }).toEqual({ width: TOWER.width, height: TOWER.height });
      });
    });
  }

  it('is the same file in every kit', () => {
    const hashes = KITS.map((kit) => createHash('sha256').update(readFileSync(kitFile(kit.folder, `tilesets/${TOWER.image}`))).digest('hex'));
    expect(new Set(hashes).size).toBe(1);
  });
});
