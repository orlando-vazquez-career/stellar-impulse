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
  /** How the try-on draws the piece: a hull tints the ship art with this CSS filter. */
  preview?: { filter?: string };
  /**
   * NFT pieces live on Stellar testnet: the player must own this class (contracts/cosmetics) to
   * equip it. Collection pieces are bought; merit pieces are earned in campaigns.
   */
  chain?: { classId: number; family: 'collection' | 'merit'; priceStroops: bigint };
}

export const cosmeticCatalog: CosmeticItem[] = [
  { id: 'aegis', category: 'hull', name: { es: 'Égida estándar', en: 'Standard Aegis' }, description: { es: 'Aleación naval azul de serie.', en: 'Standard blue naval alloy.' }, tone: '#36a9ff', unlocked: true, preview: { filter: 'saturate(1.18)' } },
  { id: 'polar', category: 'hull', name: { es: 'Polar MK-II', en: 'Polar MK-II' }, description: { es: 'Cerámica clara de alta visibilidad.', en: 'High-visibility light ceramic.' }, tone: '#dce9f5', unlocked: true, preview: { filter: 'grayscale(.78) brightness(1.35) saturate(.4)' } },
  { id: 'aurora-andina', category: 'hull', name: { es: 'Aurora andina', en: 'Andean Aurora' }, description: { es: 'Librea de colección con reflejos verdes de altura.', en: 'Collection livery with high-altitude green glints.' }, tone: '#4ad69a', unlocked: true, preview: { filter: 'hue-rotate(-45deg) saturate(1.2)' }, chain: { classId: 1, family: 'collection', priceStroops: 50_000_000n } },
  { id: 'obsidian', category: 'hull', name: { es: 'Obsidiana', en: 'Obsidian' }, description: { es: 'Blindaje oscuro de operaciones especiales.', en: 'Dark special-operations armor.' }, tone: '#8b79bb', unlocked: false, preview: { filter: 'grayscale(.65) brightness(.68) sepia(.3) hue-rotate(205deg) saturate(1.6)' } },
  { id: 'ion', category: 'trail', name: { es: 'Impulso iónico', en: 'Ion thrust' }, description: { es: 'Estela cian de combustión limpia.', en: 'Clean-burning cyan trail.' }, tone: '#83d4ff', unlocked: true },
  { id: 'solar', category: 'trail', name: { es: 'Arco solar', en: 'Solar arc' }, description: { es: 'Rastro dorado de alta energía.', en: 'High-energy golden wake.' }, tone: '#ffd84d', unlocked: true },
  { id: 'pulso-violeta', category: 'trail', name: { es: 'Pulso violeta', en: 'Violet Pulse' }, description: { es: 'Estela de colección con destellos violetas.', en: 'Collection trail with violet flashes.' }, tone: '#c08bff', unlocked: true, chain: { classId: 2, family: 'collection', priceStroops: 30_000_000n } },
  { id: 'void', category: 'trail', name: { es: 'Pulso del vacío', en: 'Void pulse' }, description: { es: 'Emisión violeta experimental.', en: 'Experimental violet emission.' }, tone: '#a978ff', unlocked: false },
  { id: 'vanguard', category: 'insignia', name: { es: 'Vanguardia', en: 'Vanguard' }, description: { es: 'Marca triangular de primera línea.', en: 'Front-line triangular mark.' }, tone: '#83d4ff', unlocked: true },
  { id: 'orbit', category: 'insignia', name: { es: 'Órbita', en: 'Orbit' }, description: { es: 'Emblema de control sectorial.', en: 'Sector-control emblem.' }, tone: '#f7e77c', unlocked: true },
  { id: 'primera-victoria', category: 'insignia', name: { es: 'Primera victoria', en: 'First Victory' }, description: { es: 'Emblema de mérito: gana una campaña multijugador 1v1 capturando el núcleo final.', en: 'Merit emblem: win a 1v1 multiplayer campaign by capturing the final core.' }, tone: '#ffd84d', unlocked: true, chain: { classId: 3, family: 'merit', priceStroops: 0n } },
  { id: 'exploracion', category: 'insignia', name: { es: 'Exploración', en: 'Exploration' }, description: { es: 'Emblema de mérito: termina una campaña multijugador 1v1, ganes o pierdas.', en: 'Merit emblem: finish a 1v1 multiplayer campaign, win or lose.' }, tone: '#83d4ff', unlocked: true, chain: { classId: 4, family: 'merit', priceStroops: 0n } },
  { id: 'vector', category: 'insignia', name: { es: 'Vector cero', en: 'Zero vector' }, description: { es: 'Insignia reservada para futuras operaciones.', en: 'Insignia reserved for future operations.' }, tone: '#ff9ba7', unlocked: false },
  { id: 'voz-vela', category: 'voice', name: { es: 'VELA · IA de a bordo', en: 'VELA · Onboard AI' }, description: { es: 'La IA de tu nave: serena, precisa y siempre atenta a la flota.', en: "Your ship's AI: calm, precise and always watching the fleet." }, tone: '#71e5dc', unlocked: true, announcer: { rate: 1, pitch: 1.05 } },
  // Locked until its own recordings exist; saved loadouts fall back to VELA meanwhile.
  { id: 'voz-comandante', category: 'voice', name: { es: 'Voz de Comandante', en: 'Commander Voice' }, description: { es: 'Paquete de voces del anunciador con tono de mando militar. Próximamente.', en: 'Announcer voice pack with a military command tone. Coming soon.' }, tone: '#83d4ff', unlocked: false, announcer: { rate: 1.08, pitch: 0.85 } },
  { id: 'voz-analista', category: 'voice', name: { es: 'Voz de Analista', en: 'Analyst Voice' }, description: { es: 'VELA con un procesado frío y digital, sereno y táctico.', en: 'VELA with a cold, digital processing: calm and tactical.' }, tone: '#71e5dc', unlocked: true, announcer: { rate: 0.95, pitch: 1.15 }, chain: { classId: 5, family: 'collection', priceStroops: 40_000_000n } },
  { id: 'musica-iron-vanguard', category: 'music', name: { es: 'Iron Vanguard', en: 'Iron Vanguard' }, description: { es: 'Pista de combate para tus partidas.', en: 'Battle track for your matches.' }, tone: '#ffd84d', unlocked: true, musicFile: '/audio/music/Iron_Vanguard.mp3' },
  { id: 'musica-gravity-final-path', category: 'music', name: { es: "Gravity's Final Path", en: "Gravity's Final Path" }, description: { es: 'Atmósfera del hangar para acompañar tus partidas.', en: 'Hangar atmosphere to accompany your matches.' }, tone: '#a978ff', unlocked: true, musicFile: '/audio/music/Gravity_s_Final_Path.mp3', chain: { classId: 6, family: 'collection', priceStroops: 20_000_000n } },
];

