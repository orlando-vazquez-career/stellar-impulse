import type { Rng } from './rng';
import { range } from './rng';
import {
  burstSparks, createPool, drawPool, spawn, updatePool,
  type BlobSprites, type ParticlePool,
} from './particles';

export interface Wreck {
  update(dt: number, t: number): void;
  draw(ctx: CanvasRenderingContext2D, t: number, px: number, py: number): void;
}

interface Anchor { x: number; y: number }

/** Puntos calientes del casco en coordenadas de diseño (1280×720). */
const FIRES: readonly Anchor[] = [
  { x: 388, y: 452 },  // incendio de cubierta
  { x: 648, y: 520 },  // grieta entre las dos mitades
  { x: 742, y: 566 },  // borde desgarrado de la proa
  { x: 296, y: 636 },  // ruptura del vientre
];
const SMOKES: readonly Anchor[] = [
  { x: 384, y: 448 },
  { x: 644, y: 514 },
  { x: 738, y: 560 },
];
const BREACH: Anchor = { x: 656, y: 536 };
const ENGINES: readonly Anchor[] = [
  { x: 84, y: 470 },
  { x: 80, y: 506 },
  { x: 86, y: 542 },
];
const LIGHTS: readonly Anchor[] = [
  { x: 208, y: 428 },
  { x: 498, y: 442 },
];

const MAIN_X = 64;
const MAIN_Y = 416;
const BOW_X = 694;
const BOW_Y = 516;

function traceMainHull(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(16, 150);
  ctx.lineTo(58, 102);
  ctx.lineTo(148, 76);
  ctx.lineTo(330, 66);
  ctx.lineTo(472, 80);
  ctx.lineTo(560, 98);
  // Borde desgarrado donde el casco se partió.
  ctx.lineTo(630, 112);
  ctx.lineTo(596, 130);
  ctx.lineTo(636, 152);
  ctx.lineTo(600, 174);
  ctx.lineTo(632, 198);
  ctx.lineTo(540, 218);
  ctx.lineTo(360, 234);
  ctx.lineTo(178, 228);
  ctx.lineTo(68, 198);
  ctx.lineTo(22, 170);
  ctx.closePath();
}

function traceBow(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(70, 68);
  ctx.lineTo(98, 102);
  ctx.lineTo(62, 132);
  ctx.lineTo(96, 164);
  ctx.lineTo(68, 198);
  ctx.lineTo(170, 226);
  ctx.lineTo(272, 186);
  ctx.lineTo(318, 140);
  ctx.lineTo(284, 114);
  ctx.lineTo(246, 92);
  ctx.lineTo(148, 64);
  ctx.closePath();
}

