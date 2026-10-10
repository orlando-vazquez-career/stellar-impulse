import type { AugmentCardView } from '@impulso/state';
import type { Locale } from '../i18n';
import { mapName } from '../map/map-name';
import type { TrainingMapId } from '../map/sector-map';

export interface RunSector {
  map: TrainingMapId;
  name: string;
  hint: { es: string; en: string };
}

/** The run, in order. Winning a sector jumps to the next one; winning the last closes the run. */
export const RUN_SECTORS: readonly RunSector[] = [
  { map: 'espiral', name: 'Espiral Estelar', hint: { es: 'Carriles de impulso, nebulosas y un núcleo con escudo', en: 'Impulse lanes, nebulas and a shielded core' } },
  { map: 'espiral-2', name: 'Caos Estelar', hint: { es: 'Niebla morada que avanza y satélites que caen por turnos', en: 'Creeping purple fog and satellites falling in turns' } },
  { map: 'trascendencia', name: 'Trascendencia Estelar', hint: { es: 'Estaciones capturables, barreras y una señal que no debería estar ahí', en: 'Capturable stations, barriers and a signal that should not be there' } },
];

/** How long GANASTE stays up before the jump, unless the player skips it. */
export const OUTCOME_HOLD_MS = 3500;

export interface SectorSummary {
  /** 1-based. */
  sector: number;
  name: string;
  seconds: number;
  nodesOwned: number;
  nodesTotal: number;
  /** Every augment owned when the sector ended, carried ones included. */
  augments: AugmentCardView[];
}

/** What survives between maps: the sector being played, the augments won so far and the sectors already cleared. */
export interface RunState {
  /** Index into RUN_SECTORS. */
  sector: number;
  augments: AugmentCardView[];
  history: SectorSummary[];
}

export const newRun = (): RunState => ({ sector: 0, augments: [], history: [] });

export const isLastSector = (run: RunState): boolean => run.sector >= RUN_SECTORS.length - 1;

/** The run after winning its current sector. On the last sector it stays there, with the history complete. */
export function afterVictory(run: RunState, summary: SectorSummary): RunState {
  return {
    sector: isLastSector(run) ? run.sector : run.sector + 1,
    augments: summary.augments,
    history: [...run.history, summary],
  };
}

export const totalSeconds = (run: RunState): number => run.history.reduce((sum, entry) => sum + entry.seconds, 0);

/** The name of a cleared sector in the language on screen, read from its map when it is drawn. */
export function clearedSectorName(entry: SectorSummary, locale: Locale): string {
  const sector = RUN_SECTORS[entry.sector - 1];
  return sector ? mapName(sector.map, locale) : entry.name;
}

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/** Flavour only: the ledger a won sector is "closed" in. */
export const ledgerNumber = (sector: number): string => (48213907 + sector).toLocaleString('en-US');
