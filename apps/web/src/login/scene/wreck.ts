import type { Rng } from './rng';
import { range } from './rng';
import {
  createPool, drawPool, spawn, updatePool,
  type BlobSprites, type ParticlePool,
} from './particles';

export interface Wreck {
  update(dt: number, t: number): void;
  draw(ctx: CanvasRenderingContext2D, t: number, px: number, py: number): void;
}

interface Anchor { x: number; y: number }

/* ==========================================================================
   CONFIGURACIÓN Y ANCLAJES (Coordenadas de diseño 1280×720)
   ========================================================================== */

/** Dimensiones del sprite procedural de la nave en vuelo */
const SHIP_SPRITE_W = 780;
const SHIP_SPRITE_H = 320;

/**
 * Posición de la nave en vuelo.
 * Navega hacia adelante (derecha) en el sector inferior izquierdo y central,
 * dejando el panel holográfico del Login a la derecha completamente despejado.
 */
const SHIP_X = 26;
const SHIP_Y = 410;

/** Centro de gravedad y rotación para la actitud de vuelo */
const PIVOT_X = 380;
const PIVOT_Y = 150;

/** Focos de incendio sobre el fuselaje en vuelo (coordenadas globales exactas) */
const FIRES: readonly Anchor[] = [
  { x: SHIP_X + 430, y: SHIP_Y + 128 }, // 0: Brecha de impacto directo en el fuselaje central
  { x: SHIP_X + 80,  y: SHIP_Y + 196 }, // 1: Tobera inferior averiada ardiendo en pleno vuelo
  { x: SHIP_X + 340, y: SHIP_Y + 86 },  // 2: Batería dorsal de misiles chamuscada
  { x: SHIP_X + 380, y: SHIP_Y + 185 }, // 3: Ala de combate / sponsón perforado
  { x: SHIP_X + 240, y: SHIP_Y + 208 }, // 4: Fuga de combustible en quilla ventral
];

/** Focos de humo denso arrastrado en la estela de vuelo */
const SMOKES: readonly Anchor[] = [
  { x: SHIP_X + 420, y: SHIP_Y + 124 }, // Fuselaje central
  { x: SHIP_X + 70,  y: SHIP_Y + 192 }, // Tobera destruida
  { x: SHIP_X + 335, y: SHIP_Y + 82 },  // Batería dorsal
  { x: SHIP_X + 375, y: SHIP_Y + 180 }, // Ala perforada
];

/** Epicentro de la avería crítica en vuelo */
const BREACH_CORE: Anchor = { x: SHIP_X + 430, y: SHIP_Y + 128 };

/** Posición global de la tobera averiada en popa */
const DAMAGED_ENGINE: Anchor = { x: SHIP_X + 80, y: SHIP_Y + 196 };

/**
 * Balizas tácticas de emergencia militar en vuelo:
 * 0: Cúpula del puente de mando
 * 1: Aleta dorsal de estabilización
 * 2: Extremo del ala / cañón kinetic de combate
 * 3: Bahía de motores en popa
 * 4: Espolón sensor de proa
 */
const LIGHTS: readonly Anchor[] = [
  { x: SHIP_X + 460, y: SHIP_Y + 76 },  // Puente
  { x: SHIP_X + 270, y: SHIP_Y + 54 },  // Aleta dorsal
  { x: SHIP_X + 485, y: SHIP_Y + 192 }, // Punta de ala
  { x: SHIP_X + 115, y: SHIP_Y + 114 }, // Bahía de motores
  { x: SHIP_X + 724, y: SHIP_Y + 138 }, // Espolón de proa
];

/* ==========================================================================
   GEOMETRÍA PROCEDURAL: NAVE FUTURISTA DE COMBATE EN VUELO
   ========================================================================== */

/**
 * Traza la silueta exterior completa de la nave militar en vuelo:
 * Perfil en cuña afilada, espina dorsal stealth escalonada,
 * aletas estabilizadoras y espolón frontal de combate.
 */
