import type { Rng } from './rng';
import { range } from './rng';

export type ParticleTint = 'fire' | 'smoke' | 'glow' | 'spark' | 'debris';

export interface Particle {
  alive: boolean;
  tint: ParticleTint;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  growth: number;
  rotation: number;
  spin: number;
  gravity: number;
}

/** Sprites suaves pre-renderizados: dibujar partículas con drawImage es
 * mucho más barato que crear un radial gradient por partícula y frame. */
export interface BlobSprites {
  fire: HTMLCanvasElement;
  smoke: HTMLCanvasElement;
  glow: HTMLCanvasElement;
}

function makeBlob(stops: ReadonlyArray<readonly [number, string]>, size = 64): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function createBlobSprites(): BlobSprites {
  return {
    fire: makeBlob([
      [0, 'rgba(255, 241, 205, 0.95)'],
      [0.25, 'rgba(242, 205, 121, 0.85)'],
      [0.55, 'rgba(255, 122, 89, 0.45)'],
      [1, 'rgba(255, 122, 89, 0)'],
    ]),
    smoke: makeBlob([
      [0, 'rgba(90, 116, 132, 0.5)'],
      [0.6, 'rgba(48, 70, 84, 0.28)'],
      [1, 'rgba(40, 65, 79, 0)'],
    ]),
    glow: makeBlob([
      [0, 'rgba(214, 255, 248, 0.9)'],
      [0.3, 'rgba(113, 229, 220, 0.45)'],
      [1, 'rgba(113, 229, 220, 0)'],
    ]),
  };
}

export interface ParticlePool {
  items: Particle[];
  cursor: number;
}

export function createPool(capacity: number): ParticlePool {
  const items: Particle[] = [];
  for (let i = 0; i < capacity; i++) {
    items.push({
      alive: false, tint: 'fire',
      x: 0, y: 0, vx: 0, vy: 0,
      age: 0, life: 1, size: 4, growth: 0,
      rotation: 0, spin: 0, gravity: 0,
    });
  }
  return { items, cursor: 0 };
}

export interface SpawnSpec {
  tint: ParticleTint;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  growth?: number;
  spin?: number;
  gravity?: number;
}

/** Toma la siguiente ranura del anillo; si está viva, reemplaza la más vieja. */
export function spawn(pool: ParticlePool, spec: SpawnSpec): void {
  const particle = pool.items[pool.cursor];
  pool.cursor = (pool.cursor + 1) % pool.items.length;
  if (!particle) return;
  particle.alive = true;
  particle.tint = spec.tint;
  particle.x = spec.x;
  particle.y = spec.y;
  particle.vx = spec.vx;
  particle.vy = spec.vy;
  particle.age = 0;
  particle.life = spec.life;
  particle.size = spec.size;
  particle.growth = spec.growth ?? 0;
  particle.spin = spec.spin ?? 0;
  particle.gravity = spec.gravity ?? 0;
  particle.rotation = 0;
}

export function updatePool(pool: ParticlePool, dt: number): void {
  for (const particle of pool.items) {
    if (!particle.alive) continue;
    particle.age += dt;
    if (particle.age >= particle.life) {
      particle.alive = false;
      continue;
    }
    particle.vy += particle.gravity * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.rotation += particle.spin * dt;
    particle.size = Math.max(0.5, particle.size + particle.growth * dt);
  }
}

export function drawPool(ctx: CanvasRenderingContext2D, pool: ParticlePool, sprites: BlobSprites): void {
  for (const particle of pool.items) {
    if (!particle.alive) continue;
    const t = particle.age / particle.life;
    const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;

    if (particle.tint === 'spark') {
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#d6fff8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - particle.vx * 0.045, particle.y - particle.vy * 0.045);
      ctx.stroke();
      continue;
    }

    if (particle.tint === 'debris') {
      ctx.globalAlpha = Math.min(1, fade * 1.6);
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.fillStyle = '#131e28';
      ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      ctx.strokeStyle = 'rgba(255, 171, 112, 0.5)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      ctx.restore();
      continue;
    }

    const sprite = particle.tint === 'fire' ? sprites.fire : particle.tint === 'glow' ? sprites.glow : sprites.smoke;
    const alpha = particle.tint === 'smoke' ? fade * 0.5 : fade;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const half = particle.size / 2;
    ctx.drawImage(sprite, particle.x - half, particle.y - half, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

/** Ráfaga aleatoria de chispas desde un punto de ruptura. */
export function burstSparks(pool: ParticlePool, rng: Rng, x: number, y: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = range(rng, -Math.PI, Math.PI);
    const speed = range(rng, 60, 260);
    spawn(pool, {
      tint: 'spark',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: range(rng, 0.25, 0.7),
      size: 1,
      gravity: 120,
    });
  }
}
