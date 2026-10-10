import { createRng, range } from '../../login/scene/rng';
import { isReducedMotion } from '../settings/accessibility-store';

export interface CommandSpaceScene {
  start(): void;
  stop(): void;
  resize(): void;
  setPointer(x: number, y: number): void;
}

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: string;
  depth: number;
}

interface DustMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  depth: number;
}

interface Meteor {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  life: number;
  maxLife: number;
  width: number;
}

const DESIGN_W = 1440;
const DESIGN_H = 900;
const MAX_DPR = 2;

function createNebulaBlob(color: string, size = 640): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.22)'));
  gradient.addColorStop(0.65, color.replace(/[\d.]+\)$/, '0.07)'));
  gradient.addColorStop(1, 'rgba(3, 7, 12, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function createCommandSpaceScene(
  canvas: HTMLCanvasElement,
  starfieldUrl = 'assets/starfields/starfield-3.png',
  seed = 20261002
): CommandSpaceScene {
  const context = canvas.getContext('2d');
  if (!context) {
    return { start() {}, stop() {}, resize() {}, setPointer() {} };
  }
  const ctx: CanvasRenderingContext2D = context;
  const rng = createRng(seed);

  let starfield: HTMLImageElement | null = null;
  const img = new Image();
  img.onload = () => { starfield = img; };
  img.src = starfieldUrl;

  // Manchas de nebulosa en tonos esmeralda, cian, menta y verde espacial profundo
  const nebulas = [
    { sprite: createNebulaBlob('rgba(16, 185, 129, 0.46)', 720), x: 260, y: 220, driftX: 3.2, driftY: 2.1, phase: 0 },
    { sprite: createNebulaBlob('rgba(113, 229, 220, 0.42)', 680), x: 1120, y: 640, driftX: 2.5, driftY: 1.8, phase: 2.4 },
    { sprite: createNebulaBlob('rgba(13, 148, 136, 0.38)', 820), x: 860, y: 180, driftX: 1.9, driftY: 3.0, phase: 4.1 },
    { sprite: createNebulaBlob('rgba(5, 150, 105, 0.35)', 600), x: 420, y: 720, driftX: 2.8, driftY: 1.5, phase: 1.2 },
    { sprite: createNebulaBlob('rgba(4, 47, 46, 0.55)', 900), x: 700, y: 450, driftX: 1.2, driftY: 1.0, phase: 3.5 },
  ];

  // 180 estrellas deterministas con destello
  const starColors = ['#ffffff', '#71e5dc', '#a7f3d0', '#6ee7b7', '#fde047'];
  const stars: Star[] = Array.from({ length: 180 }, () => ({
    x: range(rng, -100, DESIGN_W + 100),
    y: range(rng, -100, DESIGN_H + 100),
    size: range(rng, 0.8, 2.4),
    alpha: range(rng, 0.35, 0.95),
    twinkleSpeed: range(rng, 0.8, 2.5),
    twinklePhase: range(rng, 0, Math.PI * 2),
    color: starColors[Math.floor(rng() * starColors.length)] ?? '#ffffff',
    depth: range(rng, 0.2, 1.2),
  }));

  // Mota de polvo estelar / partículas cósmicas
  const motes: DustMote[] = Array.from({ length: 45 }, () => ({
    x: range(rng, 0, DESIGN_W),
    y: range(rng, 0, DESIGN_H),
    vx: range(rng, -3, 3),
    vy: range(rng, -5, -1),
    size: range(rng, 1.2, 3.2),
    alpha: range(rng, 0.2, 0.7),
    phase: range(rng, 0, Math.PI * 2),
    depth: range(rng, 0.5, 1.6),
  }));

  // Meteoros esporádicos en tonalidad verde iónico / cian
  const meteors: Meteor[] = Array.from({ length: 2 }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    length: 0,
    life: 0,
    maxLife: 1,
    width: 1.5,
  }));

  let meteorTimer = range(rng, 3, 7);

  // The player's setting (which starts from the system one) decides whether the backdrop moves.
  const reduced = isReducedMotion();

  let running = false;
  let raf = 0;
  let last = 0;
  let t = 0;
  let cssWidth = 0;
  let cssHeight = 0;
  const pointer = { x: 0, y: 0 };
  const parallax = { x: 0, y: 0 };

  function measure(): void {
    const rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
  }

  function spawnMeteor(): void {
    const m = meteors.find(item => !item.active);
    if (!m) return;
    m.active = true;
    m.x = range(rng, DESIGN_W * 0.1, DESIGN_W * 0.9);
    m.y = range(rng, -40, DESIGN_H * 0.4);
    const speed = range(rng, 650, 950);
    const angle = range(rng, Math.PI * 0.65, Math.PI * 0.85);
    m.vx = Math.cos(angle) * speed;
    m.vy = Math.sin(angle) * speed;
    m.length = range(rng, 80, 160);
    m.maxLife = range(rng, 0.45, 0.85);
    m.life = 0;
    m.width = range(rng, 1.2, 2.4);
  }

  function update(dt: number): void {
    t += dt;
    parallax.x += (pointer.x - parallax.x) * 0.05;
    parallax.y += (pointer.y - parallax.y) * 0.05;

    // Actualizar motas de polvo estelar
    for (const mote of motes) {
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      if (mote.y < -20) mote.y = DESIGN_H + 20;
      if (mote.x < -20) mote.x = DESIGN_W + 20;
      if (mote.x > DESIGN_W + 20) mote.x = -20;
    }

    // Temporizador de meteoros
    meteorTimer -= dt;
    if (meteorTimer <= 0) {
      spawnMeteor();
      meteorTimer = range(rng, 4.5, 9.5);
    }

    // Actualizar meteoros
    for (const m of meteors) {
      if (!m.active) continue;
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.life >= m.maxLife) m.active = false;
    }
  }

  function drawTacticalGrid(px: number, py: number): void {
    // Anillo orbital táctico en verde cian sutil
    const cx = DESIGN_W * 0.82 - px * 14;
    const cy = DESIGN_H * 0.68 - py * 12;
    const radius = 380;

    ctx.save();
    ctx.strokeStyle = 'rgba(113, 229, 220, 0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 12]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.09)';
    ctx.setLineDash([14, 28]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.65, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
    // Retícula táctica tenue
    ctx.strokeStyle = 'rgba(113, 229, 220, 0.04)';
    ctx.beginPath();
    ctx.moveTo(cx - radius * 1.1, cy);
    ctx.lineTo(cx + radius * 1.1, cy);
    ctx.moveTo(cx, cy - radius * 1.1);
    ctx.lineTo(cx, cy + radius * 1.1);
    ctx.stroke();
    ctx.restore();
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
    // Fondo base negro espacial profundo
    ctx.fillStyle = '#03070c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = Math.max(cssWidth / DESIGN_W, cssHeight / DESIGN_H);
    const ox = (cssWidth - DESIGN_W * scale) / 2;
    const oy = (cssHeight - DESIGN_H * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

    // 1. Textura del starfield con tinte oscuro y deriva
    if (starfield) {
      const sScale = Math.max(DESIGN_W / starfield.width, DESIGN_H / starfield.height) * 1.1;
      const sw = starfield.width * sScale;
      const sh = starfield.height * sScale;
      const driftX = Math.sin(t * 0.007) * 10 - parallax.x * 12;
      const driftY = Math.cos(t * 0.005) * 8 - parallax.y * 10;
      ctx.globalAlpha = 0.42;
      ctx.drawImage(starfield, (DESIGN_W - sw) / 2 + driftX, (DESIGN_H - sh) / 2 + driftY, sw, sh);
      ctx.globalAlpha = 1;
    }

    // 2. Nebulosas cósmicas en verdes y cianes vivos
    for (const neb of nebulas) {
      const nx = neb.x + Math.sin(t * 0.015 * neb.driftX + neb.phase) * 24 - parallax.x * 20;
      const ny = neb.y + Math.cos(t * 0.012 * neb.driftY + neb.phase) * 18 - parallax.y * 16;
      ctx.drawImage(neb.sprite, nx - neb.sprite.width / 2, ny - neb.sprite.height / 2);
    }

    // 3. Rejilla y anillo táctico espacial
    drawTacticalGrid(parallax.x, parallax.y);

    // 4. Estrellas titilantes
    for (const star of stars) {
      const sx = star.x - parallax.x * 22 * star.depth;
      const sy = star.y - parallax.y * 18 * star.depth;
      const twinkle = 0.6 + 0.4 * Math.sin(t * star.twinkleSpeed + star.twinklePhase);
      ctx.globalAlpha = star.alpha * twinkle;
      ctx.fillStyle = star.color;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 5. Motas de polvo estelar verde/cian flotando
    for (const mote of motes) {
      const mx = mote.x - parallax.x * 35 * mote.depth;
      const my = mote.y - parallax.y * 28 * mote.depth;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.5 + mote.phase);
      ctx.globalAlpha = mote.alpha * pulse;
      ctx.fillStyle = '#71e5dc';
      ctx.beginPath();
      ctx.arc(mx, my, mote.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 6. Meteoros en verde iónico
    for (const m of meteors) {
      if (!m.active) continue;
      const progress = m.life / m.maxLife;
      const fade = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;
      ctx.save();
      const speed = Math.hypot(m.vx, m.vy);
      const nx = m.vx / speed;
      const ny = m.vy / speed;
      const tailX = m.x - nx * m.length;
      const tailY = m.y - ny * m.length;

      const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
      grad.addColorStop(0, 'rgba(16, 185, 129, 0)');
      grad.addColorStop(0.65, 'rgba(113, 229, 220, 0.45)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.95)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = m.width;
      ctx.lineCap = 'round';
      ctx.globalAlpha = fade * 0.85;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Viñeta y scanlines tenues para unificar con el login
    const vig = ctx.createRadialGradient(
      DESIGN_W / 2, DESIGN_H / 2, DESIGN_H * 0.35,
      DESIGN_W / 2, DESIGN_H / 2, DESIGN_H * 0.85
    );
    vig.addColorStop(0, 'rgba(3, 7, 12, 0)');
    vig.addColorStop(1, 'rgba(3, 7, 12, 0.65)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }

  function tick(now: number): void {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    render();
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
      // Pre-calentar 3 segundos para que las partículas y nebulosas ya estén en movimiento
      for (let i = 0; i < 90; i++) update(1 / 30);
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
