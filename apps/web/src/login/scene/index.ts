import { createAsteroidField, type AsteroidField } from './asteroids';
import { createBackground, DESIGN_H, DESIGN_W, type Background } from './background';
import { createBlobSprites } from './particles';
import { createPostFx, type PostFx } from './post';
import { createRng } from './rng';
import type { View } from './view';
import { createWreck, type Wreck } from './wreck';

export interface LoginScene {
  start(): void;
  stop(): void;
  resize(): void;
  /** Puntero normalizado -1..1 para el paralaje. */
  setPointer(x: number, y: number): void;
}

export interface LoginSceneOptions {
  starfieldUrl?: string;
  seed?: number;
}

const MAX_DPR = 2;
const DESIGN: View = { width: DESIGN_W, height: DESIGN_H };

function noopScene(): LoginScene {
  return { start() {}, stop() {}, resize() {}, setPointer() {} };
}

/**
 * Orquestador de la escena del login: nave estrellada en primer plano,
 * cinturón de asteroides detrás, nebulosa y viñeta. Canvas 2D puro, sin
 * dependencias del juego. Determinista (semilla fija), con calentamiento de
 * simulación para que el primer frame ya aparezca "vivo".
 */
export function createLoginScene(canvas: HTMLCanvasElement, options: LoginSceneOptions = {}): LoginScene {
  const context = canvas.getContext('2d');
  if (!context) return noopScene();
  const ctx: CanvasRenderingContext2D = context;

  const rng = createRng(options.seed ?? 20260930);
  const sprites = createBlobSprites();
  const background: Background = createBackground(rng, options.starfieldUrl ?? 'assets/starfields/starfield-3.png');
  const asteroids: AsteroidField = createAsteroidField(rng, sprites);
  const wreck: Wreck = createWreck(rng, sprites);
  const post: PostFx = createPostFx();

  const reduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let running = false;
  let raf = 0;
  let last = 0;
  let t = 0;
  let frame = 0;
  let cssWidth = 0;
  let cssHeight = 0;
  const pointer = { x: 0, y: 0 };
  const parallax = { x: 0, y: 0 };

  function measure(): void {
    const rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
  }

  function simulate(dt: number): void {
    t += dt;
    parallax.x += (pointer.x - parallax.x) * 0.06;
    parallax.y += (pointer.y - parallax.y) * 0.06;
    asteroids.update(dt);
    wreck.update(dt, t);
  }

  function render(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const targetW = Math.round(cssWidth * dpr);
    const targetH = Math.round(cssHeight * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#03070c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = Math.max(cssWidth / DESIGN_W, cssHeight / DESIGN_H);
    const ox = (cssWidth - DESIGN_W * scale) / 2;
    const oy = (cssHeight - DESIGN_H * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

    background.draw(ctx, DESIGN, t, parallax.x, parallax.y);
    asteroids.draw(ctx, t, parallax.x, parallax.y);
    wreck.draw(ctx, t, parallax.x, parallax.y);
    post.draw(ctx, frame);
  }

  /** Simula unos segundos antes del primer frame: fuego y humo ya presentes. */
  function warmup(ticks: number): void {
    for (let i = 0; i < ticks; i++) simulate(1 / 30);
  }

  function tick(now: number): void {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    simulate(dt);
    render();
    frame += 1;
    raf = requestAnimationFrame(tick);
  }

  function onVisibility(): void {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else if (running && !reduced) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      measure();
      warmup(reduced ? 420 : 300);
      render();
      if (!reduced) {
        document.addEventListener('visibilitychange', onVisibility);
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    },
    resize() {
      measure();
      if (!running || reduced) render();
    },
    setPointer(x, y) {
      pointer.x = Math.max(-1, Math.min(1, x));
      pointer.y = Math.max(-1, Math.min(1, y));
    },
  };
}