export function itemsForCategory(category: HangarCategory) {
  return cosmeticCatalog.filter((item) => item.category === category);
}

export function itemForClass(classId: number): CosmeticItem | undefined {
  return cosmeticCatalog.find((item) => item.chain?.classId === classId);
}

export function itemById(id: string | null | undefined): CosmeticItem | undefined {
  return id ? cosmeticCatalog.find((item) => item.id === id) : undefined;
}

/** The ship-art filter of a hull; `saturate(1)` keeps the glow when a hull has none of its own. */
export function hullFilter(item: CosmeticItem | undefined): string {
  return item?.preview?.filter || 'saturate(1)';
}

/** Free pieces need nothing; NFT pieces need their class in the player's wallet. */
export function canEquip(item: CosmeticItem, ownedClasses: ReadonlySet<number>): boolean {
  return item.unlocked && (!item.chain || ownedClasses.has(item.chain.classId));
}

/** A wallet balance rounded to cents: "9985.11 XLM". */
export function formatBalance(stroops: bigint): string {
  return `${(Number(stroops) / 10_000_000).toFixed(2)} XLM`;
}

/** "5 XLM", "2.5 XLM": stroops shown the way players read prices. */
export function formatXlm(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const fraction = (stroops % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''} XLM`;
}

const ILLUSTRATED_KEYS = new Set(['aurora-andina', 'pulso-violeta', 'primera-victoria', 'exploracion',
  'voz-comandante', 'voz-analista', 'musica-iron-vanguard', 'musica-gravity-final-path']);

export function imageForCosmetic(item: Pick<CosmeticItem, 'id' | 'image'>): string | null {
  return item.image ?? (ILLUSTRATED_KEYS.has(item.id) ? `/cosmetics/img/${item.id}.svg` : null);
}
