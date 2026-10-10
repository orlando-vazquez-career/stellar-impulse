import { canEquip, cosmeticCatalog, type HangarCategory } from './catalog';
import { cachedWallet, readOwnedClasses } from './ownership';

export type CosmeticLoadout = Record<HangarCategory, string>;

export const defaultCosmeticLoadout: CosmeticLoadout = {
  hull: 'aegis',
  trail: 'ion',
  insignia: 'vanguard',
  voice: 'voz-vela',
  music: 'musica-iron-vanguard',
};

const storageKey = 'impulso.cosmetic-loadout';

/** NFT pieces count only while the cached wallet still holds them; otherwise the default returns. */
export function loadCosmeticLoadout(ownedClasses: ReadonlySet<number> = readOwnedClasses(cachedWallet())): CosmeticLoadout {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<CosmeticLoadout>;
    return (Object.keys(defaultCosmeticLoadout) as HangarCategory[]).reduce((loadout, category) => {
      const candidate = cosmeticCatalog.find((item) => item.id === parsed[category] && item.category === category && canEquip(item, ownedClasses));
      loadout[category] = candidate?.id ?? defaultCosmeticLoadout[category];
      return loadout;
    }, { ...defaultCosmeticLoadout });
  } catch {
    return { ...defaultCosmeticLoadout };
  }
}

export function saveCosmeticLoadout(loadout: CosmeticLoadout) {
  localStorage.setItem(storageKey, JSON.stringify(loadout));
}

/** Resolve only local, unlocked catalog entries; stored values never become audio URLs. */
export function equippedCosmetic(category: HangarCategory) {
  const loadout = loadCosmeticLoadout();
  return cosmeticCatalog.find((item) => item.category === category && item.id === loadout[category])!;
}
