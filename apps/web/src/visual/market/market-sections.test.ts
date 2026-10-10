import { describe, expect, it } from 'vitest';
import { marketFee, MARKETPLACE_TESTNET, type MarketListing } from '@impulso/chain';
import { listingsForItem, MARKET_FEE_BPS, sellablePieces, sellerReceives, shopItems } from './market-sections';
import { itemById } from '../hangar/catalog';

const ME = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
const OTHER = 'GBKNU5OIKQ4F6GYBSHLFYFXBVJ57BU5G7MSRP2UKWM3R5WSKB6Z3M5GQ';
const listing = (listingId: number, tokenId: number, classId: number, seller: string, xlm: number): MarketListing => ({
  listingId, tokenId, classId, seller, priceStroops: BigInt(xlm) * 10_000_000n, liveUntilLedger: 9_000,
});

describe('market sections', () => {
  it('sells the four collection pieces in the shop and never a merit emblem', () => {
    const shop = shopItems();
    expect(shop.map((item) => item.chain?.classId)).toEqual([1, 2, 5, 6]);
    expect(shop.every((item) => item.chain!.priceStroops > 0n && item.chain!.family === 'collection')).toBe(true);
    expect(shop.map((item) => item.id)).not.toContain('primera-victoria');
  });

  it('offers the wallet collection pieces with their own open listing, oldest token first', () => {
    const owned = [{ tokenId: 9, classId: 5 }, { tokenId: 4, classId: 3 }, { tokenId: 2, classId: 1 }, { tokenId: 7, classId: 99 }];
    const listings = [listing(1, 9, 5, ME, 3), listing(2, 2, 1, OTHER, 4)];
    expect(sellablePieces(owned, listings, ME)).toEqual([
      { tokenId: 2, item: itemById('aurora-andina'), listing: null },
      { tokenId: 9, item: itemById('voz-analista'), listing: listings[0] },
    ]);
    expect(sellablePieces(owned, listings, null)).toEqual([]);
  });

  it('tells the seller what is left after the fee, like the contract', () => {
    expect(MARKET_FEE_BPS).toBe(BigInt(MARKETPLACE_TESTNET.feeBps));
    for (const price of [20_000_000n, 999n, 25_000_001n]) expect(sellerReceives(price)).toBe(price - marketFee(price));
  });

  it('lists the open offers of one piece cheapest first, leaving out the player own when asked', () => {
    const listings = [listing(1, 11, 1, OTHER, 6), listing(2, 12, 2, OTHER, 1), listing(3, 13, 1, ME, 4), listing(4, 14, 1, OTHER, 4)];
    const aurora = itemById('aurora-andina')!;
    expect(listingsForItem(listings, aurora).map((offer) => offer.listingId)).toEqual([3, 4, 1]);
    expect(listingsForItem(listings, aurora, ME).map((offer) => offer.listingId)).toEqual([4, 1]);
    expect(listingsForItem(listings, itemById('solar')!)).toEqual([]);
  });
});
