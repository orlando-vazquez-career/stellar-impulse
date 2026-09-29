import { cosmeticCatalog, type HangarCategory } from './catalog';

export type CosmeticLoadout = Record<HangarCategory, string>;

export const defaultCosmeticLoadout: CosmeticLoadout = {
  hull: 'aegis',
  trail: 'ion',
  insignia: 'vanguard',
};

const storageKey = 'impulso.cosmetic-loadout';

export function loadCosmeticLoadout(): CosmeticLoadout {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<CosmeticLoadout>;
    return (Object.keys(defaultCosmeticLoadout) as HangarCategory[]).reduce((loadout, category) => {
      const candidate = cosmeticCatalog.find((item) => item.id === parsed[category] && item.category === category && item.unlocked);
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
