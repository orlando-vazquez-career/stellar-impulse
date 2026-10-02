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
  tailLength: number;
  width: number;
  colorType: 'warm' | 'cyan' | 'gold';
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
 * Cinturón de asteroides en dos planos de profundidad más cometas y meteoros
 * frecuentes que cruzan aleatoriamente la escena con estelas luminosas.
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

  // Pool ampliado de cometas para permitir múltiples estelas simultáneas
  const METEOR_CAPACITY = 10;
  const meteors: Meteor[] = Array.from({ length: METEOR_CAPACITY }, () => ({
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    age: 0,
    tailLength: 0.28,
    width: 2.4,
    colorType: 'warm',
  }));

  let nextMeteorIn = 1.0;

  function spawnMeteor(): void {
    const meteor = meteors.find((entry) => !entry.alive);
    if (!meteor) return;
    meteor.alive = true;
    meteor.age = 0;
    meteor.life = range(rng, 1.3, 2.4);
    // Posición de entrada aleatoria a lo largo de la parte superior y derecha
    meteor.x = range(rng, DESIGN_W * 0.05, DESIGN_W * 1.15);
    meteor.y = range(rng, -50, 90);

    const speed = range(rng, 580, 890);
    // Trayectoria diagonal descendente hacia la izquierda
    const angle = range(rng, Math.PI * 0.58, Math.PI * 0.74);
    meteor.vx = Math.cos(angle) * speed;
    meteor.vy = Math.sin(angle) * speed;
    meteor.tailLength = range(rng, 0.22, 0.36);
    meteor.width = range(rng, 1.8, 3.4);

    const colorRoll = rng();
    meteor.colorType = colorRoll < 0.45 ? 'warm' : colorRoll < 0.75 ? 'cyan' : 'gold';
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

      // Intervalos de generación más frecuentes y con probabilidad de cometas en parejas
      nextMeteorIn -= dt;
      if (nextMeteorIn <= 0) {
        spawnMeteor();
        // 35% de probabilidad de generar un segundo cometa en ráfaga rápida
        if (rng() < 0.35) {
          spawnMeteor();
        }
        nextMeteorIn = range(rng, 0.7, 1.9);
      }

      for (const meteor of meteors) {
        if (!meteor.alive) continue;
        meteor.age += dt;
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;
        if (meteor.age >= meteor.life || meteor.y > DESIGN_H + 140 || meteor.x < -120) {
          meteor.alive = false;
        }
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

      // Cometas con estelas luminosas (cruzan por delante del cinturón y detrás de la nave)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const meteor of meteors) {
        if (!meteor.alive) continue;
        const progress = meteor.age / meteor.life;
        const fade = progress < 0.15 ? progress / 0.15 : Math.max(0, (1 - progress) / 0.85);

        const tailX = meteor.x - meteor.vx * meteor.tailLength;
        const tailY = meteor.y - meteor.vy * meteor.tailLength;

        const trail = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
        if (meteor.colorType === 'cyan') {
          trail.addColorStop(0, `rgba(230, 255, 255, ${0.95 * fade})`);
          trail.addColorStop(0.3, `rgba(113, 229, 220, ${0.65 * fade})`);
          trail.addColorStop(1, 'rgba(40, 140, 255, 0)');
        } else if (meteor.colorType === 'gold') {
          trail.addColorStop(0, `rgba(255, 255, 220, ${0.95 * fade})`);
          trail.addColorStop(0.3, `rgba(242, 205, 121, ${0.65 * fade})`);
          trail.addColorStop(1, 'rgba(255, 120, 40, 0)');
        } else {
          trail.addColorStop(0, `rgba(255, 240, 210, ${0.95 * fade})`);
          trail.addColorStop(0.3, `rgba(255, 160, 100, ${0.6 * fade})`);
          trail.addColorStop(1, 'rgba(255, 90, 50, 0)');
        }

        ctx.strokeStyle = trail;
        ctx.lineWidth = meteor.width;
        ctx.beginPath();
        ctx.moveTo(meteor.x, meteor.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // Cabeza luminosa del cometa
        ctx.globalAlpha = Math.min(1, 0.9 * fade);
        const glowSprite = meteor.colorType === 'cyan' ? sprites.glow : sprites.fire;
        const glowSize = 22 * (meteor.width / 2.4);
        ctx.drawImage(glowSprite, meteor.x - glowSize / 2, meteor.y - glowSize / 2, glowSize, glowSize);
      }
      ctx.restore();
    },
  };
}