function traceWarshipInFlight(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  // 1 · Popa y mamparo vertical de motores
  ctx.moveTo(96, 114);
  // Escudo térmico superior
  ctx.lineTo(142, 102);
  // Espina dorsal trasera y bahía de disipadores
  ctx.lineTo(215, 92);
  // Aleta estabilizadora dorsal trasera
  ctx.lineTo(240, 52);
  ctx.lineTo(294, 56);
  ctx.lineTo(315, 86);
  // Módulo de sensores y celdas VLS
  ctx.lineTo(385, 84);
  // Cúpula blindada de la torre de mando / cabina stealth
  ctx.lineTo(418, 68);
  ctx.lineTo(495, 68);
  ctx.lineTo(534, 88);
  // Cubierta delantera en cuña
  ctx.lineTo(608, 108);
  ctx.lineTo(670, 126);

  // 2 · Punta de proa afilada (daga / espolón frontal de combate)
  ctx.lineTo(724, 138);

  // 3 · Quilla ventral y perfil inferior
  ctx.lineTo(688, 156);
  ctx.lineTo(615, 178);
  ctx.lineTo(492, 198);
  ctx.lineTo(365, 212);
  ctx.lineTo(228, 206);
  ctx.lineTo(144, 195);
  ctx.lineTo(96, 186);

  // 4 · Cierre de popa entre toberas
  ctx.lineTo(96, 114);
  ctx.closePath();
}

/**
 * Traza el ala de combate exterior en flecha invertida (sponsón alar frontal).
 */
function traceForwardWing(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(270, 152);
  ctx.lineTo(345, 206);
  ctx.lineTo(448, 218);
  ctx.lineTo(485, 192); // Hardpoint de armamento kinetic
  ctx.lineTo(452, 170);
  ctx.lineTo(318, 154);
  ctx.closePath();
}

/* ==========================================================================
   PINTURA PROCEDURAL, BLINDAJE, CABINA Y DAÑO EN VUELO
   ========================================================================== */

/**
 * Dibuja la cabina de mando con visor blindado, horizonte digital
 * y resplandor interior de alarma de combate.
 */
function drawCockpitBridge(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  // Visor panorámico blindado
  ctx.fillStyle = '#050a10';
  ctx.beginPath();
  ctx.moveTo(436, 75);
  ctx.lineTo(486, 75);
  ctx.lineTo(480, 81);
  ctx.lineTo(440, 81);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(113, 229, 220, 0.85)';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Resplandor interior de combate (alerta roja)
  const visorGlow = ctx.createLinearGradient(436, 75, 486, 81);
  visorGlow.addColorStop(0, 'rgba(255, 40, 40, 0.3)');
  visorGlow.addColorStop(0.5, 'rgba(255, 80, 80, 0.95)');
  visorGlow.addColorStop(1, 'rgba(255, 40, 40, 0.35)');
  ctx.fillStyle = visorGlow;
  ctx.fill();

  // Halo ambiental exterior sobre el blindaje de la torre
  const visorHalo = ctx.createRadialGradient(461, 78, 2, 461, 78, 26);
  visorHalo.addColorStop(0, 'rgba(255, 50, 50, 0.5)');
  visorHalo.addColorStop(1, 'rgba(255, 50, 50, 0)');
  ctx.fillStyle = visorHalo;
  ctx.fillRect(430, 64, 64, 28);
  ctx.restore();
}

/**
 * Dibuja el daño de batalla en pleno vuelo: impacto de proyectil,
 * metal fundido incandescente y desgarro estructural que arde.
 */
