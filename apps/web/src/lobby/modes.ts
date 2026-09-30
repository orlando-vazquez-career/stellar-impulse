import type { LobbyMode, ModeOption } from '@impulso/ui';

export interface GameMode extends LobbyMode {
  pitch: number;
}

const TRAINING_MODE_ID = 'training';
const TRAINING_SECTOR_NAME = 'Un sector';

const option = (name: string, meta: string): ModeOption => ({ name, meta });

export const planetSpritePath = (mode: { id: string }) => `assets/planets/${mode.id}.gif`;

function mode(entry: Omit<GameMode, 'sprite'>): GameMode {
  return { ...entry, sprite: planetSpritePath(entry) };
}

export const MODES: readonly GameMode[] = [
  mode({
    id: 'campaign', num: '01', name: 'Campaña', code: 'CMP', meta: '3 sectores',
    accent: '#f2a65a', pitch: 440, x: 257, y: 217,
    blurb: 'Tres sectores contra la IA. Explora para prepararte, combate para avanzar, defiende para ganar.',
    options: [option('Sector I', 'Explorar'), option('Sector II', 'Combatir'), option('Sector III', 'Defender')],
  }),
  mode({
    id: 'versus', num: '02', name: 'Versus', code: 'VRS', meta: '1v1',
    accent: '#ff7a59', pitch: 494, x: 527, y: 197,
    blurb: 'Un rival, una sala. Comparte el código y que gane la mejor flota.',
    options: [option('Crear sala', 'Código nuevo'), option('Unirse', 'Pegar código'), option('Contra IA', 'Práctica')],
  }),
  mode({
    id: 'training', num: '03', name: 'Entrenamiento', code: 'ENT', meta: 'Sala local',
    accent: '#5fe0c8', pitch: 523, x: 607, y: 427,
    blurb: 'Un sector para practicar órdenes sin presión: patrulla, guardia y ataque en movimiento.',
    options: [option('Un sector', 'Libre'), option('Órdenes', 'Guiado'), option('Dos pestañas', 'Segundo asiento')],
  }),
  mode({
    id: 'hangar', num: '04', name: 'Hangar', code: 'HGR', meta: 'Cosméticos',
    accent: '#b48cff', pitch: 587, x: 477, y: 607,
    blurb: 'Personaliza tu flota. Lo que compras cambia cómo se ve, nunca cuánto pega.',
    options: [option('Naves', 'Aspectos'), option('Estelas', 'Efectos'), option('Wallet', 'Freighter')],
  }),
  mode({
    id: 'settings', num: '05', name: 'Ajustes', code: 'CFG', meta: 'Sistema',
    accent: '#9fc6ff', pitch: 659, x: 207, y: 567,
    blurb: 'Audio, imagen, controles y red. Deja todo a tu medida antes de salir.',
    options: [option('Audio', 'Volumen'), option('Video', 'Calidad'), option('Controles', 'Atajos'), option('Red', 'Testnet')],
  }),
  mode({
    id: 'credits', num: '06', name: 'Créditos', code: 'CRD', meta: 'Equipo',
    accent: '#f6d79a', pitch: 740, x: 117, y: 387,
    blurb: 'Las personas detrás de Impulso Stellar.',
    options: [
      option('Hans', 'Calidad · demo'), option('Diego', 'Reglas · balance'), option('Yamil', 'Juego · sim'),
      option('Orlando', 'Backend · cadena'), option('Ismael', 'Arte · interfaz'),
    ],
  }),
];

export function findMode(id: string): GameMode {
  const found = MODES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Modo desconocido: ${id}`);
  return found;
}

export function openingMode(): GameMode {
  const first = MODES[0];
  if (!first) throw new Error('El catálogo de modos está vacío');
  return first;
}

export function opensCurrentArena(mode: GameMode, optionIndex: number): boolean {
  return mode.id === TRAINING_MODE_ID && mode.options[optionIndex]?.name === TRAINING_SECTOR_NAME;
}
