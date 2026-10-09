import { useEffect, useRef, useState } from 'react';
import type { AugmentCardView } from '@impulso/state';
import { useTyped } from './RunOutcome';
import type { RunSector } from './run-state';
import type { RunSfx } from './run-sfx';
import './run.css';

/** The jump is drawn on a 640×360 stage scaled to cover the screen. */
const STAGE = { width: 640, height: 360 };
const WARP = { starCount: 300, focalLength: 230, flashAtMs: 1300, titleAtMs: 1450, calmAtMs: 2700, exitAtMs: 3900, fadeMs: 380, topSpeed: 2.8, idleSpeed: 0.12 };
const TUNNEL_RINGS = 5;
const COLOR = { space: '#05070f', stellar: '#38d6f0', electric: '#2f6bff', core: '#f4fbff', corrupt: '#8a5cf0' };

interface Star { x: number; y: number; z: number; tint: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const easeInOut = (x: number) => x * x * (3 - 2 * x);
const newStar = (depth: number): Star => ({ x: (Math.random() - 0.5) * 3.4, y: (Math.random() - 0.5) * 2, z: 0.05 + depth * 0.95, tint: Math.random() });

function speedAt(timeMs: number): number {
  if (timeMs < WARP.flashAtMs) return lerp(WARP.idleSpeed, WARP.topSpeed, easeInOut(timeMs / WARP.flashAtMs));
  const calm = clamp((timeMs - WARP.flashAtMs) / (WARP.calmAtMs - WARP.flashAtMs), 0, 1);
  return lerp(WARP.topSpeed, WARP.idleSpeed, easeInOut(calm));
}

/**
 * The jump between maps: stars stretch into streaks, a tunnel of rings, a flash, and the card of the sector ahead.
 * It ends by itself; a click or Space ends it sooner.
 */
export function RunWarp({ sector, number, label, augments, locale, sfx, onDone }: { sector: RunSector; number: number; label: string; augments: AugmentCardView[]; locale: 'es' | 'en'; sfx: RunSfx; onDone(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [card, setCard] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const heading = useTyped(card ? `${label} · ${locale === 'en' ? 'DESTINATION' : 'DESTINO'}` : '', 0, 24);
  const name = useTyped(card ? sector.name.toUpperCase() : '', 420, 34);

  useEffect(() => {
    sfx.play('whoosh');
    let finished = false;
    const leave = () => {
      if (finished) return;
      finished = true;
      setLeaving(true);
      timers.push(setTimeout(() => done.current(), WARP.fadeMs));
    };
    const timers = [setTimeout(() => setCard(true), WARP.titleAtMs), setTimeout(leave, WARP.exitAtMs)];
    const onKey = (event: KeyboardEvent) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); leave(); } };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', leave);

    const element = canvas.current, context = element?.getContext('2d', { alpha: false });
    let raf = 0, stopResize = () => {};
    if (element && context) {
      const stars = Array.from({ length: WARP.starCount }, () => newStar(Math.random()));
      const centre = { x: STAGE.width / 2, y: STAGE.height / 2 };
      const project = (star: Star, depth: number) => ({ x: centre.x + star.x / depth * WARP.focalLength * 0.5, y: centre.y + star.y / depth * WARP.focalLength * 0.5 });
      let width = 0, height = 0, scale = 1, elapsed = 0, last = performance.now();
      const measure = () => {
        width = element.width = element.clientWidth || window.innerWidth;
        height = element.height = element.clientHeight || window.innerHeight;
        scale = Math.max(width / STAGE.width, height / STAGE.height);
      };
      measure();
      window.addEventListener('resize', measure);
      stopResize = () => window.removeEventListener('resize', measure);
      const tick = (now: number) => {
        const delta = Math.min(50, now - last);
        last = now;
        elapsed += delta;
        const speed = speedAt(elapsed);
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = COLOR.space;
        context.fillRect(0, 0, width, height);
        context.setTransform(scale, 0, 0, scale, (width - STAGE.width * scale) / 2, (height - STAGE.height * scale) / 2);

        const intensity = clamp((speed - 1) / (WARP.topSpeed - 1), 0, 1);
        if (intensity > 0) for (let ring = 0; ring < TUNNEL_RINGS; ring += 1) {
          const progress = (elapsed / 520 + ring / TUNNEL_RINGS) % 1;
          const radius = 10 + progress * progress * 420;
          context.globalAlpha = intensity * (1 - progress) * 0.55;
          context.strokeStyle = ring % 2 ? COLOR.corrupt : COLOR.electric;
          context.lineWidth = 1;
          context.beginPath();
          context.ellipse(centre.x, centre.y, radius, radius * 0.575, 0, 0, Math.PI * 2);
          context.stroke();
        }
        for (let index = 0; index < stars.length; index += 1) {
          const star = stars[index]!;
          star.z -= speed * (delta / 1000) * 0.6;
          const head = star.z > 0.04 ? project(star, star.z) : null;
          if (!head || head.x < -260 || head.x > STAGE.width + 260 || head.y < -160 || head.y > STAGE.height + 160) { stars[index] = newStar(1); continue; }
          const tail = project(star, star.z + 0.012 + speed * 0.05);
          const nearness = 1 - star.z;
          context.globalAlpha = 0.25 + nearness * 0.75;
          context.strokeStyle = star.tint > 0.8 ? COLOR.corrupt : star.tint > 0.35 ? COLOR.stellar : COLOR.core;
          context.lineWidth = nearness > 0.7 ? 2 : 1;
          context.beginPath();
          context.moveTo(tail.x, tail.y);
          context.lineTo(head.x, head.y);
          context.stroke();
        }
        const glow = clamp(speed / WARP.topSpeed, 0, 1);
        context.globalAlpha = 0.08 * glow;
        context.fillStyle = COLOR.stellar;
        context.beginPath();
        context.arc(centre.x, centre.y, 60 * glow + 4, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 0.5 * glow;
        context.fillStyle = COLOR.core;
        context.beginPath();
        context.arc(centre.x, centre.y, 6 * glow + 1, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      finished = true;
      cancelAnimationFrame(raf);
      stopResize();
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', leave);
    };
  }, []);

  return <main className={`vi-run-warp vi-screen${leaving ? ' is-leaving' : ''}`} aria-label={`Sector ${number} · ${sector.name}`}>
    <canvas ref={canvas} className="vi-run-warp__space" aria-hidden="true" />
    <i className="vi-run-warp__flash" aria-hidden="true" />
    {card && <div className="vi-run-warp__card">
      <p className="vi-run-line vi-run-line--accent">{heading || ' '}</p>
      <h2>SECTOR {number}</h2>
      <h3>{name || ' '}</h3>
      <p className="vi-run-line vi-run-fade" style={{ animationDelay: '950ms' }}>{sector.hint[locale].toUpperCase()}</p>
      {augments.length > 0 && <p className="vi-run-line vi-run-line--corrupt vi-run-fade" style={{ animationDelay: '1150ms' }}>
        {locale === 'en' ? 'ACTIVE AUGMENTS' : 'AUMENTOS ACTIVOS'}: {augments.map((augment) => augment.text[locale].name.toUpperCase()).join(' · ')}
      </p>}
    </div>}
  </main>;
}