function drawInFlightDamage(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  // 1 · Quemadura por haz de plasma cruzando el fuselaje
  const plasmaBurn = ctx.createRadialGradient(380, 135, 10, 380, 135, 90);
  plasmaBurn.addColorStop(0, 'rgba(10, 6, 6, 0.92)');
  plasmaBurn.addColorStop(0.4, 'rgba(50, 24, 16, 0.65)');
  plasmaBurn.addColorStop(0.8, 'rgba(90, 45, 75, 0.25)');
  plasmaBurn.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = plasmaBurn;
  ctx.beginPath();
  ctx.ellipse(380, 135, 85, 32, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // 2 · La brecha principal ardiente en el fuselaje (chapas levantadas y retorcidas)
  ctx.fillStyle = '#04070a';
  ctx.beginPath();
  ctx.moveTo(392, 118);
  ctx.lineTo(440, 112);
  ctx.lineTo(452, 134);
  ctx.lineTo(418, 142);
  ctx.lineTo(388, 132);
  ctx.closePath();
  ctx.fill();

  // Vigas I y tuberías rotas expuestas dentro de la brecha
  ctx.strokeStyle = 'rgba(90, 125, 155, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(404, 118);
  ctx.lineTo(404, 138);
  ctx.moveTo(422, 115);
  ctx.lineTo(422, 140);
  ctx.moveTo(436, 114);
  ctx.lineTo(436, 135);
  ctx.stroke();

  // Cables cortados
  ctx.strokeStyle = '#e68444';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(410, 122);
  ctx.lineTo(396, 130);
  ctx.stroke();

  ctx.strokeStyle = '#50d8e8';
  ctx.beginPath();
  ctx.moveTo(428, 126);
  ctx.lineTo(416, 138);
  ctx.stroke();

  // Reborde de blindaje fundido incandescente (al rojo vivo)
  const slagGrad = ctx.createLinearGradient(388, 112, 452, 142);
  slagGrad.addColorStop(0, 'rgba(255, 90, 15, 0.85)');
  slagGrad.addColorStop(0.5, 'rgba(255, 235, 120, 0.98)');
  slagGrad.addColorStop(1, 'rgba(240, 45, 10, 0.8)');
  ctx.strokeStyle = slagGrad;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // 3 · Cráteres de metralla cinética con reborde brillante
  const hits = [
    { x: 260, y: 138, r: 5 },
    { x: 520, y: 120, r: 4.5 },
    { x: 330, y: 195, r: 4 },
  ];
  for (const h of hits) {
    ctx.fillStyle = 'rgba(5, 5, 8, 0.9)';
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#020406';
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(175, 215, 245, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Pinta paneles facetados militares, disipadores, celdas de armas y líneas de blindaje.
 */
function paintWarshipDetails(ctx: CanvasRenderingContext2D, width: number): void {
  // 1 · Variaciones tonales en paneles adyacentes de aleación compuesta
  ctx.fillStyle = 'rgba(28, 46, 64, 0.35)';
  ctx.beginPath();
  ctx.moveTo(215, 92);
  ctx.lineTo(315, 86);
  ctx.lineTo(290, 142);
  ctx.lineTo(195, 144);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(16, 28, 42, 0.5)';
  ctx.beginPath();
  ctx.moveTo(385, 84);
  ctx.lineTo(534, 88);
  ctx.lineTo(495, 140);
  ctx.lineTo(365, 140);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(32, 50, 70, 0.3)';
  ctx.beginPath();
  ctx.moveTo(534, 88);
  ctx.lineTo(670, 126);
  ctx.lineTo(630, 168);
  ctx.lineTo(495, 140);
  ctx.closePath();
  ctx.fill();

  // 2 · Líneas de quiebre facetado (aerodinámica stealth militar)
  ctx.strokeStyle = 'rgba(115, 160, 195, 0.6)';
  ctx.lineWidth = 1.6;

  // Línea dorsal superior
  ctx.beginPath();
  ctx.moveTo(142, 102);
  ctx.lineTo(385, 88);
  ctx.lineTo(534, 90);
  ctx.lineTo(670, 126);
  ctx.stroke();

  // Línea media de fuselaje
  ctx.beginPath();
  ctx.moveTo(105, 148);
  ctx.lineTo(270, 142);
  ctx.lineTo(450, 138);
  ctx.lineTo(688, 156);
  ctx.stroke();

  // Línea ventral de quilla
  ctx.beginPath();
  ctx.moveTo(110, 180);
  ctx.lineTo(280, 186);
  ctx.lineTo(492, 184);
  ctx.lineTo(615, 178);
  ctx.stroke();

  // Línea de energía / escudo táctico cyan tenue a lo largo del chine
  ctx.strokeStyle = 'rgba(113, 229, 220, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(150, 146);
  ctx.lineTo(680, 154);
  ctx.stroke();

  // 3 · Juntas de paneles transversales biseladas
  for (let i = 1; i <= 7; i++) {
    const x = 135 + i * 68;
    ctx.strokeStyle = 'rgba(6, 12, 18, 0.85)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, 96 + i * 2);
    ctx.lineTo(x - 24, 204);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(130, 175, 210, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 1, 96 + i * 2);
    ctx.lineTo(x - 23, 204);
    ctx.stroke();
  }

  // 4 · Rejillas de disipación térmica activa (slats paralelos)
  ctx.strokeStyle = 'rgba(145, 195, 230, 0.75)';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 8; i++) {
    const x = 328 + i * 6.5;
    ctx.beginPath();
    ctx.moveTo(x, 82);
    ctx.lineTo(x - 3.5, 88);
    ctx.stroke();
  }

  // 5 · Celdas de lanzamiento vertical de misiles (VLS)
  ctx.fillStyle = '#060e15';
  ctx.strokeStyle = 'rgba(110, 155, 185, 0.65)';
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 5; i++) {
    const x = 540 + i * 15;
    ctx.fillRect(x, 98, 10, 6);
    ctx.strokeRect(x, 98, 10, 6);
  }

  // 6 · Canaleta de cables blindados con abrazaderas metálicas
  ctx.strokeStyle = '#14202c';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(140, 166);
  ctx.lineTo(width - 150, 166);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(105, 148, 180, 0.65)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(140, 165);
  ctx.lineTo(width - 150, 165);
  ctx.stroke();

  ctx.fillStyle = '#506c86';
  for (let x = 170; x < width - 160; x += 48) {
    ctx.fillRect(x, 163, 3.5, 6);
  }

  // 7 · Ala / Sponsón de combate en primer plano
  ctx.save();
  traceForwardWing(ctx);
  const wingGrad = ctx.createLinearGradient(270, 152, 485, 218);
  wingGrad.addColorStop(0, '#1c2d3e');
  wingGrad.addColorStop(0.5, '#253c52');
  wingGrad.addColorStop(1, '#101a26');
  ctx.fillStyle = wingGrad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(140, 190, 230, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cañón kinetic / pod de combate montado en la punta del ala
  ctx.fillStyle = '#091018';
  ctx.fillRect(475, 186, 26, 6);
  ctx.strokeStyle = 'rgba(125, 175, 215, 0.8)';
  ctx.strokeRect(475, 186, 26, 6);

  // Boca del cañón
  ctx.fillStyle = '#030508';
  ctx.fillRect(501, 187, 3, 4);
  ctx.restore();

  // 8 · Puente de mando
  drawCockpitBridge(ctx);

  // 9 · Aguja de sensores frontal de proa
  ctx.strokeStyle = 'rgba(185, 230, 255, 0.95)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(724, 138);
  ctx.lineTo(752, 140);
  ctx.stroke();

  // 10 · Daño de combate en vuelo
  drawInFlightDamage(ctx);
}

/**
 * Crea el sprite en memoria para la nave completa con iluminación volumétrica estelar.
 */
function createWarshipSprite(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SHIP_SPRITE_W;
  canvas.height = SHIP_SPRITE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Base metálica grafito oscura
  traceWarshipInFlight(ctx);
  ctx.fillStyle = '#111b26';
  ctx.fill();

  ctx.save();
  traceWarshipInFlight(ctx);
  ctx.clip();

  // Iluminación volumétrica: reflejo frío de estrellas lejanas arriba y sombra en la quilla
  const shade = ctx.createLinearGradient(0, 40, 0, SHIP_SPRITE_H);
  shade.addColorStop(0, 'rgba(115, 165, 205, 0.55)');
  shade.addColorStop(0.25, 'rgba(48, 72, 95, 0.25)');
  shade.addColorStop(0.7, 'rgba(18, 28, 40, 0.12)');
  shade.addColorStop(1, 'rgba(2, 6, 10, 0.88)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, SHIP_SPRITE_W, SHIP_SPRITE_H);

  paintWarshipDetails(ctx, SHIP_SPRITE_W);
  ctx.restore();

  // Filo exterior táctico iluminado
  traceWarshipInFlight(ctx);
  ctx.strokeStyle = 'rgba(135, 185, 225, 0.75)';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  return canvas;
}

/* ==========================================================================
   PROPULSIÓN EN VUELO: MOTORES Y CHORROS DE PLASMA DE ALTA ENERGÍA
   (Renderizados en el espacio de coordenadas del sprite: X = 96 es la popa)
   ========================================================================== */

/**
 * Dibuja las toberas mecánicas de la popa y los chorros de plasma en vuelo.
 * Se ejecuta alineado exactamente en el sistema local del sprite (0..780, 0..320).
 */
function drawEnginePropulsion(ctx: CanvasRenderingContext2D, t: number): void {
  const nozzles = [
    { y: 120, rx: 14, ry: 15, length: 32, isDamaged: false },
    { y: 158, rx: 18, ry: 20, length: 42, isDamaged: false }, // Motor principal pesado
    { y: 196, rx: 13, ry: 14, length: 28, isDamaged: true },  // Motor inferior dañado
  ];

  for (const n of nozzles) {
    const xBase = 96;
    const xExit = xBase - n.length;

    // Carcasa metálica de tobera
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xBase, n.y - n.ry);
    ctx.lineTo(xExit, n.y - n.ry * 0.78);
    ctx.lineTo(xExit, n.y + n.ry * 0.78);
    ctx.lineTo(xBase, n.y + n.ry);
    ctx.closePath();

    const bellGrad = ctx.createLinearGradient(xExit, n.y, xBase, n.y);
    bellGrad.addColorStop(0, '#0a0e14');
    bellGrad.addColorStop(0.4, '#24201e');
    bellGrad.addColorStop(1, '#141e2a');
    ctx.fillStyle = bellGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(120, 165, 195, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Anillos térmicos de refuerzo
    ctx.strokeStyle = 'rgba(85, 125, 155, 0.6)';
    ctx.lineWidth = 1.2;
    for (let r = 1; r <= 3; r++) {
      const ringX = xExit + (r / 4) * n.length;
      ctx.beginPath();
      ctx.moveTo(ringX, n.y - n.ry * 0.85);
      ctx.lineTo(ringX, n.y + n.ry * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  // CHORROS DE PROPULSIÓN EN VUELO (Empuje activo saliendo hacia la izquierda)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 1 · Motor Superior: Chorro de plasma cyan supersónico
  const topFlicker = 0.88 + 0.12 * Math.sin(t * 36);
  const topLength = 130 * topFlicker;
  const topJet = ctx.createLinearGradient(64, 120, 64 - topLength, 120);
  topJet.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  topJet.addColorStop(0.2, 'rgba(113, 229, 220, 0.85)');
  topJet.addColorStop(0.6, 'rgba(30, 120, 240, 0.45)');
  topJet.addColorStop(1, 'rgba(30, 80, 200, 0)');
  ctx.fillStyle = topJet;
  ctx.beginPath();
  ctx.moveTo(64, 110);
  ctx.lineTo(64 - topLength, 120);
  ctx.lineTo(64, 130);
  ctx.closePath();
  ctx.fill();

  // 2 · Motor Central (Propulsor Principal Pesado): Llamarada dominante con Mach diamonds
  const mainFlicker = 0.92 + 0.08 * Math.sin(t * 44) + 0.04 * Math.sin(t * 92);
  const mainLength = 210 * mainFlicker;
  const mainJet = ctx.createLinearGradient(54, 158, 54 - mainLength, 158);
  mainJet.addColorStop(0, 'rgba(255, 255, 255, 1)');
  mainJet.addColorStop(0.12, 'rgba(140, 250, 240, 0.92)');
  mainJet.addColorStop(0.45, 'rgba(50, 150, 255, 0.6)');
  mainJet.addColorStop(0.85, 'rgba(25, 70, 220, 0.22)');
  mainJet.addColorStop(1, 'rgba(10, 30, 180, 0)');
  ctx.fillStyle = mainJet;
  ctx.beginPath();
  ctx.moveTo(54, 142);
  ctx.lineTo(54 - mainLength, 158);
  ctx.lineTo(54, 174);
  ctx.closePath();
  ctx.fill();

  // Mach diamonds (rombos de compresión supersónica en el núcleo del plasma)
  ctx.fillStyle = '#ffffff';
  for (let i = 1; i <= 4; i++) {
    const dx = 54 - i * 36;
    const dy = 158;
    const size = 5.5 - i * 0.9;
    ctx.beginPath();
    ctx.moveTo(dx - size * 2.2, dy);
    ctx.lineTo(dx, dy - size);
    ctx.lineTo(dx + size * 2.2, dy);
    ctx.lineTo(dx, dy + size);
    ctx.closePath();
    ctx.fill();
  }

  // 3 · Motor Inferior (Dañado / Combustión inestable con fuego arrastrado)
  const damagedFlicker = 0.65 + 0.35 * Math.sin(t * 19 + Math.sin(t * 33));
  const flameLength = 150 * damagedFlicker;
  const dirtyJet = ctx.createLinearGradient(68, 196, 68 - flameLength, 196);
  dirtyJet.addColorStop(0, 'rgba(255, 235, 150, 0.98)');
  dirtyJet.addColorStop(0.25, 'rgba(255, 120, 40, 0.88)');
  dirtyJet.addColorStop(0.65, 'rgba(220, 45, 10, 0.45)');
  dirtyJet.addColorStop(1, 'rgba(150, 20, 5, 0)');
  ctx.fillStyle = dirtyJet;
  ctx.beginPath();
  ctx.moveTo(68, 187);
  ctx.lineTo(68 - flameLength, 196 + Math.sin(t * 24) * 6);
  ctx.lineTo(68, 205);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/* ==========================================================================
   ARCOS ELÉCTRICOS BIFURCADOS EN VUELO
   ========================================================================== */

/**
 * Traza arcos de alta tensión crepitando sobre las zonas dañadas mientras la nave vuela.
 */
function drawInFlightArc(
  ctx: CanvasRenderingContext2D,
  p1: Anchor,
  p2: Anchor,
  seed: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);

  function drawSegment(x1: number, y1: number, x2: number, y2: number, steps: number, jitterAmp: number): void {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      const noise = Math.sin(seed + i * 43.7) * jitterAmp * (1 - Math.abs(f - 0.5) * 1.5);
      const perpX = -(y2 - y1) * 0.2 * (noise / jitterAmp);
      const perpY = (x2 - x1) * 0.2 * (noise / jitterAmp);
      const cx = x1 + (x2 - x1) * f + perpX;
      const cy = y1 + (y2 - y1) * f + perpY;
      ctx.lineTo(cx, cy);

      if (i === Math.floor(steps / 2) && Math.abs(noise) > jitterAmp * 0.3) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + perpX * 2.2, cy + perpY * 2.2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Halo exterior cyan
  ctx.strokeStyle = '#71e5dc';
  ctx.lineWidth = 3;
  drawSegment(p1.x, p1.y, p2.x, p2.y, 8, 20);

  // Núcleo blanco
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.3;
  drawSegment(p1.x, p1.y, p2.x, p2.y, 8, 18);

  ctx.restore();
}

/* ==========================================================================
   CONSTRUCTOR PRINCIPAL: CREATE WRECK (NAVE EN VUELO ARDIENDO)
   ========================================================================== */

/**
 * Orquestador de la nave futurista en vuelo ardiendo:
 * Renderizado de alto rendimiento a 60 FPS con propulsores activos,
 * fuego y humo arrastrados horizontalmente hacia atrás por la velocidad,
 * chispas balísticas en estela y oscilaciones dinámicas de actitud de vuelo.
 */
export function createWreck(rng: Rng, sprites: BlobSprites): Wreck {
  const warshipSprite = createWarshipSprite();

  const pools = {
    smoke: createPool(85),
    fire: createPool(140),
    sparks: createPool(55),
    debris: createPool(30),
  } satisfies Record<string, ParticlePool>;

  const fireAccumulators = FIRES.map(() => 0);
  const smokeAccumulators = SMOKES.map(() => 0);

  let sparkIn = 0.5;
  let arcIn = 1.9;
  let arcLife = 0;
  let arcSeed = 0;
  let explosionIn = 5.0;
  let flash = 0;
  let flashAt: Anchor = BREACH_CORE;

  /**
   * Genera fuego arrancado hacia atrás por la velocidad de avance de la nave (vx < 0).
   */
  function spawnInFlightFire(anchor: Anchor, scale = 1): void {
    spawn(pools.fire, {
      tint: 'fire',
      x: anchor.x + range(rng, -10, 10),
      y: anchor.y + range(rng, -5, 5),
      // Arrastre horizontal violento hacia atrás debido al avance de la nave
      vx: range(rng, -240, -120) * scale,
      vy: range(rng, -16, 16) * scale,
      life: range(rng, 0.42, 0.98),
      size: range(rng, 16, 36) * scale,
      growth: -6 * scale,
    });
  }

  /**
   * Genera columnas de humo que se expanden en la estela de vuelo.
   */
  function spawnInFlightSmoke(anchor: Anchor): void {
    spawn(pools.smoke, {
      tint: 'smoke',
      x: anchor.x + range(rng, -10, 10),
      y: anchor.y,
      vx: range(rng, -180, -90),
      vy: range(rng, -15, 20),
      life: range(rng, 2.6, 4.6),
      size: range(rng, 28, 48),
      growth: 16,
    });
  }

  /**
   * Micro-explosión de munición / reactor en pleno vuelo.
   */
  function explode(): void {
    const anchor = FIRES[Math.floor(rng() * FIRES.length)] ?? FIRES[0]!;
    flash = 1;
    flashAt = anchor;

    // Ráfaga súbita de fuego
    for (let i = 0; i < 18; i++) {
      spawnInFlightFire({ x: anchor.x + range(rng, -24, 24), y: anchor.y + range(rng, -16, 16) }, 1.35);
    }

    // Chispas de alta velocidad lanzadas a la estela
    for (let i = 0; i < 16; i++) {
      const angle = range(rng, Math.PI * 0.78, Math.PI * 1.22);
      const speed = range(rng, 200, 480);
      spawn(pools.sparks, {
        tint: 'spark',
        x: anchor.x,
        y: anchor.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: range(rng, 0.25, 0.65),
        size: 1,
        gravity: 35,
      });
    }

    // Fragmentos metálicos arrancados
    for (let i = 0; i < 8; i++) {
      spawn(pools.debris, {
        tint: 'debris',
        x: anchor.x,
        y: anchor.y,
        vx: range(rng, -190, -70),
        vy: range(rng, -50, 50),
        life: range(rng, 2.0, 3.8),
        size: range(rng, 4, 10),
        spin: range(rng, -4, 4),
        gravity: 20,
      });
    }

    // Gran bocanada de humo
    spawn(pools.smoke, {
      tint: 'smoke',
      x: anchor.x,
      y: anchor.y,
      vx: range(rng, -150, -70),
      vy: range(rng, -20, 20),
      life: 5.0,
      size: 68,
      growth: 24,
    });
  }

  return {
    update(dt, t) {
      // 1 · Fuego continuo arrancado por el avance
      FIRES.forEach((anchor, index) => {
        const rate = index === 0 ? 22 : 11;
        fireAccumulators[index] = (fireAccumulators[index] ?? 0) + dt * rate;
        while ((fireAccumulators[index] ?? 0) >= 1) {
          fireAccumulators[index] = (fireAccumulators[index] ?? 0) - 1;
          spawnInFlightFire(anchor);
        }
      });

      // 2 · Columnas de humo en la estela
      SMOKES.forEach((anchor, index) => {
        const rate = index === 0 ? 8.5 : 5;
        smokeAccumulators[index] = (smokeAccumulators[index] ?? 0) + dt * rate;
        while ((smokeAccumulators[index] ?? 0) >= 1) {
          smokeAccumulators[index] = (smokeAccumulators[index] ?? 0) - 1;
          spawnInFlightSmoke(anchor);
        }
      });

      // 3 · Chispas balísticas arrancadas en la estela
      sparkIn -= dt;
      if (sparkIn <= 0) {
        const anchor = FIRES[Math.floor(rng() * FIRES.length)] ?? FIRES[0]!;
        for (let i = 0; i < 6; i++) {
          const angle = range(rng, Math.PI * 0.82, Math.PI * 1.18);
          const speed = range(rng, 180, 400);
          spawn(pools.sparks, {
            tint: 'spark',
            x: anchor.x,
            y: anchor.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: range(rng, 0.3, 0.7),
            size: 1,
            gravity: 25,
          });
        }
        sparkIn = range(rng, 0.35, 1.1);
      }

      // 4 · Arcos eléctricos intermitentes
      arcIn -= dt;
      if (arcIn <= 0) {
        arcLife = 0.11;
        arcSeed = rng() * 1000;
        arcIn = range(rng, 1.8, 4.2);
      }
      arcLife = Math.max(0, arcLife - dt);

      // 5 · Micro-explosiones ocasionales
      explosionIn -= dt;
      if (explosionIn <= 0) {
        explode();
        explosionIn = range(rng, 5.5, 12.0);
      }
      flash = Math.max(0, flash - dt * 3.6);

      // Actualizar pools de partículas
      updatePool(pools.smoke, dt);
      updatePool(pools.fire, dt);
      updatePool(pools.sparks, dt);
      updatePool(pools.debris, dt);

      // Fuego extra pulsante en la brecha del fuselaje
      if (Math.sin(t * 3.0) > 0.25) spawnInFlightFire(BREACH_CORE, 1.25);
    },

    draw(ctx, t, px, py) {
      ctx.save();
      // Paralaje sutil reactivo al ratón
      ctx.translate(-px * 44, -py * 32);

      // CAPA 1: Estela de humo arrastrada detrás de la nave en vuelo
      drawPool(ctx, pools.smoke, sprites);

      // CAPA 2: Dinámica de actitud de vuelo y cuerpo de la nave
      // Micro-vibración de propulsión + cabeceo suave en vuelo
      const engineBuzz = Math.sin(t * 32) * 0.7;
      const flightHeave = Math.sin(t * 0.75) * 5;
      const flightPitch = -0.065 + Math.sin(t * 0.38) * 0.009;

      ctx.save();
      ctx.translate(SHIP_X + PIVOT_X, SHIP_Y + PIVOT_Y + flightHeave + engineBuzz);
      ctx.rotate(flightPitch);

      // Alinear con el sistema de coordenadas del sprite
      ctx.save();
      ctx.translate(-PIVOT_X, -PIVOT_Y);

      // 2.1 · Propulsores activos y chorros de plasma (en la popa X = 96)
      drawEnginePropulsion(ctx, t);

      // 2.2 · Fuselaje de la nave de combate
      ctx.drawImage(warshipSprite, 0, 0);
      ctx.restore();

      ctx.restore();

      // CAPA 3: Iluminación Aditiva (Fuego que se quema, Chispas, Arcos, Balizas)
      ctx.globalCompositeOperation = 'lighter';

      // 3.1 · Llamas de la brecha y zonas que se queman
      drawPool(ctx, pools.fire, sprites);

      // Resplandor ardiente pulsante en la brecha del fuselaje
      const fireGlow = 0.55 + 0.3 * Math.sin(t * 6.2) + 0.15 * Math.sin(t * 15.3);
      ctx.globalAlpha = Math.max(0, fireGlow) * 0.85;
      ctx.drawImage(sprites.fire, BREACH_CORE.x - 90, BREACH_CORE.y - 85, 180, 170);

      // Resplandor en la tobera averiada
      ctx.globalAlpha = 0.7 + 0.25 * Math.sin(t * 5.1);
      ctx.drawImage(sprites.fire, DAMAGED_ENGINE.x - 30, DAMAGED_ENGINE.y - 28, 60, 56);

      // 3.2 · Balizas tácticas de emergencia militar en vuelo (asíncronas)
      for (const [index, light] of LIGHTS.entries()) {
        let isLit = false;
        if (index === 0) {
          // Cúpula: doble flash rápido de combate
          isLit = Math.sin(t * 14) > 0.65;
        } else if (index === 1) {
          // Aleta dorsal: advertencia táctica
          isLit = Math.sin(t * 4.4) > 0.3;
        } else if (index === 2) {
          // Punta de ala: parpadeo irregular dañado
          isLit = Math.sin(t * 7.5 + Math.sin(t * 16)) > 0.35;
        } else if (index === 3) {
          // Bahía de motores: parpadeo constante
          isLit = Math.sin(t * 3.3) > 0.45;
        } else {
          // Punta de proa: estrobo de navegación
          isLit = Math.sin(t * 2.5) > 0.4;
        }

        if (isLit) {
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#ff2b2b';
          ctx.beginPath();
          ctx.arc(light.x, light.y + flightHeave * 0.5, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.drawImage(sprites.glow, light.x - 14, light.y + flightHeave * 0.5 - 14, 28, 28);
        }
      }

      // 3.3 · Arcos eléctricos de cortocircuito en vuelo
      if (arcLife > 0) {
        drawInFlightArc(
          ctx,
          BREACH_CORE,
          { x: BREACH_CORE.x - 65, y: BREACH_CORE.y - 20 },
          arcSeed,
          arcLife * 12,
        );

        if (Math.sin(arcSeed) > 0) {
          drawInFlightArc(
            ctx,
            DAMAGED_ENGINE,
            { x: DAMAGED_ENGINE.x - 45, y: DAMAGED_ENGINE.y - 12 },
            arcSeed + 99,
            arcLife * 9,
          );
        }
      }

      // 3.4 · Destello de micro-explosión
      if (flash > 0) {
        const bloom = ctx.createRadialGradient(flashAt.x, flashAt.y, 0, flashAt.x, flashAt.y, 340);
        bloom.addColorStop(0, `rgba(255, 230, 180, ${0.55 * flash})`);
        bloom.addColorStop(0.35, `rgba(255, 150, 85, ${0.25 * flash})`);
        bloom.addColorStop(1, 'rgba(255, 110, 70, 0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = bloom;
        ctx.fillRect(flashAt.x - 340, flashAt.y - 340, 680, 680);
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // CAPA 4: Chispas y escombros incandescentes arrastrados en la estela
      drawPool(ctx, pools.sparks, sprites);
      drawPool(ctx, pools.debris, sprites);

      ctx.restore();
    },
  };
}
