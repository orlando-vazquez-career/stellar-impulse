import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MarketListing, OwnedCosmetic } from '@impulso/chain';
import { linkWalletAccount, requestWalletChallenge, unlinkWalletAccount, type AccountUser } from '../../auth/client';
import { translate, type Locale } from '../i18n';
import { itemForClass, type CosmeticItem } from '../hangar/catalog';
import { equipAfterPurchase, loadCosmeticLoadout, saveCosmeticLoadout } from '../hangar/loadout';
import { readOwnedClasses, writeOwnedClasses } from '../hangar/ownership';
import { chainErrorHash, chainErrorText, short, WrongAccountError } from './chain-errors';

/** The chain client (Stellar SDK + Freighter) loads only when a panel needs it. */
const chain = () => import('@impulso/chain');

export type ChainNotice = { tone: 'info' | 'good' | 'bad'; text: string; transactionHash?: string } | null;

/** What the panel is waiting for, so it can say "sign in Freighter…" and lock the buttons. */
export type ChainBusy = null | 'loading' | 'linking' | 'unlinking' | 'buying' | 'listing' | 'cancelling' | 'trading';

export interface CosmeticsChainOptions {
  /** Also read the open listings and the XLM balance (the Market); the Hangar only needs ownership. */
  market?: boolean;
}

/**
 * Wallet, inventory and market state for one panel (each panel runs its own). Reads need no wallet;
 * every write is signed in Freighter by the account's linked address, checked to be that address first.
 * Ownership starts from the cached copy, so pieces held last time show as owned before the read.
 */
