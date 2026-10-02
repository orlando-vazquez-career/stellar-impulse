import type { Rng } from './rng';
import { int, range } from './rng';
import type { BlobSprites } from './particles';
import { DESIGN_H, DESIGN_W } from './background';

interface Rock {
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  rotation: number;
  spin: number;
  alpha: number;
  parallax: number;
}

interface Meteor {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
}

export interface AsteroidField {
  update(dt: number): void;
  /** Cinturón lejano y cercano: se dibuja DETRÁS de la nave. */
  draw(ctx: CanvasRenderingContext2D, t: number, px: number, py: number): void;
}

function rockSprite(rng: Rng, size: number, lit: string, dark: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const center = size / 2;
  const points = int(rng, 7, 10);
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const radius = center * range(rng, 0.62, 0.95);
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();
  // Borde iluminado desde arriba-izquierda: la luz fría que define el TOC.
  ctx.strokeStyle = lit;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.arc(center - size * 0.08, center - size * 0.08, center * 0.9, Math.PI * 0.7, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();
  // Cráteres suaves.
  for (let i = 0; i < 3; i++) {
    const craterX = center + range(rng, -center * 0.4, center * 0.4);
    const craterY = center + range(rng, -center * 0.1, center * 0.45);
    ctx.beginPath();
    ctx.arc(craterX, craterY, range(rng, size * 0.05, size * 0.12), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 12, 18, 0.5)';
    ctx.fill();
  }
  return canvas;
}

/**
 * Cinturón de asteroides en dos planos de profundidad (pasando detrás de la
 * nave estrellada) más meteoros ocasionales que cruzan la escena con estela.
 */
export function createAsteroidField(rng: Rng, sprites: BlobSprites): AsteroidField {
  const variants = [
    rockSprite(rng, 96, '#4a687e', '#1b2c3a'),
    rockSprite(rng, 96, '#41606f', '#16242f'),
    rockSprite(rng, 96, '#557488', '#20313d'),
    rockSprite(rng, 96, '#39525f', '#141f29'),
  ];

  const rocks: Rock[] = [];
  const layers = [
    { count: 13, sizeMin: 14, sizeMax: 36, speed: 9, alpha: 0.5, parallax: 0.18 },
    { count: 8, sizeMin: 30, sizeMax: 66, speed: 26, alpha: 0.9, parallax: 0.42 },
  ];
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      rocks.push({
        sprite: variants[rng() * variants.length | 0] ?? variants[0]!,
        x: range(rng, -80, DESIGN_W + 80),
        y: range(rng, 40, DESIGN_H * 0.88),
        vx: -range(rng, layer.speed * 0.6, layer.speed * 1.4),
        vy: range(rng, -1.5, 2.5),
        scale: range(rng, layer.sizeMin, layer.sizeMax) / 96,
        rotation: range(rng, 0, Math.PI * 2),
        spin: range(rng, -0.25, 0.25),
        alpha: layer.alpha * range(rng, 0.75, 1),
        parallax: layer.parallax,
      });
    }
  }

  const meteors: Meteor[] = [
    { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, age: 0 },
    { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, age: 0 },
  ];
  let nextMeteorIn = 2.5;

  function spawnMeteor(): void {
    const meteor = meteors.find((entry) => !entry.alive);
    if (!meteor) return;
    meteor.alive = true;
    meteor.age = 0;
    meteor.life = range(rng, 1.4, 2.2);
    meteor.x = range(rng, DESIGN_W * 0.45, DESIGN_W * 1.05);
    meteor.y = range(rng, -40, 60);
    const speed = range(rng, 520, 760);
    const angle = range(rng, Math.PI * 0.62, Math.PI * 0.72);
    meteor.vx = Math.cos(angle) * speed;
    meteor.vy = Math.sin(angle) * speed;
  }

  return {
    update(dt) {
      for (const rock of rocks) {
        rock.x += rock.vx * dt;
        rock.y += rock.vy * dt;
        rock.rotation += rock.spin * dt;
        if (rock.x < -110) rock.x = DESIGN_W + 90;
        if (rock.y < -90) rock.y = DESIGN_H + 60;
        if (rock.y > DESIGN_H + 90) rock.y = -60;
      }
      nextMeteorIn -= dt;
      if (nextMeteorIn <= 0) {
        spawnMeteor();
        nextMeteorIn = range(rng, 4, 9);
      }
      for (const meteor of meteors) {
        if (!meteor.alive) continue;
        meteor.age += dt;
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;
        if (meteor.age >= meteor.life || meteor.y > DESIGN_H + 120) meteor.alive = false;
      }
    },

    draw(ctx, _t, px, py) {
      for (const rock of rocks) {
        const size = 96 * rock.scale;
        ctx.globalAlpha = rock.alpha;
        ctx.save();
        ctx.translate(rock.x - px * 46 * rock.parallax, rock.y - py * 34 * rock.parallax);
        ctx.rotate(rock.rotation);
        ctx.drawImage(rock.sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // Meteoros con estela: cruzan por delante del cinturón, detrás de la nave.
      for (const meteor of meteors) {
        if (!meteor.alive) continue;
        const fade = 1 - meteor.age / meteor.life;
        const tailX = meteor.x - meteor.vx * 0.24;
        const tailY = meteor.y - meteor.vy * 0.24;
        const trail = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
        trail.addColorStop(0, `rgba(255, 236, 190, ${0.9 * fade})`);
        trail.addColorStop(0.35, `rgba(255, 158, 96, ${0.5 * fade})`);
        trail.addColorStop(1, 'rgba(255, 122, 89, 0)');
        ctx.strokeStyle = trail;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(meteor.x, meteor.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        ctx.globalAlpha = 0.85 * fade;
        ctx.drawImage(sprites.glow, meteor.x - 12, meteor.y - 12, 24, 24);
        ctx.globalAlpha = 1;
      }
    },
  };
}
