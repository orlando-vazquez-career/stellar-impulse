import { AudioChannelBus } from '../audio-mix';
import { ANOMALY_WORDS } from './anomaly-words';

export interface AnomalyScene {
  start(): void;
  stop(): void;
  resize(): void;
  setPointer(x: number, y: number): void;
}
export interface AnomalyOptions {
  /** A strong interference started: it lasts `seconds`, with `strength` from 0 to 1. */
  onBurst?(seconds: number, strength: number): void;
  /**
   * Every frame of a burst: how far the picture slips sideways, in pixels, and the push of the shock wave (-1 to 1).
   * Called once more with zeros when the burst is over.
   */
  onWarp?(slip: number, pulse: number): void;
  soundEnabled?(): boolean;
}

/** The hole's disc is seen almost edge-on: its far side bends over the top, as light does around a black hole. */
const DISC_TILT = 0.24;
const DISC_INNER = 1.55;
const DISC_OUTER = 4.7;
const MAX_DUST = 5200;
/** How far the hole follows the pointer, in CSS pixels. */
const DRIFT_X = 18;
const DRIFT_Y = 12;
const FAR = 1e5;
/** Quality steps, walked down while frames stay slow: resolution caps and the share of disc streaks drawn. */
const TIERS = [
  { ratio: 1.5, frontRatio: 1.5, embers: 1 },
  { ratio: 1, frontRatio: 1.5, embers: 0.7 },
  { ratio: 1, frontRatio: 1, embers: 0.42 },
  { ratio: 0.75, frontRatio: 1, embers: 0.28 },
] as const;
/** Mean frame time, in ms, above which the scene steps down a tier. */
const SLOW_FRAME = 21;
const FRAME_WINDOW = 30;
const TIER_KEY = 'impulso.anomaly-tier';
/** The tier this machine settled on, remembered across reloads so the lobby does not open slow and then recover. */
let settledTier = readTier();
function readTier(): number {
  try {
    const stored = Number(localStorage.getItem(TIER_KEY));
    return Number.isInteger(stored) && stored >= 0 && stored < TIERS.length ? stored : 0;
  } catch {
    return 0;
  }
}
function rememberTier(tier: number): void {
  settledTier = tier;
  try { localStorage.setItem(TIER_KEY, String(tier)); } catch { /* Private mode: it is only remembered until the page reloads. */ }
}
const STAR_COLOR = 'rgb(190, 215, 255)';
const DUST_LEVELS = 8;
/** Dust colours by tint and fade level, built once: thousands of grains share these few styles. */
const DUST_STYLES: readonly string[] = ([['255, 60, 130', 0.9], ['120, 225, 255', 0.95], ['215, 205, 255', 0.9]] as const)
  .flatMap(([rgb, peak]) => Array.from({ length: DUST_LEVELS }, (_, level) => `rgba(${rgb}, ${((level + 0.5) / DUST_LEVELS * peak).toFixed(3)})`));
const GLYPHS = '01<>/#%&$ΞΛ▚▞░▒';
const FONT = '"Share Tech Mono", "JetBrains Mono", ui-monospace, Consolas, monospace';

interface Star { r: number; a: number; speed: number; size: number; twinkle: number }
interface Ember { r: number; a: number; speed: number; length: number; width: number; heat: number; color: string }
/** A stretch of the picture that loses sync and slides sideways while it drifts up or down. */
interface Tear { y: number; drift: number; height: number; shift: number; phase: number }
interface Burst { start: number; seconds: number; strength: number; tears: Tear[] }
interface Word { text: string; x: number; y: number; size: number; born: number; hold: number; seed: number }
interface Dust { x: number; y: number; vx: number; vy: number; life: number; span: number; seed: number; tint: number }
/** The hole on screen; `dx`/`dy` is its pointer drift in whole device pixels. */
interface Hole { x: number; y: number; radius: number; dx: number; dy: number }
/** A layer painted once; `left`/`top` is its corner in device pixels while the hole is at rest. */
interface Sprite { canvas: HTMLCanvasElement; left: number; top: number }

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lobby backdrop for Trascendencia Estelar: a black hole with its accretion disc, and a signal breaking in.
 * `back` sits behind the lobby panels; `front` is a click-through layer above them, where the interference,
 * the intercepted words and the dust they crumble into are drawn.
 */
