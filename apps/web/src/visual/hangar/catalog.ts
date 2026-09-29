import type { Locale } from '../i18n';

export type HangarCategory = 'hull' | 'trail' | 'insignia';

export interface CosmeticItem {
  id: string;
  category: HangarCategory;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  tone: string;
  unlocked: boolean;
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
];

export function itemsForCategory(category: HangarCategory) {
  return cosmeticCatalog.filter((item) => item.category === category);
}
