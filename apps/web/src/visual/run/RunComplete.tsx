import { useEffect } from 'react';
import { AugmentChips, LetterRow } from './RunOutcome';
import { formatTime, totalSeconds, type RunState } from './run-state';
import type { RunSfx } from './run-sfx';
import './run.css';

const TITLE_DELAY_MS = 200;
const LETTER_STAGGER_MS = 55;

/** The end of the run: every sector cleared, and a warning of what waits in the singularity. */
export function RunComplete({ run, locale, sfx, onNewRun, onLeave }: { run: RunState; locale: 'es' | 'en'; sfx: RunSfx; onNewRun(): void; onLeave(): void }) {
  const english = locale === 'en';
  const word = english ? 'RUN COMPLETE' : 'RUN COMPLETA';
  const titleEndsAt = TITLE_DELAY_MS + word.length * LETTER_STAGGER_MS + 420;
  const signalAt = titleEndsAt + 1400, actionsAt = titleEndsAt + 2600;
  useEffect(() => {
    sfx.play('win');
    const timer = setTimeout(() => sfx.play('impact'), signalAt);
    return () => clearTimeout(timer);
  }, []);
  return <main className="vi-run-complete vi-screen" style={{ ['--vi-run-letters' as string]: word.length }}>
    <LetterRow word={word} delayMs={TITLE_DELAY_MS} staggerMs={LETTER_STAGGER_MS} />
    <ol className="vi-run-history">
      {run.history.map((entry, index) => <li key={entry.sector} style={{ animationDelay: `${titleEndsAt + index * 160}ms` }}>
        <span>SECTOR {entry.sector}</span><strong>{entry.name.toUpperCase()}</strong><em>{formatTime(entry.seconds)}</em>
      </li>)}
    </ol>
    <p className="vi-run-line vi-run-fade" style={{ animationDelay: `${titleEndsAt + 600}ms` }}>
      {english ? 'TOTAL TIME' : 'TIEMPO TOTAL'} {formatTime(totalSeconds(run))} · {run.augments.length} {english ? 'AUGMENTS' : 'AUMENTOS'}
    </p>
    <div className="vi-run-fade" style={{ animationDelay: `${titleEndsAt + 750}ms` }}>
      <AugmentChips augments={run.augments} locale={locale} empty={english ? 'NONE' : 'NINGUNO'} />
    </div>
    <div className="vi-run-signal" style={{ animationDelay: `${signalAt}ms` }}>
      <p>{english ? 'SIGNAL DETECTED IN THE SINGULARITY' : 'SEÑAL DETECTADA EN LA SINGULARIDAD'}</p>
      <strong data-text="LEVIATHAN // NULL">LEVIATHAN // NULL</strong>
    </div>
    <div className="vi-run-actions vi-run-fade" style={{ animationDelay: `${actionsAt}ms` }}>
      <div>
        <button className="vi-run-button vi-run-button--primary" onClick={onNewRun}>{english ? 'New run' : 'Nueva run'}</button>
        <button className="vi-run-button" onClick={onLeave}>{english ? 'Back to command center' : 'Volver al centro de mando'}</button>
      </div>
    </div>
  </main>;
}
