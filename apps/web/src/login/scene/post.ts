import { DESIGN_H, DESIGN_W } from './background';

export interface PostFx {
  draw(ctx: CanvasRenderingContext2D, frame: number): void;
}

/**
 * Post-proceso barato: viñeta (pre-renderizada una vez) + grano de película
 * animado reciclando tres tiles de ruido con desplazamientos distintos.
 */
export function createPostFx(): PostFx {
  const vignette = document.createElement('canvas');
  vignette.width = DESIGN_W;
  vignette.height = DESIGN_H;
  const vignetteCtx = vignette.getContext('2d');
  if (vignetteCtx) {
    const gradient = vignetteCtx.createRadialGradient(
      DESIGN_W * 0.42, DESIGN_H * 0.46, DESIGN_H * 0.28,
      DESIGN_W * 0.5, DESIGN_H * 0.5, DESIGN_W * 0.72,
    );
    gradient.addColorStop(0, 'rgba(2, 6, 10, 0)');
    gradient.addColorStop(0.72, 'rgba(2, 6, 10, 0.28)');
    gradient.addColorStop(1, 'rgba(1, 4, 7, 0.72)');
    vignetteCtx.fillStyle = gradient;
    vignetteCtx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }

  const grainTiles: CanvasPattern[] = [];
  for (let variant = 0; variant < 3; variant++) {
    const tile = document.createElement('canvas');
    tile.width = 160;
    tile.height = 160;
    const ctx = tile.getContext('2d');
    if (!ctx) continue;
    const data = ctx.createImageData(160, 160);
    for (let i = 0; i < data.data.length; i += 4) {
      const value = 96 + Math.random() * 64;
      data.data[i] = value;
      data.data[i + 1] = value;
      data.data[i + 2] = value;
      data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) grainTiles.push(pattern);
  }

  return {
    draw(ctx, frame) {
      ctx.drawImage(vignette, 0, 0, DESIGN_W, DESIGN_H);
      const pattern = grainTiles[frame % grainTiles.length];
      if (!pattern) return;
      ctx.save();
      ctx.globalAlpha = 0.05;
      const offset = (frame * 37) % 160;
      ctx.translate(-offset, -((frame * 53) % 160));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, DESIGN_W + 320, DESIGN_H + 320);
      ctx.restore();
    },
  };
}
