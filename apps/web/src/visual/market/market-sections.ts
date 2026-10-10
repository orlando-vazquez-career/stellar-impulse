import type { MarketListing, OwnedCosmetic } from '@impulso/chain';
import { cosmeticCatalog, itemForClass, type CosmeticItem } from '../hangar/catalog';

/** The shop mints these on purchase: collection pieces with a price. Merit emblems are earned, never sold. */
export function shopItems(catalog: readonly CosmeticItem[] = cosmeticCatalog): CosmeticItem[] {
  return catalog.filter((item) => item.unlocked && item.chain?.family === 'collection' && item.chain.priceStroops > 0n);
}

export interface SellablePiece {
  tokenId: number;
  item: CosmeticItem;
  /** This wallet's open listing of the piece, if it is on sale. */
  listing: MarketListing | null;
}

/** The wallet's pieces the market can take (collection pieces), oldest token first, with their listing. */
export function sellablePieces(owned: readonly OwnedCosmetic[], listings: readonly MarketListing[], wallet: string | null): SellablePiece[] {
  if (!wallet) return [];
  return [...owned]
    .sort((a, b) => a.tokenId - b.tokenId)
    .flatMap((piece) => {
      const item = itemForClass(piece.classId);
      if (item?.chain?.family !== 'collection') return [];
      const listing = listings.find((offer) => offer.tokenId === piece.tokenId && offer.seller === wallet) ?? null;
      return [{ tokenId: piece.tokenId, item, listing }];
    });
}

/** Open listings of one piece, cheapest first; with `exclude`, that seller's own listings are left out. */
export function listingsForItem(listings: readonly MarketListing[], item: CosmeticItem, exclude?: string | null): MarketListing[] {
  const classId = item.chain?.classId;
  if (classId === undefined) return [];
  return listings
    .filter((offer) => offer.classId === classId && (!exclude || offer.seller !== exclude))
    .sort((a, b) => (a.priceStroops === b.priceStroops ? a.listingId - b.listingId : a.priceStroops < b.priceStroops ? -1 : 1));
}
