/**
 * The NFT classes the linked wallet held when the hangar last read the chain. Equipping and the
 * match read this copy so they never wait for the network; the hangar refreshes it.
 * Cosmetics never change combat, so a stale copy can only change how your own ships look.
 */
const storageKey = 'impulso.owned-cosmetics';

interface StoredOwnership { wallet: string; classIds: number[] }

export function readOwnedClasses(wallet: string | null | undefined): Set<number> {
  if (!wallet) return new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as StoredOwnership | null;
    if (!stored || stored.wallet !== wallet || !Array.isArray(stored.classIds)) return new Set();
    return new Set(stored.classIds.filter((id) => Number.isInteger(id) && id > 0));
  } catch {
    return new Set();
  }
}

export function writeOwnedClasses(wallet: string | null | undefined, classIds: Iterable<number>): void {
  try {
    if (!wallet) { localStorage.removeItem(storageKey); return; }
    localStorage.setItem(storageKey, JSON.stringify({ wallet, classIds: [...new Set(classIds)] } satisfies StoredOwnership));
  } catch { /* the hangar still shows ownership; equipping falls back to free pieces */ }
}

/** The wallet whose ownership is cached, so the match can check without the account. */
export function cachedWallet(): string | null {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as StoredOwnership | null;
    return typeof stored?.wallet === 'string' ? stored.wallet : null;
  } catch {
    return null;
  }
}