function paintHullDetails(ctx: CanvasRenderingContext2D, width: number): void {
  // Líneas de planchas y notch de hangar, apenas visibles en la penumbra.
  ctx.strokeStyle = 'rgba(70, 99, 122, 0.55)';
  ctx.lineWidth = 1.6;
  for (let i = 1; i <= 4; i++) {
    const y = 66 + i * 34;
    ctx.beginPath();
    ctx.moveTo(40, y + 40);
    ctx.lineTo(width - 90, y + 8);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(5, 10, 16, 0.8)';
  ctx.fillRect(width * 0.42, 176, 64, 24);
  ctx.strokeStyle = 'rgba(70, 99, 122, 0.4)';
  ctx.strokeRect(width * 0.42, 176, 64, 24);
}

function hullSprite(width: number, height: number, trace: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  trace(ctx);
  ctx.fillStyle = '#0c1824';
  ctx.fill();
  ctx.save();
  trace(ctx);
  ctx.clip();
  // Volumen: luz fría cenital y sombra abisal en el vientre.
  const shade = ctx.createLinearGradient(0, 40, 0, height);
  shade.addColorStop(0, 'rgba(90, 128, 152, 0.35)');
  shade.addColorStop(0.4, 'rgba(30, 50, 66, 0.12)');
  shade.addColorStop(1, 'rgba(2, 5, 9, 0.75)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
  paintHullDetails(ctx, width);
  ctx.restore();
  // Filo iluminado.
  trace(ctx);
  ctx.strokeStyle = 'rgba(94, 130, 156, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  return canvas;
}

/**
 * La protagonista: un capital ship partido en dos, en primer plano, ardiendo.
 * Casco pre-renderizado (forma fija) + todo lo vivo (fuego, humo, chispas,
 * arcos eléctricos, micro-explosiones) como partículas cada frame.
 */
export function createWreck(rng: Rng, sprites: BlobSprites): Wreck {
  const mainHull = hullSprite(660, 280, traceMainHull);
  const bowHull = hullSprite(340, 280, traceBow);

  // Los motores se dibujan sobre el casco principal: tres campanas apagadas.
  const engines = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 660;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.fillStyle = '#101d29';
    ctx.strokeStyle = 'rgba(90, 124, 148, 0.6)';
    ctx.lineWidth = 1.6;
    for (const y of [96, 132, 168]) {
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(2, y + 4);
      ctx.lineTo(2, y + 26);
      ctx.lineTo(18, y + 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    return canvas;
  })();

  const pools = {
    smoke: createPool(70),
    fire: createPool(110),
    sparks: createPool(40),
    debris: createPool(24),
  } satisfies Record<string, ParticlePool>;

  const fireAccumulators = FIRES.map(() => 0);
  const smokeAccumulators = SMOKES.map(() => 0);
  let sparkIn = 0.8;
  let arcIn = 2.6;
  let arcLife = 0;
  let arcSeed = 0;
  let explosionIn = 5.5;
  let flash = 0;
  let flashAt: Anchor = BREACH;
  let sputter = 0;

  function spawnFire(anchor: Anchor): void {
    spawn(pools.fire, {
      tint: 'fire',
      x: anchor.x + range(rng, -14, 14),
      y: anchor.y + range(rng, -8, 8),
      vx: range(rng, -9, 9),
      vy: range(rng, -46, -22),
      life: range(rng, 0.5, 1.1),
      size: range(rng, 14, 30),
      growth: -6,
    });
  }

  function spawnSmoke(anchor: Anchor): void {
    spawn(pools.smoke, {
      tint: 'smoke',
      x: anchor.x + range(rng, -10, 10),
      y: anchor.y,
      vx: range(rng, 6, 18),
      vy: range(rng, -34, -20),
      life: range(rng, 2.8, 4.6),
      size: range(rng, 26, 44),
      growth: 12,
    });
  }

  function explode(): void {
    const anchor = FIRES[Math.floor(rng() * FIRES.length)] ?? FIRES[0]!;
    flash = 1;
    flashAt = anchor;
    for (let i = 0; i < 14; i++) spawnFire({ x: anchor.x + range(rng, -26, 26), y: anchor.y + range(rng, -18, 18) });
    burstSparks(pools.sparks, rng, anchor.x, anchor.y, 10);
    for (let i = 0; i < 6; i++) {
      spawn(pools.debris, {
        tint: 'debris',
        x: anchor.x,
        y: anchor.y,
        vx: range(rng, -70, 70),
        vy: range(rng, -120, -30),
        life: range(rng, 2.4, 4),
        size: range(rng, 4, 10),
        spin: range(rng, -3, 3),
        gravity: 46,
      });
    }
    spawn(pools.smoke, {
      tint: 'smoke', x: anchor.x, y: anchor.y,
      vx: range(rng, 4, 12), vy: range(rng, -26, -14),
      life: 5.5, size: 60, growth: 18,
    });
  }

  return {
    update(dt, t) {
      FIRES.forEach((anchor, index) => {
        fireAccumulators[index] = (fireAccumulators[index] ?? 0) + dt * 15;
        while ((fireAccumulators[index] ?? 0) >= 1) {
          fireAccumulators[index] = (fireAccumulators[index] ?? 0) - 1;
          spawnFire(anchor);
        }
      });
      SMOKES.forEach((anchor, index) => {
        smokeAccumulators[index] = (smokeAccumulators[index] ?? 0) + dt * 6.5;
        while ((smokeAccumulators[index] ?? 0) >= 1) {
          smokeAccumulators[index] = (smokeAccumulators[index] ?? 0) - 1;
          spawnSmoke(anchor);
        }
      });

      sparkIn -= dt;
      if (sparkIn <= 0) {
        const anchor = FIRES[Math.floor(rng() * FIRES.length)] ?? FIRES[0]!;
        burstSparks(pools.sparks, rng, anchor.x, anchor.y, 4 + Math.floor(rng() * 6));
        sparkIn = range(rng, 0.6, 1.7);
      }
      arcIn -= dt;
      if (arcIn <= 0) {
        arcLife = 0.1;
        arcSeed = rng() * 1000;
        arcIn = range(rng, 2.2, 5.2);
      }
      arcLife = Math.max(0, arcLife - dt);
      explosionIn -= dt;
      if (explosionIn <= 0) {
        explode();
        explosionIn = range(rng, 6, 14);
      }
      flash = Math.max(0, flash - dt * 3.4);
      sputter = Math.max(0, sputter - dt);
      if (rng() < dt * 0.5) sputter = range(rng, 0.15, 0.5);

      updatePool(pools.smoke, dt);
      updatePool(pools.fire, dt);
      updatePool(pools.sparks, dt);
      updatePool(pools.debris, dt);
      // La grieta emite un fuego extra continuo con pulso lento.
      if (Math.sin(t * 2.1) > 0.35) spawnFire(BREACH);
    },

    draw(ctx, t, px, py) {
      ctx.save();
      ctx.translate(-px * 44, -py * 32);

      // 1 · Humo detrás del casco.
      drawPool(ctx, pools.smoke, sprites);

      // 2 · El casco partido, con deriva mínima de cadáver espacial.
      const bobMain = Math.sin(t * 0.42) * 5;
      const bowDrift = Math.sin(t * 0.1) * 9;
      ctx.save();
      ctx.translate(MAIN_X + 330, MAIN_Y + 140 + bobMain);
      ctx.rotate(-0.1 + Math.sin(t * 0.21) * 0.008);
      ctx.drawImage(mainHull, -330, -140);
      ctx.drawImage(engines, -330, -140);
      ctx.restore();
      ctx.save();
      ctx.translate(BOW_X + 170 + bowDrift, BOW_Y + 140);
      ctx.rotate(0.42 + t * 0.006);
      ctx.drawImage(bowHull, -170, -140);
      ctx.restore();

      // 3 · Todo lo luminoso en aditivo.
      ctx.globalCompositeOperation = 'lighter';
      drawPool(ctx, pools.fire, sprites);

      // Brasa pulsante en la grieta entre mitades.
      const breachPulse = 0.5 + 0.28 * Math.sin(t * 5.3) + 0.12 * Math.sin(t * 13.7);
      ctx.globalAlpha = Math.max(0, breachPulse) * 0.75;
      ctx.drawImage(sprites.fire, BREACH.x - 95, BREACH.y - 95, 190, 190);
      // Motores: brasa moribunda que tose de vez en cuando.
      if (sputter > 0) {
        ctx.globalAlpha = sputter * 0.8;
        for (const engine of ENGINES) ctx.drawImage(sprites.fire, engine.x - 22, engine.y - 18, 44, 36);
      }
      // Luces de emergencia parpadeando en el casco.
      for (const [index, light] of LIGHTS.entries()) {
        if (Math.sin(t * 7 + index * 2.4) > 0.55) {
          ctx.globalAlpha = 0.9;
          ctx.drawImage(sprites.glow, light.x - 9, light.y - 9, 18, 18);
        }
      }
      // Arco eléctrico entre dos puntos de ruptura.
      if (arcLife > 0) {
        ctx.globalAlpha = Math.min(1, arcLife * 14);
        ctx.strokeStyle = '#a5fff2';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const segments = 6;
        for (let i = 0; i <= segments; i++) {
          const f = i / segments;
          const jitter = i === 0 || i === segments ? 0 : Math.sin(arcSeed + i * 37.3) * 22;
          const x = BREACH.x + (FIRES[2]!.x - BREACH.x) * f + jitter;
          const y = BREACH.y + (FIRES[2]!.y - BREACH.y) * f + jitter * 0.6;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Flash de micro-explosión: baña la mitad izquierda de la escena.
      if (flash > 0) {
        const bloom = ctx.createRadialGradient(flashAt.x, flashAt.y, 0, flashAt.x, flashAt.y, 320);
        bloom.addColorStop(0, `rgba(255, 224, 170, ${0.5 * flash})`);
        bloom.addColorStop(0.4, `rgba(255, 158, 96, ${0.22 * flash})`);
        bloom.addColorStop(1, 'rgba(255, 122, 89, 0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = bloom;
        ctx.fillRect(flashAt.x - 320, flashAt.y - 320, 640, 640);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // 4 · Chispas y escoria por delante del casco.
      drawPool(ctx, pools.sparks, sprites);
      drawPool(ctx, pools.debris, sprites);
      ctx.restore();
    },
  };
}
