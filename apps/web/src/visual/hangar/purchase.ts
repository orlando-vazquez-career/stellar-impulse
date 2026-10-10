import type { MarketListing, MarketReceipt, Purchase } from '@impulso/chain';
import { itemForClass, type CosmeticItem } from './catalog';
import { equipAfterPurchase, loadCosmeticLoadout, saveCosmeticLoadout } from './loadout';
import { writeOwnedClasses } from './ownership';

/** The two chain calls that buy a piece; the chain client is loaded lazily, so it is passed in. */
export interface PurchaseChain {
  buyCosmetic(buyer: string, classId: number): Promise<Purchase>;
  buyListing(buyer: string, listingId: number, maxPriceStroops: bigint): Promise<MarketReceipt>;
}

export interface Buyer {
  /** The address that signs in Freighter, checked to be the linked wallet. Asked only for a sale that can go ahead. */
  signer(): Promise<string>;
  /** The account's linked wallet, whose cached ownership is updated; null when none is linked. */
  wallet: string | null;
  /** The classes the wallet is known to hold, read when the sale goes through. */
  owned: { readonly current: ReadonlySet<number> };
}

/**
 * A bought piece counts as owned at once, even if the next read of the chain fails, and goes
 * straight into its slot. Returns the classes the wallet now holds.
 */
function equipBought(buyer: Buyer, item: CosmeticItem | undefined): ReadonlySet<number> {
  if (!item?.chain || !buyer.wallet) return buyer.owned.current;
  const owned = new Set([...buyer.owned.current, item.chain.classId]);
  writeOwnedClasses(buyer.wallet, owned);
  saveCosmeticLoadout(equipAfterPurchase(loadCosmeticLoadout(owned), item));
  return owned;
}

/** A primary sale from the shop; nothing changes unless the chain accepts it. */
export async function buyCatalogPiece(chain: Pick<PurchaseChain, 'buyCosmetic'>, buyer: Buyer, item: CosmeticItem) {
  if (!item.chain) throw new Error('not an NFT piece');
  const receipt = await chain.buyCosmetic(await buyer.signer(), item.chain.classId);
  return { receipt, owned: equipBought(buyer, item) };
}

/** Another player's listing, at the price the player saw; nothing changes unless the chain accepts it. */
export async function buyListedPiece(chain: Pick<PurchaseChain, 'buyListing'>, buyer: Buyer, listing: MarketListing) {
  const receipt = await chain.buyListing(await buyer.signer(), listing.listingId, listing.priceStroops);
  const item = itemForClass(listing.classId);
  return { receipt, item, owned: equipBought(buyer, item) };
}
