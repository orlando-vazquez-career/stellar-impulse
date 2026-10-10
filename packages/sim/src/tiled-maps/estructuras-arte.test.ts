import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
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
/** IHDR colour type for truecolour with alpha, and its 8 bits per channel. */
const RGBA_COLOR_TYPE = 6;
const BIT_DEPTH = 8;
/**
 * Where the visible tower stands on its canvas. The map objects are bottom-anchored on the tile, so the
 * hull has to stay centred on the canvas and keep its foot near the bottom edge: alpha >= 32 counts as
 * visible, the last visible row sits at y = 122 and the visible columns centre on x = 40, each within 2 px.
 */
const ANCHOR = { alpha: 32, bottom: 122, centerX: TOWER.width / 2, tolerance: 2 } as const;
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
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bitDepth: bytes[24], colorType: bytes[25] };
}

/** Bytes per RGBA pixel at 8 bits per channel: the left neighbour the PNG row filters refer to. */
const RGBA_BYTES = 4;

/** Raw RGBA rows of a non-interlaced 8-bit RGBA PNG: the IDAT stream inflated and its row filters undone. */
function rgbaPixels(bytes: Buffer): Uint8Array {
  const { width, height, bitDepth, colorType } = pngHeader(bytes);
  if (bitDepth !== BIT_DEPTH || colorType !== RGBA_COLOR_TYPE) throw new Error('only 8-bit RGBA PNGs are decoded');
  if (bytes[28] !== 0) throw new Error('interlaced PNGs are not decoded: save the art without interlacing');
  const data: Buffer[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString('latin1');
    if (type === 'IDAT') data.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === 'IEND') break;
    at += 12 + length;
  }
  const filtered = inflateSync(Buffer.concat(data));
  const stride = width * RGBA_BYTES;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    const row = filtered.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const left = i >= RGBA_BYTES ? pixels[y * stride + i - RGBA_BYTES] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= RGBA_BYTES ? pixels[(y - 1) * stride + i - RGBA_BYTES] : 0;
      let predictor: number;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const [toLeft, toUp, toUpLeft] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
        predictor = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      } else throw new Error(`row ${y} uses unknown PNG filter ${filter}`);
      pixels[y * stride + i] = (row[i] + predictor) & 0xff;
    }
  }
  return pixels;
}

/** Bounding box of the pixels whose alpha reaches `threshold`; `right` and `bottom` are inclusive. */
function alphaBox(bytes: Buffer, threshold: number): { left: number; top: number; right: number; bottom: number } {
  const { width, height } = pngHeader(bytes);
  const pixels = rgbaPixels(bytes);
  const box = { left: width, top: height, right: -1, bottom: -1 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * RGBA_BYTES + 3] < threshold) continue;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
  }
  if (box.right < 0) throw new Error(`no pixel reaches alpha ${threshold}`);
  return box;
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

      it(`is an 8-bit RGBA PNG of exactly ${TOWER.width}x${TOWER.height}`, () => {
        expect(pngHeader(bytes)).toEqual({ width: TOWER.width, height: TOWER.height, bitDepth: BIT_DEPTH, colorType: RGBA_COLOR_TYPE });
      });

      it(`stands on the bottom anchor: foot at y=${ANCHOR.bottom} and centred on x=${ANCHOR.centerX}`, () => {
        const box = alphaBox(bytes, ANCHOR.alpha);
        expect(Math.abs(box.bottom - ANCHOR.bottom)).toBeLessThanOrEqual(ANCHOR.tolerance);
        // Pixel i covers [i, i + 1), so the visible columns span [left, right + 1).
        expect(Math.abs((box.left + box.right + 1) / 2 - ANCHOR.centerX)).toBeLessThanOrEqual(ANCHOR.tolerance);
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
