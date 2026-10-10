import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/**
 * Guard for the neutral turret art: a top-down base plate and a gun head that the scene rotates around
 * the canvas centre. Both are square 8-bit RGBA canvases with transparent corners, so any replacement
 * keeps the size the scene scales from and never paints a box around the turret.
 */
const TURRET_ART = ['turret-base-neutral.png', 'turret-head-neutral.png'] as const;
const SIZE = 256;
const RGBA_COLOR_TYPE = 6;
const RGBA_BYTES = 4;

const structure = (file: string) => readFileSync(new URL(`../../../../public/assets/game/structures/${file}`, import.meta.url));

/** Alpha of every pixel of a non-interlaced 8-bit RGBA PNG. */
function alphaChannel(bytes: Buffer): { width: number; height: number; colorType: number; alpha: (x: number, y: number) => number } {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25]!;
  const chunks: Buffer[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString('latin1');
    if (type === 'IDAT') chunks.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === 'IEND') break;
    at += 12 + length;
  }
  const filtered = inflateSync(Buffer.concat(chunks));
  const stride = width * RGBA_BYTES;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const raw = filtered[y * (stride + 1) + 1 + i]!;
      const left = i >= RGBA_BYTES ? pixels[y * stride + i - RGBA_BYTES]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i]! : 0;
      const upLeft = y > 0 && i >= RGBA_BYTES ? pixels[(y - 1) * stride + i - RGBA_BYTES]! : 0;
      const estimate = left + up - upLeft;
      const paeth = Math.abs(estimate - left) <= Math.abs(estimate - up) && Math.abs(estimate - left) <= Math.abs(estimate - upLeft)
        ? left : Math.abs(estimate - up) <= Math.abs(estimate - upLeft) ? up : upLeft;
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter!];
      if (predictor === undefined) throw new Error(`row ${y} uses unknown PNG filter ${filter}`);
      pixels[y * stride + i] = (raw + predictor) & 0xff;
    }
  }
  return { width, height, colorType, alpha: (x, y) => pixels[y * stride + x * RGBA_BYTES + 3]! };
}

describe('neutral turret art', () => {
  it.each(TURRET_ART)('%s is a 256 px RGBA square with transparent corners', (file) => {
    const art = alphaChannel(structure(file));
    expect([art.width, art.height, art.colorType]).toEqual([SIZE, SIZE, RGBA_COLOR_TYPE]);
    for (const [x, y] of [[0, 0], [SIZE - 1, 0], [0, SIZE - 1], [SIZE - 1, SIZE - 1]] as const) expect(art.alpha(x, y)).toBe(0);
  });

  it('keeps the gun head pivot on the canvas centre, with the barrels pointing up', () => {
    const head = alphaChannel(structure('turret-head-neutral.png'));
    const solid = (x: number, y: number) => head.alpha(x, y) >= 32;
    expect(solid(SIZE / 2, SIZE / 2)).toBe(true);
    let top = SIZE, bottom = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (solid(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    // The barrels reach further above the pivot than the crown does below it.
    expect(SIZE / 2 - top).toBeGreaterThan(bottom - SIZE / 2);
  });
});