export function createAnomalyScene(back: HTMLCanvasElement, front: HTMLCanvasElement | null, options: AnomalyOptions = {}): AnomalyScene {
  const backContext = back.getContext('2d', { alpha: false });
  const frontContext = front?.getContext('2d') ?? null;
  if (!backContext) return { start() {}, stop() {}, resize() {}, setPointer() {} };
  const ctx: CanvasRenderingContext2D = backContext;
  const random = seeded(20261009);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0, height = 0, ratio = 1, frontRatio = 1;
  let running = false, raf = 0, last = 0, clock = 0;
  let tier = settledTier;
  let frameSum = 0, frames = 0, slowWindows = 0, warming = true;
  let baked: { backdrop: Sprite; glow: Sprite; ring: Sprite } | null = null;
  let strips: HTMLCanvasElement | null = null;
  let frontClear = false;
  let warping = false;
  const pointer = { x: 0, y: 0, easedX: 0, easedY: 0 };
  const stars: Star[] = Array.from({ length: 300 }, () => newStar(true));
  const embers: Ember[] = Array.from({ length: 1150 }, () => {
    const r = DISC_INNER + (DISC_OUTER - DISC_INNER) * random() ** 1.7;
    const heat = 1 - (r - DISC_INNER) / (DISC_OUTER - DISC_INNER);
    // White-hot at the inner rim, through cyan and blue, to violet at the outer edge.
    const red = Math.min(255, Math.round(120 + 135 * heat ** 2.2 + 40 * (1 - heat)));
    const green = Math.min(255, Math.round(90 + 150 * heat));
    return {
      r, a: random() * Math.PI * 2, speed: 0.9 / r ** 1.5, length: 0.08 + random() * 0.26,
      width: 0.8 + random() * 1.9, heat, color: `rgb(${red}, ${green}, 255)`,
    };
  });
  let burst: Burst | null = null;
  let nextBurst = 2.2;
  const words: Word[] = [];
  const dust: Dust[] = [];
  const dustBuckets: Dust[][] = DUST_STYLES.map(() => []);
  const dustWaiting: Dust[] = [];
  let audio: AudioContext | null = null;
  /** The static plays on the menu-sounds channel, so it follows that slider and the mutes. */
  let bus: AudioChannelBus | null = null;

  function newStar(anywhere: boolean): Star {
    const r = anywhere ? 1.6 + random() * 13 : 11 + random() * 4;
    return { r, a: random() * Math.PI * 2, speed: 0.05 + random() * 0.05, size: 0.5 + random() * 1.5, twinkle: random() * 10 };
  }

  function measure() {
    width = back.clientWidth || window.innerWidth;
    height = back.clientHeight || window.innerHeight;
    const device = window.devicePixelRatio || 1;
    ratio = Math.min(device, TIERS[tier]!.ratio);
    frontRatio = Math.min(device, TIERS[tier]!.frontRatio);
    back.width = Math.round(width * ratio);
    back.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (front) {
      front.width = Math.round(width * frontRatio);
      front.height = Math.round(height * frontRatio);
      frontContext?.setTransform(frontRatio, 0, 0, frontRatio, 0, 0);
      frontClear = false;
    }
    bake();
  }

  const holeRadius = () => Math.max(44, Math.min(118, Math.min(width, height) * 0.105));
  // The drift is snapped to device pixels so the baked layers land exactly on the pixel grid.
  const hole = (): Hole => {
    const dx = Math.round(pointer.easedX * DRIFT_X * ratio), dy = Math.round(pointer.easedY * DRIFT_Y * ratio);
    return { x: width * 0.5 + dx / ratio, y: height * 0.46 + dy / ratio, radius: holeRadius(), dx, dy };
  };

  // ------------------------------------------------------------------ baked layers
  function sprite(x: number, y: number, w: number, h: number, opaque: boolean, paint: (painter: CanvasRenderingContext2D) => void): Sprite {
    const left = Math.floor(x * ratio), top = Math.floor(y * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil((x + w) * ratio) - left);
    canvas.height = Math.max(1, Math.ceil((y + h) * ratio) - top);
    const painter = canvas.getContext('2d', { alpha: !opaque });
    if (painter) {
      painter.setTransform(ratio, 0, 0, ratio, -left, -top);
      paint(painter);
    }
    return { canvas, left, top };
  }

  /** Everything that only moves with the pointer is painted once per size, not once per frame. */
  function bake() {
    const x = width * 0.5, y = height * 0.46, radius = holeRadius();
    const padX = DRIFT_X + 2, padY = DRIFT_Y + 2;
    const backdrop = sprite(-padX, -padY, width + padX * 2, height + padY * 2, true, (painter) => {
      painter.fillStyle = '#010104';
      painter.fillRect(-FAR, -FAR, FAR * 2, FAR * 2);
      // Faint gas the disc lights from within.
      const haze = painter.createRadialGradient(x, y, radius * 0.8, x, y, radius * 9);
      haze.addColorStop(0, 'rgba(70, 110, 255, 0.20)');
      haze.addColorStop(0.3, 'rgba(60, 40, 160, 0.10)');
      haze.addColorStop(1, 'rgba(0, 0, 0, 0)');
      painter.fillStyle = haze;
      painter.fillRect(-FAR, -FAR, FAR * 2, FAR * 2);
      painter.globalCompositeOperation = 'lighter';
      paintHalo(painter, x, y, radius);
      paintDiscGlow(painter, x, y, radius, false);
    });
    const reach = radius * (DISC_OUTER + 1);
    const glow = sprite(x - reach, y, reach * 2, reach * DISC_TILT, false, (painter) => {
      painter.globalCompositeOperation = 'lighter';
      paintDiscGlow(painter, x, y, radius, true);
    });
    // The thin ring of light orbiting the shadow, with its bloom.
    const ringReach = radius * 1.045 + 44 / ratio + 4;
    const ring = sprite(x - ringReach, y - ringReach, ringReach * 2, ringReach * 2, false, (painter) => {
      painter.shadowColor = 'rgba(120, 200, 255, 0.9)';
      painter.shadowBlur = 18;
      painter.strokeStyle = 'rgba(225, 240, 255, 0.85)';
      painter.lineWidth = 1.6;
      painter.beginPath();
      painter.arc(x, y, radius * 1.045, 0, Math.PI * 2);
      painter.stroke();
    });
    baked = { backdrop, glow, ring };
  }

  function stamp(layer: Sprite, centre: Hole) {
    ctx.drawImage(layer.canvas, (layer.left + centre.dx) / ratio, (layer.top + centre.dy) / ratio, layer.canvas.width / ratio, layer.canvas.height / ratio);
  }

  // ------------------------------------------------------------------ simulation
  function update(dt: number) {
    clock += dt;
    pointer.easedX += (pointer.x - pointer.easedX) * Math.min(1, dt * 2.5);
    pointer.easedY += (pointer.y - pointer.easedY) * Math.min(1, dt * 2.5);
    for (const star of stars) {
      star.a += star.speed * dt * (6 / star.r ** 1.5 + 0.02);
      star.r -= dt * 0.05 * (1 + 6 / star.r);
      if (star.r < 1.3) Object.assign(star, newStar(false));
    }
    for (const ember of embers) ember.a += ember.speed * dt;
    updateDust(dt);
    if (reduced) return;
    if (!burst && clock >= nextBurst) startBurst();
    if (burst && clock >= burst.start + burst.seconds) {
      burst = null;
      nextBurst = clock + 3.6 + random() * 5.4;
    }
    for (let index = words.length - 1; index >= 0; index -= 1) {
      const word = words[index]!;
      if (clock >= word.born + word.hold) { crumble(word); words.splice(index, 1); }
    }
  }

  function startBurst() {
    const strength = 0.55 + random() * 0.45;
    const seconds = 0.4 + random() * 0.55;
    const tears = Array.from({ length: 3 + Math.floor(random() * 3) }, (): Tear => ({
      y: random() * height, drift: (random() - 0.5) * height * 0.5, height: 26 + random() ** 2 * height * 0.17,
      shift: (random() < 0.5 ? -1 : 1) * (40 + random() * 110) * strength, phase: random() * 10,
    }));
    burst = { start: clock, seconds, strength, tears };
    const count = 1 + Math.floor(random() * 2.4);
    for (let index = 0; index < count; index += 1) spawnWord();
    playStatic(seconds, strength);
    options.onBurst?.(seconds, strength);
  }

  function spawnWord() {
    const text = ANOMALY_WORDS[Math.floor(random() * ANOMALY_WORDS.length)]!;
    const size = Math.round(Math.max(15, Math.min(30, width / 52)) * (0.8 + random() * 0.7));
    const centre = hole();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const x = width * (0.06 + random() * 0.6);
      const y = height * (0.14 + random() * 0.74);
      const span = text.length * size * 0.62;
      // Not on top of the hole, and not over another line still on screen.
      const overHole = Math.abs(y - centre.y) < centre.radius * 1.2 && x < centre.x + centre.radius * 1.4 && x + span > centre.x - centre.radius * 1.4;
      if (overHole || words.some((other) => Math.abs(other.y - y) < other.size * 1.8)) continue;
      words.push({ text, x: Math.min(x, width - span - 24), y, size, born: clock, hold: 1.5 + random() * 1.2, seed: random() * 1000 });
      return;
    }
  }

  /** The line breaks into dust: one grain per lit pixel of the text, pulled in a spiral toward the hole. */
  function crumble(word: Word) {
    const canvas = document.createElement('canvas');
    const painter = canvas.getContext('2d', { willReadFrequently: true });
    if (!painter) return;
    painter.font = `600 ${word.size}px ${FONT}`;
    const label = `> ${word.text}`;
    canvas.width = Math.ceil(painter.measureText(label).width) + 4;
    canvas.height = Math.ceil(word.size * 1.5);
    painter.font = `600 ${word.size}px ${FONT}`;
    painter.textBaseline = 'middle';
    painter.fillStyle = '#fff';
    painter.fillText(label, 2, canvas.height / 2);
    const pixels = painter.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = word.size > 22 ? 3 : 2;
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        if (pixels[(y * canvas.width + x) * 4 + 3]! < 90 || dust.length >= MAX_DUST) continue;
        // Grains leave in a wave from the left, so the line seems to be read and erased.
        const delay = x / canvas.width * 0.45 + random() * 0.12;
        dust.push({
          x: word.x + x, y: word.y - canvas.height / 2 + y, vx: (random() - 0.5) * 150, vy: (random() - 0.5) * 150 - 20,
          life: -delay, span: 1.9 + random() * 1.5, seed: random() * 100, tint: random(),
        });
      }
    }
  }

  function updateDust(dt: number) {
    const centre = hole();
    for (let index = dust.length - 1; index >= 0; index -= 1) {
      const grain = dust[index]!;
      grain.life += dt;
      if (grain.life < 0) continue;
      const dx = centre.x - grain.x, dy = centre.y - grain.y;
      const gap = Math.max(40, Math.hypot(dx, dy));
      const pull = Math.min(1500, 9e6 / (gap * gap)) + 110;
      // Toward the hole, plus a sideways push so the grains swirl in instead of falling straight.
      grain.vx += (dx / gap * pull + -dy / gap * pull * 0.7) * dt;
      grain.vy += (dy / gap * pull + dx / gap * pull * 0.7) * dt;
      grain.vx *= 1 - 0.45 * dt;
      grain.vy *= 1 - 0.45 * dt;
      grain.x += grain.vx * dt + Math.sin(clock * 31 + grain.seed) * 0.5;
      grain.y += grain.vy * dt + Math.cos(clock * 27 + grain.seed * 1.3) * 0.5;
      if (grain.life >= grain.span || gap < centre.radius * 1.05) {
        // Order does not matter (the grains add up), so the last one fills the gap.
        dust[index] = dust[dust.length - 1]!;
        dust.pop();
      }
    }
  }

  // ------------------------------------------------------------------ black hole
  function drawEmbers(centre: Hole, front: boolean) {
    const share = TIERS[tier]!.embers;
    const count = Math.ceil(embers.length * share);
    // Fewer streaks are drawn wider, so the disc keeps its body.
    const body = 1 / Math.sqrt(share);
    for (let index = 0; index < count; index += 1) {
      const ember = embers[index]!;
      const sine = Math.sin(ember.a);
      if ((sine >= 0) !== front) continue;
      // The side turning toward the viewer is brighter (relativistic beaming).
      const beaming = 0.45 + 0.55 * (1 - Math.cos(ember.a)) / 2;
      const light = beaming * (0.75 + 0.25 * Math.sin(clock * 3 + ember.a * 5 + ember.r * 9));
      const from = ember.a - ember.length;
      ctx.strokeStyle = ember.color;
      ctx.lineWidth = ember.width * (0.6 + ember.heat) * body;
      ctx.globalAlpha = Math.min(1, (0.22 + 0.7 * ember.heat) * light);
      ctx.beginPath();
      ctx.ellipse(centre.x, centre.y, ember.r * centre.radius, ember.r * centre.radius * DISC_TILT, 0, from, ember.a);
      ctx.stroke();
      if (front) continue;
      // Light from the far side bends over (and, fainter, under) the hole.
      const lensed = (1.2 + (ember.r - DISC_INNER) * 0.3) * centre.radius;
      ctx.lineWidth = ember.width * 0.8 * body;
      ctx.globalAlpha = Math.min(1, (0.12 + 0.45 * ember.heat) * light);
      ctx.beginPath();
      ctx.ellipse(centre.x, centre.y, lensed, lensed * 0.94, 0, from, ember.a);
      ctx.stroke();
      if (tier > 0) continue;
      ctx.globalAlpha = (0.02 + 0.12 * ember.heat) * light;
      ctx.beginPath();
      ctx.ellipse(centre.x, centre.y, lensed * 0.93, lensed * 0.88, 0, -ember.a, -from);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Smooth glow of the disc under its streaks: half of it behind the hole, half in front. */
  function paintDiscGlow(painter: CanvasRenderingContext2D, x: number, y: number, radius: number, front: boolean) {
    painter.save();
    painter.beginPath();
    painter.rect(-FAR, front ? y : -FAR, FAR * 2, front ? FAR : FAR + y);
    painter.clip();
    painter.translate(x, y);
    painter.scale(1, DISC_TILT);
    for (const [offset, strength] of [[0, 1], [-0.9, 0.8]] as const) {
      // The second, off-centre pass brightens the side that turns toward the viewer.
      // Nothing inside the disc's inner rim: the hole shows through the gap.
      const glow = painter.createRadialGradient(0, 0, radius * (DISC_INNER - 0.25), offset * radius, 0, radius * (DISC_OUTER + 0.9));
      glow.addColorStop(0, 'rgba(225, 240, 255, 0)');
      glow.addColorStop(0.05, `rgba(225, 240, 255, ${(front ? 0.36 : 0.5) * strength})`);
      glow.addColorStop(0.16, `rgba(140, 195, 255, ${0.34 * strength})`);
      glow.addColorStop(0.5, `rgba(95, 95, 245, ${0.15 * strength})`);
      glow.addColorStop(1, 'rgba(60, 30, 160, 0)');
      painter.fillStyle = glow;
      painter.beginPath();
      painter.arc(0, 0, radius * (DISC_OUTER + 1), 0, Math.PI * 2);
      painter.fill();
    }
    painter.restore();
  }

  /** The far side of the disc, bent into a halo over the hole. */
  function paintHalo(painter: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    const halo = painter.createRadialGradient(x, y, radius * 1.02, x, y, radius * 2.1);
    halo.addColorStop(0, 'rgba(215, 235, 255, 0.5)');
    halo.addColorStop(0.3, 'rgba(120, 165, 255, 0.24)');
    halo.addColorStop(1, 'rgba(70, 50, 200, 0)');
    painter.fillStyle = halo;
    painter.save();
    painter.beginPath();
    painter.rect(-FAR, -FAR, FAR * 2, FAR + y + radius * 0.2);
    painter.clip();
    painter.beginPath();
    painter.arc(x, y, radius * 2.1, 0, Math.PI * 2);
    painter.fill();
    painter.restore();
    painter.globalAlpha = 0.35;
    painter.beginPath();
    painter.arc(x, y, radius * 2.1, 0, Math.PI * 2);
    painter.fill();
    painter.globalAlpha = 1;
  }

  function drawBack() {
    if (!baked) return;
    const centre = hole();
    const { x, y, radius } = centre;
    // Space, the gas, the halo and the far half of the disc's glow.
    ctx.globalCompositeOperation = 'source-over';
    stamp(baked.backdrop, centre);

    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = STAR_COLOR;
    ctx.lineCap = 'round';
    for (const star of stars) {
      // Gravitational lensing: light passing near the hole is pushed outward and smeared around it.
      const seen = (star.r + 1.1 / star.r) * radius;
      const smear = Math.min(0.4, 0.3 / star.r ** 2.5);
      const glow = (0.3 + 0.7 * Math.abs(Math.sin(clock * 0.8 + star.twinkle))) * Math.min(1, (star.r - 1.25) * 1.4);
      ctx.globalAlpha = Math.max(0, glow * 0.75);
      ctx.lineWidth = star.size;
      ctx.beginPath();
      ctx.ellipse(x, y, seen, seen * 0.94, 0, star.a - smear - 0.004, star.a);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    drawEmbers(centre, false);

    // The shadow, soft at the rim, and the thin ring of light orbiting it.
    ctx.globalCompositeOperation = 'source-over';
    const shadow = ctx.createRadialGradient(x, y, radius * 0.86, x, y, radius * 1.16);
    shadow.addColorStop(0, 'rgba(0, 0, 0, 1)');
    shadow.addColorStop(0.72, 'rgba(0, 0, 0, 0.96)');
    shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(clock * 1.7);
    stamp(baked.ring, centre);
    ctx.globalAlpha = 1;

    stamp(baked.glow, centre);
    drawEmbers(centre, true);

    ctx.globalCompositeOperation = 'source-over';
    const vignette = ctx.createRadialGradient(x, y, Math.min(width, height) * 0.3, x, y, Math.max(width, height) * 0.8);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.78)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  // ------------------------------------------------------------------ interference
  /** How hard the interference is right now: it swells in and dies away instead of switching on and off. */
  function burstLevel(): number {
    if (!burst) return 0;
    const progress = (clock - burst.start) / burst.seconds;
    return progress <= 0 || progress >= 1 ? 0 : Math.sin(Math.PI * progress) ** 0.6 * burst.strength;
  }

  /** Where a tear is now, and how far it has slid: it breathes instead of jumping. */
  function tearNow(tear: Tear, age: number) {
    const waver = 0.55 + 0.45 * Math.sin(age * 23 + tear.phase) * Math.sin(age * 7.1 + tear.phase * 2);
    return { centre: tear.y + tear.drift * age, half: tear.height / 2, shift: tear.shift * waver };
  }

  /** Sideways slip of the picture at height `y`: a slow loss of sync all over, plus the tears with soft edges. */
  function slipAt(y: number, age: number, level: number): number {
    let slip = level * (5 * Math.sin(y * 0.019 + age * 11) + 2.5 * Math.sin(y * 0.061 - age * 23));
    for (const tear of burst!.tears) {
      const now = tearNow(tear, age);
      const offset = (y - now.centre) / now.half;
      if (offset > -1 && offset < 1) slip += level / burst!.strength * now.shift * Math.sqrt(0.5 + 0.5 * Math.cos(Math.PI * offset));
    }
    return slip;
  }

  /** The shock wave leaving the hole when a burst starts: how far it has reached, how thick it is and how much is left of it. */
  function ripple() {
    if (!burst) return null;
    const across = Math.hypot(width, height);
    const reach = holeRadius() * 1.3 + (clock - burst.start) * across * 1.5;
    const fade = 1 - reach / across;
    return fade > 0 ? { reach, thickness: 26 + reach * 0.06, fade: fade * burst.strength } : null;
  }

  /** The last frame, set aside: a canvas drawn onto itself is duplicated whole on each call. */
  function snapshot(top = 0, tall = back.height): boolean {
    strips ??= document.createElement('canvas');
    if (strips.width !== back.width || strips.height !== back.height) {
      strips.width = back.width;
      strips.height = back.height;
    }
    const copy = strips.getContext('2d', { alpha: false });
    if (!copy || tall <= 0) return false;
    copy.drawImage(back, 0, top, back.width, tall, 0, top, back.width, tall);
    return true;
  }

  /** Redraws one horizontal strip of the snapshot `slip` pixels to the side. Rows are whole device pixels, so strips never leave seams. */
  function slideStrip(y: number, tall: number, slip: number) {
    const top = Math.round(y * ratio), rows = Math.round((y + tall) * ratio) - top;
    if (rows > 0) ctx.drawImage(strips!, 0, top, back.width, rows, slip, top / ratio, width, rows / ratio);
  }

  function tearBack() {
    const level = burstLevel();
    if (!burst || level <= 0) {
      // Between bursts the picture still slips now and then.
      if (reduced || Math.sin(clock * 7.3) * Math.sin(clock * 3.1) < 0.965) return;
      const y = Math.floor((Math.sin(clock * 91) * 0.5 + 0.5) * height), tall = 3 + Math.round(9 * Math.abs(Math.sin(clock * 53)));
      if (!snapshot(Math.max(0, Math.round(y * ratio) - 1), Math.round(tall * ratio) + 2)) return;
      ctx.globalCompositeOperation = 'source-over';
      slideStrip(y, tall, 14 * Math.sin(clock * 400));
      return;
    }
    if (!snapshot()) return;
    const age = clock - burst.start;
    const centre = hole();
    ctx.globalCompositeOperation = 'source-over';
    // The whole picture loses sync a little, and the tears a lot: thin strips, each slid by its own amount.
    const stripHeight = tier >= 2 ? 10 : 6;
    for (let y = 0; y < height; y += stripHeight) {
      const slip = slipAt(y + stripHeight / 2, age, level);
      if (Math.abs(slip) >= 0.5) slideStrip(y, stripHeight, slip);
    }
    // Colour fringes where the picture tore.
    ctx.globalCompositeOperation = 'lighter';
    for (const tear of burst.tears) {
      const now = tearNow(tear, age);
      const top = now.centre - now.half, slide = now.shift * level / burst.strength * 0.5;
      ctx.fillStyle = `rgba(255, 20, 90, ${(0.10 * level).toFixed(3)})`;
      ctx.fillRect(slide, top, width, tear.height);
      ctx.fillStyle = `rgba(0, 240, 255, ${(0.08 * level).toFixed(3)})`;
      ctx.fillRect(-slide, top, width, tear.height);
    }
    // The shock wave bends what it crosses, like a lens: each ring of it shows the picture slightly magnified.
    const wave = ripple();
    if (!wave) return;
    ctx.globalCompositeOperation = 'source-over';
    const rings = 4;
    for (let ring = 0; ring < rings; ring += 1) {
      const inner = Math.max(0, wave.reach + (ring - rings / 2) * wave.thickness / rings);
      const zoom = 1 + 0.045 * wave.fade * Math.sin(Math.PI * (ring + 0.5) / rings);
      ctx.save();
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, inner + wave.thickness / rings, 0, Math.PI * 2);
      ctx.arc(centre.x, centre.y, inner, 0, Math.PI * 2, true);
      ctx.clip();
      ctx.translate(centre.x, centre.y);
      ctx.scale(zoom, zoom);
      ctx.translate(-centre.x, -centre.y);
      ctx.drawImage(strips!, 0, 0, width, height);
      ctx.restore();
    }
  }

  function drawWord(painter: CanvasRenderingContext2D, word: Word) {
    const age = clock - word.born;
    const label = `> ${word.text}`;
    // It decodes left to right out of noise, then holds with a nervous flicker.
    const shown = Math.floor(Math.min(1, age / 0.32) * label.length);
    let text = '';
    for (let index = 0; index < label.length; index += 1) {
      const settled = index < shown && !(age > 0.4 && Math.sin(clock * 37 + index * 12.7 + word.seed) > 0.985);
      text += settled || label[index] === ' ' ? label[index] : GLYPHS[Math.floor(Math.abs(Math.sin(clock * 60 + index * 7.1 + word.seed)) * GLYPHS.length) % GLYPHS.length];
    }
    const jolt = Math.sin(clock * 43 + word.seed) > 0.9 ? (Math.sin(clock * 311 + word.seed) * 9) : 0;
    const split = 1.5 + 3 * Math.abs(Math.sin(clock * 9 + word.seed));
    const alpha = Math.min(1, age / 0.12) * (0.82 + 0.18 * Math.sin(clock * 50 + word.seed));
    painter.font = `600 ${word.size}px ${FONT}`;
    painter.textBaseline = 'middle';
    const span = painter.measureText(label).width;
    painter.fillStyle = `rgba(2, 4, 14, ${(0.62 * alpha).toFixed(3)})`;
    painter.fillRect(word.x + jolt - 8, word.y - word.size * 0.75, span + 16, word.size * 1.5);
    painter.globalCompositeOperation = 'lighter';
    painter.fillStyle = `rgba(255, 30, 100, ${(0.75 * alpha).toFixed(3)})`;
    painter.fillText(text, word.x + jolt - split, word.y);
    painter.fillStyle = `rgba(0, 235, 255, ${(0.75 * alpha).toFixed(3)})`;
    painter.fillText(text, word.x + jolt + split, word.y + 1);
    painter.fillStyle = `rgba(235, 248, 255, ${alpha.toFixed(3)})`;
    painter.fillText(text, word.x + jolt, word.y);
    painter.fillStyle = `rgba(150, 235, 255, ${(0.7 * alpha).toFixed(3)})`;
    painter.fillRect(word.x + jolt, word.y + word.size * 0.72, span * Math.min(1, age / 0.5), 1.5);
    painter.globalCompositeOperation = 'source-over';
  }

  function drawFront() {
    const painter = frontContext ?? ctx;
    if (frontContext) {
      // Between signals the layer is empty: it is left alone instead of being cleared again every frame.
      const idle = !burst && words.length === 0 && dust.length === 0;
      if (idle && frontClear) return;
      frontContext.clearRect(0, 0, width, height);
      frontClear = idle;
    }
    for (const word of words) drawWord(painter, word);

    // Grains are grouped by colour first, so thousands of them cost a handful of style changes.
    dustWaiting.length = 0;
    for (const bucket of dustBuckets) bucket.length = 0;
    for (const grain of dust) {
      if (grain.life < 0) { dustWaiting.push(grain); continue; }
      const level = Math.min(DUST_LEVELS - 1, Math.max(0, Math.floor((1 - grain.life / grain.span) * DUST_LEVELS)));
      dustBuckets[(grain.tint < 0.2 ? 0 : grain.tint < 0.55 ? 1 : 2) * DUST_LEVELS + level]!.push(grain);
    }
    painter.globalCompositeOperation = 'lighter';
    // Still part of the line: these have not been reached by the wave yet.
    painter.fillStyle = 'rgba(225, 245, 255, 0.9)';
    for (const grain of dustWaiting) painter.fillRect(grain.x, grain.y, 2, 2);
    for (let index = 0; index < dustBuckets.length; index += 1) {
      const bucket = dustBuckets[index]!;
      if (bucket.length === 0) continue;
      painter.fillStyle = DUST_STYLES[index]!;
      for (const grain of bucket) {
        const size = 1 + (1 - grain.life / grain.span) * 1.4;
        painter.fillRect(grain.x, grain.y, size, size);
      }
    }

    if (burst) {
      const age = clock - burst.start;
      const level = burstLevel();
      // Flash as the signal breaks in, then the tears, static and the shock wave crossing the panels.
      if (age < 0.06) {
        painter.fillStyle = `rgba(150, 215, 255, ${(0.12 * burst.strength).toFixed(3)})`;
        painter.fillRect(0, 0, width, height);
      }
      for (const tear of burst.tears) {
        const now = tearNow(tear, age);
        const top = now.centre - now.half;
        painter.fillStyle = `rgba(160, 235, 255, ${(0.025 * level).toFixed(3)})`;
        painter.fillRect(0, top, width, tear.height);
        // The edges of a tear split into colours, further apart the more it has slid.
        const split = Math.min(5, Math.abs(now.shift) * 0.04) * level;
        painter.fillStyle = `rgba(255, 40, 110, ${(0.4 * level).toFixed(3)})`;
        painter.fillRect(0, top - split, width, 1.5);
        painter.fillStyle = `rgba(0, 235, 255, ${(0.4 * level).toFixed(3)})`;
        painter.fillRect(0, top + tear.height + split, width, 1.5);
        // Scanlines only inside the tears, so the rest of the lobby keeps its contrast.
        painter.fillStyle = `rgba(140, 220, 255, ${(0.09 * level).toFixed(3)})`;
        for (let line = top; line < top + tear.height; line += 3) painter.fillRect(0, line, width, 1);
      }
      for (let block = 0; block < 46 * level; block += 1) {
        const tint = random();
        painter.fillStyle = tint < 0.5 ? `rgba(235, 248, 255, ${(0.12 + random() * 0.4).toFixed(3)})`
          : tint < 0.8 ? `rgba(0, 235, 255, ${(0.12 + random() * 0.35).toFixed(3)})` : `rgba(255, 40, 110, ${(0.12 + random() * 0.35).toFixed(3)})`;
        painter.fillRect(random() * width, random() * height, 6 + random() ** 3 * 190, 1 + random() * 5);
      }
      const wave = ripple();
      if (wave) {
        const centre = hole();
        const ring = (radius: number, line: number, style: string) => {
          painter.strokeStyle = style;
          painter.lineWidth = line;
          painter.beginPath();
          painter.arc(centre.x, centre.y, Math.max(1, radius), 0, Math.PI * 2);
          painter.stroke();
        };
        ring(wave.reach, wave.thickness, `rgba(120, 100, 255, ${(0.10 * wave.fade).toFixed(3)})`);
        ring(wave.reach - 4, 2, `rgba(255, 60, 130, ${(0.30 * wave.fade).toFixed(3)})`);
        ring(wave.reach, 2, `rgba(170, 230, 255, ${(0.55 * wave.fade).toFixed(3)})`);
      }
    }
    painter.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ sound
  /** A crackle of filtered noise with a low thump under it, synthesized on the spot. */
  function playStatic(seconds: number, strength: number) {
    if (options.soundEnabled && !options.soundEnabled()) return;
    try {
      const legacy = window as Window & { webkitAudioContext?: typeof AudioContext };
      const AudioContextClass = window.AudioContext || legacy.webkitAudioContext;
      if (!AudioContextClass) return;
      audio ??= new AudioContextClass();
      bus ??= new AudioChannelBus(audio);
      if (audio.state === 'suspended') void audio.resume();
      if (audio.state !== 'running') return;
      const output = bus.channel('interface');
      const now = audio.currentTime;
      const length = Math.min(0.6, seconds);
      const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * length), audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
      const noise = audio.createBufferSource();
      noise.buffer = buffer;
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900 + 2600 * Math.random(), now);
      filter.frequency.exponentialRampToValueAtTime(380, now + length);
      filter.Q.value = 0.8;
      const gain = audio.createGain();
      const loud = 0.035 + 0.045 * strength;
      gain.gain.setValueAtTime(0.0001, now);
      // Stuttering envelope: the static cuts in and out like a bad link.
      for (let cut = 0; cut < length; cut += 0.045) gain.gain.setValueAtTime(Math.random() < 0.3 ? loud * 0.1 : loud * (0.5 + Math.random() * 0.5), now + cut);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
      noise.connect(filter).connect(gain).connect(output);
      noise.start(now);
      noise.stop(now + length + 0.02);
      const thump = audio.createOscillator();
      const thumpGain = audio.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(72, now);
      thump.frequency.exponentialRampToValueAtTime(30, now + 0.32);
      thumpGain.gain.setValueAtTime(0.0001, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.11 * strength, now + 0.02);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
      thump.connect(thumpGain).connect(output);
      thump.start(now);
      thump.stop(now + 0.36);
    } catch {
      // No audio device or the browser refused: the lobby stays silent.
    }
  }

  // ------------------------------------------------------------------ loop
  function render() {
    drawBack();
    tearBack();
    drawFront();
    warpPanels();
  }

  /** Tells the lobby how to move its panels: the same slip and shock wave as the picture behind them. */
  function warpPanels() {
    if (!options.onWarp) return;
    const level = burstLevel();
    if (!burst || level <= 0) {
      if (warping) options.onWarp(0, 0);
      warping = false;
      return;
    }
    const age = clock - burst.start;
    warping = true;
    options.onWarp(level * (9 * Math.sin(age * 31) * Math.sin(age * 7.3) + 4 * Math.sin(age * 53 + 1)),
      burst.strength * Math.exp(-age * 5) * Math.sin(age * 26));
  }

  function tick(now: number) {
    if (!running) return;
    const elapsed = now - last;
    const dt = Math.min(0.05, Math.max(0, elapsed / 1000));
    last = now;
    update(dt);
    render();
    watchPace(elapsed);
    raf = requestAnimationFrame(tick);
  }

  /** Steps the quality down when the machine cannot keep up, judged over whole windows so one burst does not count. */
  function watchPace(elapsed: number) {
    // Long gaps are the tab being hidden or the browser busy elsewhere, not this scene.
    if (elapsed <= 0 || elapsed > 120) return;
    frameSum += elapsed;
    frames += 1;
    if (frames < FRAME_WINDOW) return;
    const mean = frameSum / frames;
    frameSum = 0;
    frames = 0;
    // The first window after a change still carries the cost of setting up.
    if (warming) { warming = false; return; }
    if (mean <= SLOW_FRAME) { slowWindows = 0; return; }
    slowWindows += 1;
    if (slowWindows < 2 || tier >= TIERS.length - 1) return;
    tier = Math.min(TIERS.length - 1, tier + (mean > 34 ? 2 : 1));
    rememberTier(tier);
    slowWindows = 0;
    warming = true;
    measure();
  }

  const onVisibility = () => { last = performance.now(); };

  return {
    start() {
      if (running) return;
      running = true;
      measure();
      render();
      if (reduced) return;
      document.addEventListener('visibilitychange', onVisibility);
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      frontContext?.clearRect(0, 0, width, height);
      frontClear = true;
      if (warping) options.onWarp?.(0, 0);
      warping = false;
      bus?.dispose();
      bus = null;
      if (audio) { void audio.close(); audio = null; }
    },
    resize() {
      measure();
      if (running) render();
    },
    setPointer(x: number, y: number) {
      pointer.x = x;
      pointer.y = y;
    },
  };
}
