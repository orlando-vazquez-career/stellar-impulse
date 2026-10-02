import type { Rng } from './rng';
import { range } from './rng';
import type { View } from './view';

export interface Background {
  readonly ready: boolean;
  draw(ctx: CanvasRenderingContext2D, view: View, t: number, px: number, py: number): void;
}

interface NebulaBlob {
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  drift: number;
  phase: number;
  alpha: number;
}

export const DESIGN_W = 1280;
export const DESIGN_H = 720;

function nebulaSprite(rng: Rng, color: string): HTMLCanvasElement {
  const size = 420;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  for (let i = 0; i < 5; i++) {
    const cx = range(rng, size * 0.25, size * 0.75);
    const cy = range(rng, size * 0.25, size * 0.75);
    const radius = range(rng, size * 0.18, size * 0.42);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(4, 10, 18, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return canvas;
}

/**
 * Fondo profundo: gradiente base, el starfield PNG existente del lobby con
 * opacidad baja y tres manchas de nebulosa a la deriva. Es la capa más lenta
 * del paralaje.
 */
export function createBackground(rng: Rng, starfieldUrl: string): Background {
  let starfield: HTMLImageElement | null = null;
  let ready = false;
  const image = new Image();
  image.onload = () => { starfield = image; ready = true; };
  image.src = starfieldUrl;

  const blobs: NebulaBlob[] = [
    { sprite: nebulaSprite(rng, 'rgba(28, 58, 74, 0.55)'), x: 240, y: 180, drift: 3.1, phase: range(rng, 0, 6), alpha: 0.5 },
    { sprite: nebulaSprite(rng, 'rgba(22, 50, 58, 0.5)'), x: 1010, y: 540, drift: 2.2, phase: range(rng, 0, 6), alpha: 0.45 },
    { sprite: nebulaSprite(rng, 'rgba(52, 34, 48, 0.4)'), x: 900, y: 140, drift: 1.6, phase: range(rng, 0, 6), alpha: 0.4 },
  ];

  return {
    get ready() { return ready; },
    draw(ctx, view, t, px, py) {
      const base = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
      base.addColorStop(0, '#04090f');
      base.addColorStop(0.55, '#08131f');
      base.addColorStop(1, '#03070c');
      ctx.fillStyle = base;
      ctx.fillRect(-80, -80, DESIGN_W + 160, DESIGN_H + 160);

      if (starfield) {
        const scale = Math.max(DESIGN_W / starfield.width, DESIGN_H / starfield.height) * 1.06;
        const w = starfield.width * scale;
        const h = starfield.height * scale;
        const driftX = Math.sin(t * 0.008) * 12 - px * 10;
        const driftY = Math.cos(t * 0.006) * 8 - py * 8;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(starfield, (DESIGN_W - w) / 2 + driftX, (DESIGN_H - h) / 2 + driftY, w, h);
        ctx.globalAlpha = 1;
      }

      for (const blob of blobs) {
        const x = blob.x + Math.sin(t * 0.01 * blob.drift + blob.phase) * 26 - px * 18;
        const y = blob.y + Math.cos(t * 0.008 * blob.drift + blob.phase) * 16 - py * 14;
        ctx.globalAlpha = blob.alpha;
        ctx.drawImage(blob.sprite, x - 210, y - 210);
      }
      ctx.globalAlpha = 1;
    },
  };
}
