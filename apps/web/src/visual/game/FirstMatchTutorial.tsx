import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Panel } from '../shared/Panel';
import type { GameplayViewModel } from './model';
import { createTutorialObserver, markTutorialSeen, tutorialWasSeen, TUTORIAL_STEPS } from './tutorial';
import './tutorial.css';

const COPY = [
  ['tutorialSelectTitle', 'tutorialSelectBody'],
  ['tutorialMoveTitle', 'tutorialMoveBody'],
  ['tutorialProduceTitle', 'tutorialProduceBody'],
  ['tutorialCaptureTitle', 'tutorialCaptureBody'],
  ['tutorialRefineryTitle', 'tutorialRefineryBody'],
] as const;

export function FirstMatchTutorial({ view }: { view: GameplayViewModel }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(tutorialWasSeen);
  const [step, setStep] = useState(0);
  const observer = useRef<ReturnType<typeof createTutorialObserver> | null>(null);
  const ready = view.connection === 'online' && view.clockRunning && view.tick > 0;
  useEffect(() => {
    if (dismissed || !ready || view.result) return;
    observer.current ??= createTutorialObserver(view);
    const next = observer.current.observe(view);
    setStep(next);
    if (next === TUTORIAL_STEPS.length) { markTutorialSeen(); setDismissed(true); }
  }, [view, ready, dismissed]);
  if (dismissed || !ready || view.result || !COPY[step]) return null;
  const finish = () => { markTutorialSeen(); setDismissed(true); };
  const skip = () => {
    const next = observer.current?.skip() ?? step + 1;
    if (next === TUTORIAL_STEPS.length) finish();
    else setStep(next);
  };
  return <Panel className="vi-tutorial">
    <div role="region" aria-label={t('tutorialLabel')} data-step={TUTORIAL_STEPS[step]}>
      <header><span>{t('tutorialLabel')}</span><small>{step + 1} / {TUTORIAL_STEPS.length}</small></header>
      <div aria-live="polite" aria-atomic="true">
        <h2>{t(COPY[step][0])}</h2><p>{t(COPY[step][1])}</p>
      </div>
      <footer><button onClick={skip}>{t('tutorialSkipStep')}</button><button onClick={finish}>{t('tutorialSkipAll')}</button></footer>
    </div>
  </Panel>;
}
