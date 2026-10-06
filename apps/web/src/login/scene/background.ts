import type { Rng } from './rng';
import { range } from './rng';
import type { View } from './view';

export interface Background {
  readonly ready: boolean;
  draw(ctx: CanvasRenderingContext2D, view: View, t: number, px: number, py: number): void;
}

export const DESIGN_W = 1280;
export const DESIGN_H = 720;

interface NebulaCluster {
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  driftX: number;
  driftY: number;
  pulseSpeed: number;
  phase: number;
  baseAlpha: number;
  parallaxFactor: number;
}

interface Star {
  x: number;
  y: number;
  radius: number;
  color: string;
  twinkleSpeed: number;
  phase: number;
  baseAlpha: number;
  parallaxFactor: number;
}

interface HeroStar {
  x: number;
  y: number;
  radius: number;
  spikeLength: number;
  color: string;
  coreColor: string;
  flareAlpha: number;
  pulseSpeed: number;
  phase: number;
  parallaxFactor: number;
}

interface StardustMote {
  x: number;
  y: number;
  size: number;
  color: string;
  speedX: number;
  speedY: number;
  phase: number;
  alpha: number;
}

/**
 * Pre-renderiza un parche de nebulosa volumétrica orgánica utilizando múltiples
 * filamentos elípticos superpuestos con modos de fusión luminosos.
 */
