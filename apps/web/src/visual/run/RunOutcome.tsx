import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AugmentCardView } from '@impulso/state';
import { OUTCOME_HOLD_MS, RUN_SECTORS, formatTime, isLastSector, ledgerNumber, type RunState, type SectorSummary } from './run-state';
import type { RunSfx } from './run-sfx';
import './run.css';

/** What a match needs to know when it is one sector of a run. */
export interface RunLink {
  state: RunState;
  sfx: RunSfx;
  /** The sector was won and its result screen is over: jump on. */
  onVictory(summary: SectorSummary): void;
  /** The sector was lost and the player asked for a new run. */
  onRestart(): void;
}

const LETTER_STAGGER_MS = 70;
const TITLE_DELAY_MS = 250;
const CONFETTI_COLORS = ['#38d6f0', '#f4fbff', '#8a5cf0', '#2f6bff'];

/** Reveals `text` one character at a time once `delayMs` has passed. */
export function useTyped(text: string, delayMs: number, msPerCharacter = 28): string {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    let interval: ReturnType<typeof setInterval> | undefined;
    const timer = setTimeout(() => {
      interval = setInterval(() => setShown((count) => {
        if (count >= text.length) clearInterval(interval);
        return Math.min(text.length, count + 1);
      }), msPerCharacter);
    }, delayMs);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [text, delayMs, msPerCharacter]);
  return text.slice(0, shown);
}

/** A word whose letters drop in one after another. */
export function LetterRow({ word, delayMs = TITLE_DELAY_MS, staggerMs = LETTER_STAGGER_MS }: { word: string; delayMs?: number; staggerMs?: number }) {
  return <h2 className="vi-run-title" aria-label={word}>
    {[...word].map((letter, index) => <span key={index} aria-hidden="true" style={{ animationDelay: `${delayMs + index * staggerMs}ms` }}>{letter === ' ' ? ' ' : letter}</span>)}
  </h2>;
}

export function AugmentChips({ augments, locale, lost = false, empty }: { augments: AugmentCardView[]; locale: 'es' | 'en'; lost?: boolean; empty: string }) {
  if (augments.length === 0) return <div className="vi-run-chips"><span className="vi-run-chip vi-run-chip--empty">{empty}</span></div>;
  return <div className={`vi-run-chips${lost ? ' is-lost' : ''}`}>
    {augments.map((augment, index) => <span key={augment.id} className={`vi-run-chip vi-run-chip--${augment.tier}`} title={augment.text[locale].advantage}
      style={{ animationDelay: `${450 + index * 110}ms`, ['--vi-run-strike' as string]: `${900 + index * 110}ms` }}>
      <i aria-hidden="true">{augment.icon}</i>{augment.text[locale].name}
    </span>)}
  </div>;
}

/** One burst of confetti from behind the title. */
function Confetti() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current, context = element?.getContext('2d');
    if (!element || !context) return;
    const width = element.width = element.clientWidth, height = element.height = element.clientHeight;
    const scale = width / 640;
    const pieces = Array.from({ length: 110 }, () => {
      const angle = (200 + Math.random() * 140) * Math.PI / 180, speed = (80 + Math.random() * 180) * scale;
      return { x: width / 2, y: height * 0.3, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]! };
    });
    const lifeSeconds = 1.6;
    let raf = 0, last = performance.now(), age = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      age += dt;
      context.clearRect(0, 0, width, height);
      if (age >= lifeSeconds) return;
      const size = (3 - 2 * age / lifeSeconds) * Math.max(1, scale);
      context.globalAlpha = Math.min(1, (lifeSeconds - age) * 3);
      for (const piece of pieces) {
        piece.vy += 260 * scale * dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        context.fillStyle = piece.color;
        context.fillRect(piece.x, piece.y, size, size);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvas} className="vi-run-confetti" aria-hidden="true" />;
}

/**
 * GANASTE or DERROTA over the frozen map. A won sector jumps on by itself after a short hold (or at once on click or Space);
 * a lost one waits for the player to restart the run or leave.
 */
