import { PRACTICE_MAPS } from '@impulso/input';
import type { TrainingMapId } from '@impulso/sim';
import type { Locale } from '../i18n';

/** Sector 01 is the Tiled showcase map: it is not offered for practice, so it is named here. */
const SECTOR_01 = { es: 'Sector 01 · Umbral Helios', en: 'Sector 01 · Helios Threshold' } as const;

/** The display name of a map in the player's language. */
export function mapName(id: TrainingMapId, locale: Locale): string {
  if (id === 'sector-01') return SECTOR_01[locale];
  return PRACTICE_MAPS.find((map) => map.id === id)?.name[locale] ?? id;
}
