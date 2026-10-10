import { formatMessage, type Locale } from '../i18n';

/** Texts of the preparation lobby that are not in the shared hub dictionary. */
const es = {
  difficultyLegend: 'Dificultad de la IA rival',
  difficultyEasy: 'Fácil',
  difficultyEasyHint: 'Flota chica y lenta. No ataca tus nodos.',
  difficultyMedium: 'Media',
  difficultyMediumHint: 'Se expande rápido y pelea por todo.',
  difficultyHard: 'Difícil',
  difficultyHardHint: 'Toma dos nodos a la vez y asalta los tuyos.',
  mapPreview: 'Vista previa de {map}',
} as const;

const en: Record<keyof typeof es, string> = {
  difficultyLegend: 'Rival AI difficulty',
  difficultyEasy: 'Easy',
  difficultyEasyHint: 'Small, slow fleet. It does not attack your nodes.',
  difficultyMedium: 'Medium',
  difficultyMediumHint: 'Expands fast and fights for everything.',
  difficultyHard: 'Hard',
  difficultyHardHint: 'Takes two nodes at once and raids yours.',
  mapPreview: 'Preview of {map}',
};

export type LobbyKey = keyof typeof es;
export const LOBBY_KEYS = Object.keys(es) as LobbyKey[];

export function lobbyText(locale: Locale, key: LobbyKey, values?: Record<string, string | number>) {
  return formatMessage((locale === 'en' ? en : es)[key], values);
}
