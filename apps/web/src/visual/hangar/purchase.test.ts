import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketListing } from '@impulso/chain';
import { itemById } from './catalog';
import { defaultCosmeticLoadout, loadCosmeticLoadout, saveCosmeticLoadout } from './loadout';
import { readOwnedClasses, writeOwnedClasses } from './ownership';
import { buyCatalogPiece, buyListedPiece, type PurchaseChain } from './purchase';

const WALLET = 'GWALLETLINKED';
const HASH = 'ab'.repeat(32);

/** Records what was sent instead of signing in Freighter. */
function fakeChain(refuse = false) {
  const sent: unknown[][] = [];
  const chain: PurchaseChain = {
    buyCosmetic: async (buyer, classId) => {
      sent.push(['buyCosmetic', buyer, classId]);
      if (refuse) throw new Error('refused');
      return { tokenId: 7, transactionHash: HASH };
    },
    buyListing: async (buyer, listingId, maxPriceStroops) => {
      sent.push(['buyListing', buyer, listingId, maxPriceStroops]);
      if (refuse) throw new Error('refused');
      return { transactionHash: HASH };
    },
  };
  return { chain, sent };
}

/** A linked wallet (or none) that already holds `owned`. */
const buyerWith = (owned: number[], wallet: string | null = WALLET) => ({
  signer: async () => WALLET, wallet, owned: { current: new Set(owned) as ReadonlySet<number> },
});

const listingOf = (classId: number): MarketListing => ({
  listingId: 4, seller: 'GSELLER', tokenId: 12, classId, priceStroops: 50_000_000n, liveUntilLedger: 900,
});

describe('buying a piece', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    saveCosmeticLoadout({ ...defaultCosmeticLoadout, hull: 'polar' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('equips a shop piece the moment the purchase goes through, and counts it as owned', async () => {
    writeOwnedClasses(WALLET, [1]);
    const { chain, sent } = fakeChain();
    const bought = await buyCatalogPiece(chain, buyerWith([1]), itemById('voz-analista')!);

    expect(sent).toEqual([['buyCosmetic', WALLET, 5]]);
    expect(bought.receipt).toEqual({ tokenId: 7, transactionHash: HASH });
    expect([...bought.owned].sort()).toEqual([1, 5]);
    // Owned even if the next read fails, and in its slot for the next match.
    expect(readOwnedClasses(WALLET)).toEqual(new Set([1, 5]));
    expect(loadCosmeticLoadout(readOwnedClasses(WALLET))).toEqual({ ...defaultCosmeticLoadout, hull: 'polar', voice: 'voz-analista' });
  });

  it('equips a listing bought from another player at the price the player saw', async () => {
    const { chain, sent } = fakeChain();
    const bought = await buyListedPiece(chain, buyerWith([]), listingOf(1));

    expect(sent).toEqual([['buyListing', WALLET, 4, 50_000_000n]]);
    expect(bought.item?.id).toBe('aurora-andina');
    expect(bought.owned).toEqual(new Set([1]));
    expect(readOwnedClasses(WALLET)).toEqual(new Set([1]));
    expect(loadCosmeticLoadout(readOwnedClasses(WALLET))).toEqual({ ...defaultCosmeticLoadout, hull: 'aurora-andina' });
  });

  it('adds the piece to what the wallet holds when the sale goes through', async () => {
    const buyer = buyerWith([1]);
    const { chain } = fakeChain();
    // A read of the chain finished while the player was signing.
    const bought = await buyCatalogPiece({
      buyCosmetic: async (address, classId) => { buyer.owned.current = new Set([1, 2]); return chain.buyCosmetic(address, classId); },
    }, buyer, itemById('musica-gravity-final-path')!);
    expect(bought.owned).toEqual(new Set([1, 2, 6]));
    expect(readOwnedClasses(WALLET)).toEqual(new Set([1, 2, 6]));
  });

  it('changes nothing when the purchase is refused', async () => {
    writeOwnedClasses(WALLET, [2]);
    const { chain } = fakeChain(true);
    const buyer = buyerWith([2]);

    await expect(buyCatalogPiece(chain, buyer, itemById('voz-analista')!)).rejects.toThrow('refused');
    await expect(buyListedPiece(chain, buyer, listingOf(1))).rejects.toThrow('refused');
    expect(readOwnedClasses(WALLET)).toEqual(new Set([2]));
    expect(loadCosmeticLoadout(new Set([1, 2, 5]))).toEqual({ ...defaultCosmeticLoadout, hull: 'polar' });
  });

  it('never asks Freighter to sign for a free piece', async () => {
    const { chain, sent } = fakeChain();
    const signer = vi.fn(async () => WALLET);
    await expect(buyCatalogPiece(chain, { ...buyerWith([]), signer }, itemById('solar')!)).rejects.toThrow();
    expect(signer).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('equips nothing for a class the catalog does not know, or without a linked wallet', async () => {
    const { chain } = fakeChain();
    const unknown = await buyListedPiece(chain, buyerWith([2]), listingOf(99));
    expect(unknown.item).toBeUndefined();
    expect(unknown.owned).toEqual(new Set([2]));

    const unlinked = await buyCatalogPiece(chain, buyerWith([], null), itemById('voz-analista')!);
    expect(unlinked.owned).toEqual(new Set());
    expect(readOwnedClasses(WALLET)).toEqual(new Set());
    expect(loadCosmeticLoadout(new Set([5, 99]))).toEqual({ ...defaultCosmeticLoadout, hull: 'polar' });
  });
});
