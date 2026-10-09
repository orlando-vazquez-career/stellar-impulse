import type { Locale } from '../i18n';

export const hangarCategories = ['hull', 'trail', 'insignia', 'voice', 'music'] as const;
export type HangarCategory = typeof hangarCategories[number];

export interface AnnouncerProfile { rate: number; pitch: number }

export interface CosmeticItem {
  id: string;
  category: HangarCategory;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  tone: string;
  image?: string | null;
  unlocked: boolean;
  musicFile?: string;
  announcer?: AnnouncerProfile;
}

export const cosmeticCatalog: CosmeticItem[] = [
  { id: 'aegis', category: 'hull', name: { es: 'Égida estándar', en: 'Standard Aegis' }, description: { es: 'Aleación naval azul de serie.', en: 'Standard blue naval alloy.' }, tone: '#36a9ff', unlocked: true },
  { id: 'polar', category: 'hull', name: { es: 'Polar MK-II', en: 'Polar MK-II' }, description: { es: 'Cerámica clara de alta visibilidad.', en: 'High-visibility light ceramic.' }, tone: '#dce9f5', unlocked: true },
  { id: 'obsidian', category: 'hull', name: { es: 'Obsidiana', en: 'Obsidian' }, description: { es: 'Blindaje oscuro de operaciones especiales.', en: 'Dark special-operations armor.' }, tone: '#8b79bb', unlocked: false },
  { id: 'ion', category: 'trail', name: { es: 'Impulso iónico', en: 'Ion thrust' }, description: { es: 'Estela cian de combustión limpia.', en: 'Clean-burning cyan trail.' }, tone: '#83d4ff', unlocked: true },
  { id: 'solar', category: 'trail', name: { es: 'Arco solar', en: 'Solar arc' }, description: { es: 'Rastro dorado de alta energía.', en: 'High-energy golden wake.' }, tone: '#ffd84d', unlocked: true },
  { id: 'void', category: 'trail', name: { es: 'Pulso del vacío', en: 'Void pulse' }, description: { es: 'Emisión violeta experimental.', en: 'Experimental violet emission.' }, tone: '#a978ff', unlocked: false },
  { id: 'vanguard', category: 'insignia', name: { es: 'Vanguardia', en: 'Vanguard' }, description: { es: 'Marca triangular de primera línea.', en: 'Front-line triangular mark.' }, tone: '#83d4ff', unlocked: true },
  { id: 'orbit', category: 'insignia', name: { es: 'Órbita', en: 'Orbit' }, description: { es: 'Emblema de control sectorial.', en: 'Sector-control emblem.' }, tone: '#f7e77c', unlocked: true },
  { id: 'vector', category: 'insignia', name: { es: 'Vector cero', en: 'Zero vector' }, description: { es: 'Insignia reservada para futuras operaciones.', en: 'Insignia reserved for future operations.' }, tone: '#ff9ba7', unlocked: false },
  { id: 'voz-comandante', category: 'voice', name: { es: 'Voz de Comandante', en: 'Commander Voice' }, description: { es: 'Paquete de voces del anunciador con tono de mando militar.', en: 'Announcer voice pack with a military command tone.' }, tone: '#83d4ff', unlocked: true, announcer: { rate: 1.08, pitch: 0.85 } },
  { id: 'voz-analista', category: 'voice', name: { es: 'Voz de Analista', en: 'Analyst Voice' }, description: { es: 'Paquete de voces del anunciador, calmo y táctico.', en: 'Calm, tactical announcer voice pack.' }, tone: '#71e5dc', unlocked: true, announcer: { rate: 0.95, pitch: 1.15 } },
  { id: 'musica-iron-vanguard', category: 'music', name: { es: 'Iron Vanguard', en: 'Iron Vanguard' }, description: { es: 'Pista de combate para tus partidas.', en: 'Battle track for your matches.' }, tone: '#ffd84d', unlocked: true, musicFile: '/audio/music/Iron_Vanguard.mp3' },
  { id: 'musica-gravity-final-path', category: 'music', name: { es: "Gravity's Final Path", en: "Gravity's Final Path" }, description: { es: 'Atmósfera del hangar para acompañar tus partidas.', en: 'Hangar atmosphere to accompany your matches.' }, tone: '#a978ff', unlocked: true, musicFile: '/audio/music/Gravity_s_Final_Path.mp3' },
];

export function itemsForCategory(category: HangarCategory) {
  return cosmeticCatalog.filter((item) => item.category === category);
}

const ILLUSTRATED_KEYS = new Set(['aurora-andina', 'pulso-violeta', 'primera-victoria', 'exploracion',
  'voz-comandante', 'voz-analista', 'musica-iron-vanguard', 'musica-gravity-final-path']);

export function imageForCosmetic(item: Pick<CosmeticItem, 'id' | 'image'>): string | null {
  return item.image ?? (ILLUSTRATED_KEYS.has(item.id) ? `/cosmetics/img/${item.id}.svg` : null);
}
