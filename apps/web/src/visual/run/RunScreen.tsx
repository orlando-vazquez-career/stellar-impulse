import type { DurationMode } from '@impulso/sim';
import { useEffect, useState } from 'react';
import { GameplayScreen } from '../game/GameplayScreen';
import { useI18n } from '../i18n';
import type { RivalDifficulty } from '../lobby/PreparationLobby';
import type { VisualPreferences } from '../settings/preferences';
import { RunComplete } from './RunComplete';
import type { RunLink } from './RunOutcome';
import { RunWarp } from './RunWarp';
import { RunSfx } from './run-sfx';
import { RUN_SECTORS, afterVictory, isLastSector, newRun } from './run-state';

type Phase = 'warp' | 'match' | 'complete';
type Arrival = 'start' | 'jump' | 'restart' | 'new';
const ARRIVAL_LABEL: Record<Arrival, { es: string; en: string }> = {
  start: { es: 'INICIANDO RUN', en: 'RUN STARTING' },
  jump: { es: 'SALTO COMPLETADO', en: 'JUMP COMPLETE' },
  restart: { es: 'REINICIANDO RUN', en: 'RUN RESTARTING' },
  new: { es: 'NUEVA RUN', en: 'NEW RUN' },
};

/**
 * A run of sectors against the AI: each won map jumps to the next one with the augments won so far,
 * and a lost one sends the run back to sector 1 with nothing.
 */
export function RunScreen({ preferences, difficulty, duration, onLeave, onAudioChange }: { preferences: VisualPreferences; difficulty: RivalDifficulty; duration: DurationMode; onLeave(): void; onAudioChange?(audio: VisualPreferences['audio']): void }) {
  const { locale } = useI18n();
  const [run, setRun] = useState(newRun);
  const [phase, setPhase] = useState<Phase>('warp');
  const [arrival, setArrival] = useState<Arrival>('start');
  const [jumps, setJumps] = useState(0);
  // One synth for the whole run; its sounds follow the live effects channel.
  const [sfx] = useState(() => new RunSfx());
  useEffect(() => () => sfx.dispose(), [sfx]);

  const arrive = (next: Arrival) => {
    setArrival(next);
    setJumps((count) => count + 1);
    setPhase('warp');
  };
  const sector = RUN_SECTORS[run.sector]!;
  if (phase === 'warp') return <RunWarp key={jumps} sector={sector} number={run.sector + 1} label={ARRIVAL_LABEL[arrival][locale]} augments={run.augments} locale={locale} sfx={sfx} onDone={() => setPhase('match')} />;
  if (phase === 'complete') return <RunComplete run={run} locale={locale} sfx={sfx} onNewRun={() => { setRun(newRun()); arrive('new'); }} onLeave={onLeave} />;
  const link: RunLink = {
    state: run,
    sfx,
    onVictory: (summary) => {
      const last = isLastSector(run);
      setRun(afterVictory(run, summary));
      if (last) setPhase('complete'); else arrive('jump');
    },
    onRestart: () => { setRun(newRun()); arrive('restart'); },
  };
  return <GameplayScreen key={jumps} preferences={preferences} difficulty={difficulty} map={sector.map} duration={duration} run={link} onLeave={onLeave} onAudioChange={onAudioChange} />;
}