export function useCosmeticsChain(
  account: AccountUser | null, onAccountChange: (user: AccountUser) => void, locale: Locale,
  { market = true }: CosmeticsChainOptions = {},
) {
  const wallet = account?.walletAddress ?? null;
  const [owned, setOwned] = useState<OwnedCosmetic[]>([]);
  const [ownedClasses, setOwnedClasses] = useState<ReadonlySet<number>>(() => readOwnedClasses(wallet));
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<ChainBusy>(null);
  const [notice, setNotice] = useState<ChainNotice>(null);
  /** True once the wallet's pieces were read; until then nothing is unequipped. */
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const ownedRef = useRef(ownedClasses);
  ownedRef.current = ownedClasses;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(localeRef.current, key, values);

  const refresh = useCallback(async () => {
    // A guest's hangar has nothing to read: no wallet, no listings.
    if (!wallet && !market) {
      setOwned([]);
      setOwnedClasses(new Set());
      writeOwnedClasses(null, []);
      setLoaded(true);
      return;
    }
    setBusy((current) => current ?? 'loading');
    try {
      const api = await chain();
      const [pieces, offers, xlm] = await Promise.all([
        wallet ? api.ownedCosmetics(wallet) : Promise.resolve([]),
        market ? api.marketListings() : Promise.resolve([]),
        wallet && market ? api.xlmBalance(wallet) : Promise.resolve(null),
      ]);
      if (!alive.current) return;
      setOwned(pieces);
      setOwnedClasses(new Set(pieces.map((piece) => piece.classId)));
      setListings(offers);
      setBalance(xlm);
      writeOwnedClasses(wallet, pieces.map((piece) => piece.classId));
      setLoaded(true);
    } catch {
      if (alive.current) setNotice({ tone: 'bad', text: translate(localeRef.current, 'chainReadFailed') });
    } finally {
      if (alive.current) setBusy((current) => (current === 'loading' ? null : current));
    }
  }, [wallet, market]);

  useEffect(() => {
    setOwnedClasses(readOwnedClasses(wallet));
    void refresh();
  }, [refresh, wallet]);

  const listingByToken = useMemo(() => new Map(listings.map((listing) => [listing.tokenId, listing])), [listings]);

  /** Freighter must be on testnet and on the linked account before anything is signed. */
  const signerAddress = useCallback(async (): Promise<string> => {
    const connection = await (await chain()).connectFreighterTestnet();
    if (wallet && connection.address !== wallet) throw new WrongAccountError(connection.address, wallet);
    return connection.address;
  }, [wallet]);

  /** Runs one signed action with its busy state, a success line and a refresh. */
  const run = useCallback(async (kind: Exclude<ChainBusy, null>, action: () => Promise<{ text: string; transactionHash?: string }>) => {
    setBusy(kind);
    setNotice({ tone: 'info', text: translate(localeRef.current, kind === 'linking' ? 'chainSignChallenge' : 'chainSign') });
    try {
      const done = await action();
      if (!alive.current) return;
      setNotice({ tone: 'good', ...done });
      await refresh();
    } catch (error) {
      if (alive.current) setNotice({ tone: 'bad', text: chainErrorText(error, localeRef.current), transactionHash: chainErrorHash(error) });
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [refresh]);

  /** A bought piece is equipped at once, and counted as owned even if the next read fails. */
  const equipBought = useCallback((item: CosmeticItem | undefined) => {
    if (!item?.chain || !wallet) return;
    const classes = new Set([...ownedRef.current, item.chain.classId]);
    writeOwnedClasses(wallet, classes);
    setOwnedClasses(classes);
    saveCosmeticLoadout(equipAfterPurchase(loadCosmeticLoadout(classes), item));
  }, [wallet]);

  const nameOf = (item: CosmeticItem | undefined, fallback: string) => item?.name[localeRef.current] ?? fallback;

  const link = useCallback(() => run('linking', async () => {
    const api = await chain();
    const address = (await api.connectFreighterTestnet()).address;
    const challenge = await requestWalletChallenge(address);
    const signed = await api.signWalletChallenge(challenge, address);
    onAccountChange(await linkWalletAccount(signed));
    return { text: t('chainLinkedDone', { address: short(address) }) };
  }), [run, onAccountChange]);

  const unlink = useCallback(() => run('unlinking', async () => {
    onAccountChange(await unlinkWalletAccount());
    writeOwnedClasses(null, []);
    return { text: t('chainUnlinkedDone') };
  }), [run, onAccountChange]);

  const buy = useCallback((item: CosmeticItem) => run('buying', async () => {
    if (!item.chain) throw new Error('not an NFT piece');
    const receipt = await (await chain()).buyCosmetic(await signerAddress(), item.chain.classId);
    equipBought(item);
    return { text: t('chainBoughtDone', { name: nameOf(item, item.id), token: receipt.tokenId }), transactionHash: receipt.transactionHash };
  }), [run, signerAddress, equipBought]);

  const list = useCallback((tokenId: number, priceStroops: bigint) => run('listing', async () => {
    const receipt = await (await chain()).listCosmetic(await signerAddress(), tokenId, priceStroops);
    return { text: t('chainListedDone', { listing: receipt.listingId }), transactionHash: receipt.transactionHash };
  }), [run, signerAddress]);

  const cancel = useCallback((listingId: number) => run('cancelling', async () => {
    const receipt = await (await chain()).cancelListing(await signerAddress(), listingId);
    return { text: t('chainCancelledDone', { listing: listingId }), transactionHash: receipt.transactionHash };
  }), [run, signerAddress]);

  const buyListing = useCallback((listing: MarketListing) => run('trading', async () => {
    const receipt = await (await chain()).buyListing(await signerAddress(), listing.listingId, listing.priceStroops);
    const item = itemForClass(listing.classId);
    equipBought(item);
    return { text: t('chainTradedDone', { name: nameOf(item, `#${listing.tokenId}`) }), transactionHash: receipt.transactionHash };
  }), [run, signerAddress, equipBought]);

  return {
    wallet, owned, ownedClasses, listings, listingByToken, balance, busy, notice, loaded,
    refresh, link, unlink, buy, list, cancel, buyListing, dismiss: () => setNotice(null),
  };
}

export type CosmeticsChain = ReturnType<typeof useCosmeticsChain>;
