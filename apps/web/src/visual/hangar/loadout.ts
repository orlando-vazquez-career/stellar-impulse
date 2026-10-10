import { canEquip, cosmeticCatalog, type CosmeticItem, type HangarCategory } from './catalog';
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

/**
 * What the try-on shows: the equipped loadout with `candidate` in its slot. Pure: it never saves,
 * so trying a piece on (owned or not) cannot change what the player takes into a match.
 */
export function previewLoadout(loadout: CosmeticLoadout, candidate: CosmeticItem | null | undefined): CosmeticLoadout {
  if (!candidate?.unlocked || loadout[candidate.category] === candidate.id) return loadout;
  return { ...loadout, [candidate.category]: candidate.id };
}

/** A bought NFT piece goes straight into its slot. Free or locked pieces are never bought. */
export function equipAfterPurchase(loadout: CosmeticLoadout, item: CosmeticItem): CosmeticLoadout {
  if (!item.chain || !item.unlocked || loadout[item.category] === item.id) return loadout;
  return { ...loadout, [item.category]: item.id };
}

export function saveCosmeticLoadout(loadout: CosmeticLoadout) {
  localStorage.setItem(storageKey, JSON.stringify(loadout));
}

/** Resolve only local, unlocked catalog entries; stored values never become audio URLs. */
export function equippedCosmetic(category: HangarCategory) {
  const loadout = loadCosmeticLoadout();
  return cosmeticCatalog.find((item) => item.category === category && item.id === loadout[category])!;
}