function createNebulaSprite(
  rng: Rng,
  width: number,
  height: number,
  palette: { core: string; mid: string; edge: string },
  lobeCount = 22,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Base gaseosa difusa y suave
  const ambientRadius = Math.min(width, height) * 0.44;
  const ambientGrad = ctx.createRadialGradient(
    width * 0.5, height * 0.5, 0,
    width * 0.5, height * 0.5, ambientRadius,
  );
  ambientGrad.addColorStop(0, palette.mid);
  ambientGrad.addColorStop(0.55, palette.edge);
  ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = ambientGrad;
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.5, ambientRadius, 0, Math.PI * 2);
  ctx.fill();

  // Filamentos y volutas gaseosas elípticas alargadas (estilo Hubble / James Webb)
  for (let i = 0; i < lobeCount; i++) {
    const angle = range(rng, 0, Math.PI * 2);
    const dist = range(rng, 0, Math.min(width, height) * 0.32);
    const cx = width * 0.5 + Math.cos(angle) * dist;
    const cy = height * 0.5 + Math.sin(angle) * (dist * 0.65);
    const radius = range(rng, Math.min(width, height) * 0.16, Math.min(width, height) * 0.32);
    const rot = range(rng, -Math.PI, Math.PI);
    const scaleX = range(rng, 1.3, 2.3);
    const scaleY = range(rng, 0.45, 0.85);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(scaleX, scaleY);

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    if (i < 5) {
      // Núcleo energético más cálido / luminoso
      grad.addColorStop(0, palette.core);
      grad.addColorStop(0.38, palette.mid);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      // Volutas exteriores translúcidas
      grad.addColorStop(0, palette.mid);
      grad.addColorStop(0.5, palette.edge);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
  return canvas;
}

/**
 * Fondo cósmico cinematográfico:
 * 1. Abismo espacial profundo con gradiente estelar multicapa.
 * 2. Velo nebuloso rico en la paleta oficial (Cyan #36a9ff, Violeta #a978ff, Magenta #ff4f64, Oro #ffd84d).
 * 3. Campo de estrellas multicapa con centelleo vivo y parallax 3D.
 * 4. Estrellas prominentes ("hero stars") con destellos difractivos de cruz estilo telescopio.
 * 5. Micro-polvo cósmico en suspensión.
 */
export function createBackground(rng: Rng, starfieldUrl: string): Background {
  let starfield: HTMLImageElement | null = null;
  let ready = false;
  const image = new Image();
  image.onload = () => { starfield = image; ready = true; };
  image.src = starfieldUrl;

  // 1. Nebulosas volumétricas compactas en la paleta de verdes y turquesas de Impulso Stellar
  // (#71e5dc verde/turquesa aliada, #4ad69a verde esmeralda, #6ee7b7 menta, #36a9ff azul estelar).
  // Se mantienen en la parte superior-izquierda para dejar limpio el espacio de la nave en primer plano.
  const clusters: NebulaCluster[] = [
    // Núcleo principal de nebulosa verde esmeralda y turquesa aliada
    {
      sprite: createNebulaSprite(rng, 460, 380, {
        core: 'rgba(113, 229, 220, 0.28)',   // Turquesa #71e5dc
        mid: 'rgba(74, 214, 154, 0.18)',     // Verde esmeralda #4ad69a
        edge: 'rgba(16, 75, 68, 0.06)',      // Verde azulado profundo
      }, 18),
      x: 320, y: 190, width: 460, height: 380,
      driftX: 1.4, driftY: 1.0, pulseSpeed: 0.045, phase: range(rng, 0, 6.28),
      baseAlpha: 0.85, parallaxFactor: 16,
    },
    // Cresta superior verde menta y cian de impulso
    {
      sprite: createNebulaSprite(rng, 400, 320, {
        core: 'rgba(110, 231, 183, 0.24)',   // Menta #6ee7b7
        mid: 'rgba(54, 169, 255, 0.16)',     // Cyan #36a9ff
        edge: 'rgba(12, 50, 70, 0.05)',
      }, 16),
      x: 210, y: 140, width: 400, height: 320,
      driftX: 1.8, driftY: 1.3, pulseSpeed: 0.05, phase: range(rng, 0, 6.28),
      baseAlpha: 0.8, parallaxFactor: 20,
    },
    // Voluta suave de polvo jade y oro estelar
    {
      sprite: createNebulaSprite(rng, 340, 280, {
        core: 'rgba(167, 243, 208, 0.20)',   // Verde agua suave #a7f3d0
        mid: 'rgba(255, 216, 77, 0.10)',     // Sutil oro estelar
        edge: 'rgba(20, 60, 48, 0.04)',
      }, 14),
      x: 430, y: 230, width: 340, height: 280,
      driftX: 1.2, driftY: 0.9, pulseSpeed: 0.04, phase: range(rng, 0, 6.28),
      baseAlpha: 0.7, parallaxFactor: 14,
    },
    // Tenue halo atmosférico en cuadrante superior derecho hacia el HUD
    {
      sprite: createNebulaSprite(rng, 360, 280, {
        core: 'rgba(113, 229, 220, 0.14)',   // Eco turquesa
        mid: 'rgba(30, 85, 80, 0.08)',
        edge: 'rgba(6, 22, 26, 0.02)',
      }, 12),
      x: 930, y: 130, width: 360, height: 280,
      driftX: 1.0, driftY: 1.2, pulseSpeed: 0.035, phase: range(rng, 0, 6.28),
      baseAlpha: 0.5, parallaxFactor: 10,
    },
  ];

  // 2. Estrellas lejanas y medias con variaciones térmicas (Espectro O, B, A, G, M)
  const starColors = [
    'rgba(215, 235, 255,',  // Blanco-azulado O/B
    'rgba(255, 255, 255,',  // Blanco puro A
    'rgba(185, 225, 255,',  // Azul cielo
    'rgba(255, 240, 200,',  // Blanco-amarillo F/G
    'rgba(230, 210, 255,',  // Violeta suave
    'rgba(255, 200, 170,',  // Ámbar tenue K/M
  ];

  const stars: Star[] = [];
  const starCount = 180;
  for (let i = 0; i < starCount; i++) {
    const isMidLayer = rng() < 0.28;
    const radius = isMidLayer ? range(rng, 1.3, 2.3) : range(rng, 0.5, 1.2);
    const colorPrefix = starColors[Math.floor(rng() * starColors.length)]!;
    stars.push({
      x: range(rng, -40, DESIGN_W + 40),
      y: range(rng, -40, DESIGN_H + 40),
      radius,
      color: colorPrefix,
      twinkleSpeed: range(rng, 0.8, 3.2),
      phase: range(rng, 0, Math.PI * 2),
      baseAlpha: isMidLayer ? range(rng, 0.65, 0.95) : range(rng, 0.35, 0.75),
      parallaxFactor: isMidLayer ? range(rng, 10, 16) : range(rng, 4, 8),
    });
  }

  // 3. Estrellas "Hero" con destellos de difracción en cruz de telescopio espacial
  const heroStars: HeroStar[] = [
    { x: 190, y: 110, radius: 2.8, spikeLength: 26, color: 'rgba(131, 212, 255, 0.9)', coreColor: '#ffffff', flareAlpha: 0.75, pulseSpeed: 0.9, phase: 0.5, parallaxFactor: 12 },
    { x: 420, y: 175, radius: 2.2, spikeLength: 18, color: 'rgba(255, 255, 255, 0.85)', coreColor: '#ffffff', flareAlpha: 0.7, pulseSpeed: 1.2, phase: 1.8, parallaxFactor: 10 },
    { x: 620, y: 85,  radius: 3.2, spikeLength: 32, color: 'rgba(54, 169, 255, 0.95)', coreColor: '#e8f6ff', flareAlpha: 0.85, pulseSpeed: 0.75, phase: 3.2, parallaxFactor: 14 },
    { x: 110, y: 390, radius: 2.4, spikeLength: 20, color: 'rgba(255, 216, 77, 0.85)', coreColor: '#fffcee', flareAlpha: 0.7, pulseSpeed: 1.1, phase: 4.1, parallaxFactor: 11 },
    { x: 540, y: 360, radius: 2.0, spikeLength: 16, color: 'rgba(255, 120, 160, 0.8)', coreColor: '#ffffff', flareAlpha: 0.65, pulseSpeed: 1.3, phase: 2.4, parallaxFactor: 13 },
    { x: 820, y: 90,  radius: 2.5, spikeLength: 22, color: 'rgba(169, 120, 255, 0.85)', coreColor: '#f5eeff', flareAlpha: 0.7, pulseSpeed: 0.85, phase: 5.0, parallaxFactor: 9 },
    { x: 740, y: 480, radius: 1.9, spikeLength: 14, color: 'rgba(131, 212, 255, 0.75)', coreColor: '#ffffff', flareAlpha: 0.6, pulseSpeed: 1.4, phase: 0.9, parallaxFactor: 12 },
    { x: 1180, y: 80, radius: 2.6, spikeLength: 24, color: 'rgba(215, 235, 255, 0.85)', coreColor: '#ffffff', flareAlpha: 0.75, pulseSpeed: 1.0, phase: 3.7, parallaxFactor: 8 },
  ];

  // 4. Motes de polvo cósmico luminoso flotando con el viento solar
  const motes: StardustMote[] = [];
  for (let i = 0; i < 40; i++) {
    const isCyan = rng() < 0.6;
    motes.push({
      x: range(rng, 0, DESIGN_W),
      y: range(rng, 0, DESIGN_H),
      size: range(rng, 1.2, 2.4),
      color: isCyan ? 'rgba(83, 212, 255,' : 'rgba(210, 160, 255,',
      speedX: range(rng, 2.5, 7.0),
      speedY: range(rng, -1.5, 1.5),
      phase: range(rng, 0, Math.PI * 2),
      alpha: range(rng, 0.25, 0.65),
    });
  }

  return {
    get ready() { return ready; },
    draw(ctx, view, t, px, py) {
      // 1. Fondo base: abismo cósmico con tenue brillo ambiental
      const baseGrad = ctx.createLinearGradient(0, 0, DESIGN_W, DESIGN_H);
      baseGrad.addColorStop(0, '#040b17');     // Brillo cósmico sutil en sector superior-izquierdo
      baseGrad.addColorStop(0.38, '#060d1b');  // Azul interestelar profundo
      baseGrad.addColorStop(0.72, '#040812');  // Vacío intergaláctico
      baseGrad.addColorStop(1, '#020409');     // Negro puro detrás del panel HUD
      ctx.fillStyle = baseGrad;
      ctx.fillRect(-80, -80, DESIGN_W + 160, DESIGN_H + 160);

      // 2. Starfield de textura base (si está disponible)
      if (starfield) {
        const scale = Math.max(DESIGN_W / starfield.width, DESIGN_H / starfield.height) * 1.06;
        const w = starfield.width * scale;
        const h = starfield.height * scale;
        const driftX = Math.sin(t * 0.006) * 14 - px * 8;
        const driftY = Math.cos(t * 0.005) * 10 - py * 6;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.45;
        ctx.drawImage(starfield, (DESIGN_W - w) / 2 + driftX, (DESIGN_H - h) / 2 + driftY, w, h);
        ctx.restore();
      }

      // 3. Dibujar las nubes de nebulosa con fusión luminosa ('screen')
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const cluster of clusters) {
        const pulse = 1 + Math.sin(t * cluster.pulseSpeed + cluster.phase) * 0.08;
        const driftOffsetX = Math.sin(t * 0.012 + cluster.phase) * (cluster.driftX * 12);
        const driftOffsetY = Math.cos(t * 0.009 + cluster.phase) * (cluster.driftY * 10);
        const posX = cluster.x + driftOffsetX - px * cluster.parallaxFactor;
        const posY = cluster.y + driftOffsetY - py * (cluster.parallaxFactor * 0.75);

        ctx.globalAlpha = Math.min(1, Math.max(0, cluster.baseAlpha * pulse));
        ctx.drawImage(
          cluster.sprite,
          posX - cluster.width * 0.5,
          posY - cluster.height * 0.5,
          cluster.width,
          cluster.height,
        );
      }
      ctx.restore();

      // 4. Estrellas multicapa con centelleo
      ctx.save();
      for (const s of stars) {
        const twinkle = Math.sin(t * s.twinkleSpeed + s.phase);
        const currentAlpha = Math.max(0.1, Math.min(1, s.baseAlpha + twinkle * 0.28));
        const posX = s.x - px * s.parallaxFactor;
        const posY = s.y - py * s.parallaxFactor;

        ctx.fillStyle = `${s.color}${currentAlpha})`;
        ctx.beginPath();
        ctx.arc(posX, posY, s.radius, 0, Math.PI * 2);
        ctx.fill();

        // Para estrellas medianas, añadir un sutil halo difuso
        if (s.radius > 1.6) {
          ctx.fillStyle = `${s.color}${currentAlpha * 0.22})`;
          ctx.beginPath();
          ctx.arc(posX, posY, s.radius * 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // 5. Estrellas "Hero" con picos de difracción de telescopio (Spikes de difracción 4-point)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const hero of heroStars) {
        const pulse = 1 + Math.sin(t * hero.pulseSpeed + hero.phase) * 0.18;
        const posX = hero.x - px * hero.parallaxFactor;
        const posY = hero.y - py * hero.parallaxFactor;
        const currentSpike = hero.spikeLength * pulse;
        const currentAlpha = hero.flareAlpha * pulse;

        // Halo radial brillante
        const haloGrad = ctx.createRadialGradient(posX, posY, 0, posX, posY, hero.radius * 5.5);
        haloGrad.addColorStop(0, hero.color);
        haloGrad.addColorStop(0.35, hero.color.replace(/[\d.]+\)$/, '0.35)'));
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(posX, posY, hero.radius * 5.5, 0, Math.PI * 2);
        ctx.fill();

        // Pico horizontal
        const hSpike = ctx.createLinearGradient(posX - currentSpike, posY, posX + currentSpike, posY);
        hSpike.addColorStop(0, 'rgba(0, 0, 0, 0)');
        hSpike.addColorStop(0.5, hero.color);
        hSpike.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = hSpike;
        ctx.fillRect(posX - currentSpike, posY - 0.75, currentSpike * 2, 1.5);

        // Pico vertical
        const vSpike = ctx.createLinearGradient(posX, posY - currentSpike, posX, posY + currentSpike);
        vSpike.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vSpike.addColorStop(0.5, hero.color);
        vSpike.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = vSpike;
        ctx.fillRect(posX - 0.75, posY - currentSpike, 1.5, currentSpike * 2);

        // Núcleo blanco concentrado
        ctx.fillStyle = hero.coreColor;
        ctx.globalAlpha = Math.min(1, currentAlpha);
        ctx.beginPath();
        ctx.arc(posX, posY, hero.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // 6. Polvo cósmico en suspensión con deriva orbital
      ctx.save();
      for (const mote of motes) {
        const driftX = (mote.x + t * mote.speedX) % (DESIGN_W + 60) - 30;
        const driftY = mote.y + Math.sin(t * 0.4 + mote.phase) * 18;
        const alpha = Math.max(0.05, Math.min(0.8, mote.alpha + Math.sin(t * 0.8 + mote.phase) * 0.2));

        ctx.fillStyle = `${mote.color}${alpha})`;
        ctx.beginPath();
        ctx.arc(driftX - px * 12, driftY - py * 10, mote.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}