export function RunOutcome({ won, summary, run, locale, onLeave, children }: { won: boolean; summary: SectorSummary; run: RunLink; locale: 'es' | 'en'; onLeave(): void; children?: ReactNode }) {
  const english = locale === 'en';
  // The match keeps sending views after it ends: the numbers shown are the ones it ended with.
  const [shown] = useState(summary);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(OUTCOME_HOLD_MS / 1000));
  const [leaving, setLeaving] = useState(false);
  const left = useRef(false);
  const word = won ? (english ? 'VICTORY' : 'GANASTE') : (english ? 'DEFEAT' : 'DERROTA');
  const titleEndsAt = TITLE_DELAY_MS + word.length * LETTER_STAGGER_MS + 420;
  const last = isLastSector(run.state);
  const subtitle = useTyped(won
    ? (english ? `SECTOR ${shown.sector} SECURED · CONSENSUS REACHED` : `SECTOR ${shown.sector} ASEGURADO · CONSENSUS REACHED`)
    : (english ? 'THE RIVAL REACHED CONSENSUS FIRST' : 'EL RIVAL ALCANZÓ EL CONSENSO PRIMERO'), titleEndsAt - 250);

  const jump = () => {
    if (left.current) return;
    left.current = true;
    setLeaving(true);
    setTimeout(() => run.onVictory(shown), 280);
  };
  const jumpRef = useRef(jump);
  jumpRef.current = jump;

  useEffect(() => {
    run.sfx.play(won ? 'win' : 'defeat');
    const blips = [...word].map((_, index) => setTimeout(() => run.sfx.play('blip'), TITLE_DELAY_MS + index * LETTER_STAGGER_MS + 420));
    return () => blips.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!won) return;
    const started = performance.now();
    const interval = setInterval(() => {
      const remaining = OUTCOME_HOLD_MS - (performance.now() - started);
      setSecondsLeft(Math.max(1, Math.ceil(remaining / 1000)));
      if (remaining <= 0) jumpRef.current();
    }, 100);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      jumpRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => { clearInterval(interval); window.removeEventListener('keydown', onKey); };
  }, [won]);

  const nextStep = last ? (english ? 'CLOSING THE RUN IN' : 'CERRANDO LA RUN EN')
    : (english ? `JUMP TO SECTOR ${shown.sector + 1} IN` : `SALTO AL SECTOR ${shown.sector + 1} EN`);
  return <div className={`vi-run-outcome vi-run-outcome--${won ? 'won' : 'lost'}${leaving ? ' is-leaving' : ''}`} role="dialog" aria-label={word} onClick={won ? jump : undefined}>
    {won && <Confetti />}
    <div className="vi-run-outcome__body" style={{ ['--vi-run-letters' as string]: word.length }}>
      <i className="vi-run-band vi-run-band--top" aria-hidden="true" />
      <LetterRow word={word} />
      <i className="vi-run-band vi-run-band--bottom" aria-hidden="true" />
      <p className="vi-run-line vi-run-line--accent">{subtitle || ' '}</p>
      <p className="vi-run-line vi-run-fade" style={{ animationDelay: `${titleEndsAt - 50}ms` }}>
        {english ? 'TIME' : 'TIEMPO'} {formatTime(shown.seconds)} · {english ? 'NODES' : 'NODOS'} {shown.nodesOwned}/{shown.nodesTotal} · SECTOR {shown.sector}/{RUN_SECTORS.length}
      </p>
      <p className="vi-run-heading vi-run-fade" style={{ animationDelay: `${titleEndsAt + 100}ms` }}>
        {won ? (english ? 'AUGMENTS YOU KEEP' : 'AUMENTOS QUE TE LLEVAS') : (english ? 'AUGMENTS LOST' : 'AUMENTOS PERDIDOS')}
      </p>
      <AugmentChips augments={shown.augments} locale={locale} lost={!won} empty={english ? 'NONE' : 'NINGUNO'} />
      <p className="vi-run-line vi-run-ledger vi-run-fade" style={{ animationDelay: `${titleEndsAt + 450}ms` }}>
        {won ? `TRANSACTION CONFIRMED · LEDGER #${ledgerNumber(shown.sector)}` : 'TRANSACTION FAILED · TX_BAD_SEQ'}
      </p>
      {won ? <div className="vi-run-countdown">
        <span>{nextStep} {secondsLeft}</span>
        <i><b style={{ animationDuration: `${OUTCOME_HOLD_MS}ms` }} /></i>
        <small>{english ? 'CLICK OR SPACE TO JUMP NOW' : 'CLIC O ESPACIO PARA SALTAR YA'}</small>
      </div> : <div className="vi-run-actions vi-run-fade" style={{ animationDelay: `${titleEndsAt + 700}ms` }}>
        {children}
        <div>
          <button className="vi-run-button vi-run-button--primary" onClick={run.onRestart}>{english ? 'Restart run' : 'Reiniciar run'}</button>
          <button className="vi-run-button" onClick={onLeave}>{english ? 'Back to command center' : 'Volver al centro de mando'}</button>
        </div>
        <small>{english ? 'The run starts again from sector 1, with no augments.' : 'La run vuelve a empezar desde el sector 1, sin aumentos.'}</small>
      </div>}
    </div>
  </div>;
}
