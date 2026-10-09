import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MarketListing, OwnedCosmetic } from '@impulso/chain';
import { linkWalletAccount, requestWalletChallenge, unlinkWalletAccount, type AccountUser } from '../../auth/client';
import type { useI18n } from '../i18n';
import { itemForClass, type CosmeticItem } from './catalog';
import { writeOwnedClasses } from './ownership';

/** The chain client (Stellar SDK + Freighter) loads only when the hangar needs it. */
const chain = () => import('@impulso/chain');

type I18n = ReturnType<typeof useI18n>;

export type ChainNotice = { tone: 'info' | 'good' | 'bad'; text: string; transactionHash?: string } | null;

/** What the hangar is waiting for, so it can say "sign in Freighter…" and lock the buttons. */
export type ChainBusy = null | 'loading' | 'linking' | 'unlinking' | 'buying' | 'listing' | 'cancelling' | 'trading';

/** Freighter is open on an account other than the one linked to this game account. */
class WrongAccountError extends Error {
  constructor(readonly active: string, readonly linked: string) { super('wrong account'); }
}

export function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Turns chain, wallet and server failures into one line in the player's language. */
export function chainErrorText(error: unknown, { t, locale }: I18n): string {
  if (error instanceof WrongAccountError) return t('chainWrongAccount', { active: short(error.active), linked: short(error.linked) });
  if (error && typeof error === 'object' && 'code' in error) {
    const { code, contractCode, message } = error as { code: unknown; contractCode?: unknown; message?: unknown };
    switch (code) {
      case 'WALLET_UNAVAILABLE': return t('chainNoFreighter');
      case 'WALLET_REJECTED': return t('chainRejected');
      case 'NETWORK_MISMATCH': return t('chainWrongNetwork');
      case 'UNFUNDED_ACCOUNT': return t('chainUnfunded');
      case 'RPC_UNAVAILABLE': return t('chainReadFailed');
      case 'CONTRACT_REJECTED':
        // The chain client words contract refusals in Spanish; other languages get the code.
        return locale === 'es' && typeof message === 'string' ? message : t('chainContractRefused', { code: String(contractCode ?? '?') });
      case 'wallet_in_use': return t('chainWalletInUse');
      case 'wallet_challenge_expired': return t('chainChallengeExpired');
      case 'invalid_wallet_signature': return t('chainBadSignature');
      case 'authentication_required': return t('chainSessionExpired');
    }
  }
  return t('chainActionFailed');
}

/**
 * Wallet, inventory and market state for the hangar. Reads need no wallet; every write is
 * signed in Freighter by the account's linked address, checked to be that address first.
 */
export function useHangarChain(account: AccountUser | null, onAccountChange: (user: AccountUser) => void, i18n: I18n) {
  const { t, locale } = i18n;
  const wallet = account?.walletAddress ?? null;
  const [owned, setOwned] = useState<OwnedCosmetic[]>([]);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<ChainBusy>(null);
  const [notice, setNotice] = useState<ChainNotice>(null);
  /** True once the wallet's pieces were read; until then nothing is unequipped. */
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);
  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async () => {
    setBusy((current) => current ?? 'loading');
    try {
      const api = await chain();
      const [pieces, offers, xlm] = await Promise.all([
        wallet ? api.ownedCosmetics(wallet) : Promise.resolve([]),
        api.marketListings(),
        wallet ? api.xlmBalance(wallet) : Promise.resolve(null),
      ]);
      if (!alive.current) return;
      setOwned(pieces);
      setListings(offers);
      setBalance(xlm);
      writeOwnedClasses(wallet, pieces.map((piece) => piece.classId));
      setLoaded(true);
    } catch {
      if (alive.current) setNotice({ tone: 'bad', text: i18nRef.current.t('chainReadFailed') });
    } finally {
      if (alive.current) setBusy((current) => (current === 'loading' ? null : current));
    }
  }, [wallet]);

  useEffect(() => { void refresh(); }, [refresh]);

  const ownedClasses = useMemo(() => new Set(owned.map((piece) => piece.classId)), [owned]);
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
    setNotice({ tone: 'info', text: i18nRef.current.t(kind === 'linking' ? 'chainSignChallenge' : 'chainSign') });
    try {
      const done = await action();
      if (!alive.current) return;
      setNotice({ tone: 'good', ...done });
      await refresh();
    } catch (error) {
      if (alive.current) setNotice({ tone: 'bad', text: chainErrorText(error, i18nRef.current) });
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [refresh]);

  const nameOf = (item: CosmeticItem | undefined, fallback: string) => item?.name[locale] ?? fallback;

  const link = useCallback(() => run('linking', async () => {
    const api = await chain();
    const address = (await api.connectFreighterTestnet()).address;
    const challenge = await requestWalletChallenge(address);
    const signed = await api.signWalletChallenge(challenge, address);
    onAccountChange(await linkWalletAccount(signed));
    return { text: t('chainLinkedDone', { address: short(address) }) };
  }), [run, onAccountChange, t]);

  const unlink = useCallback(() => run('unlinking', async () => {
    onAccountChange(await unlinkWalletAccount());
    writeOwnedClasses(null, []);
    return { text: t('chainUnlinkedDone') };
  }), [run, onAccountChange, t]);

  const buy = useCallback((item: CosmeticItem) => run('buying', async () => {
    if (!item.chain) throw new Error('not an NFT piece');
    const receipt = await (await chain()).buyCosmetic(await signerAddress(), item.chain.classId);
    return { text: t('chainBoughtDone', { name: item.name[locale], token: receipt.tokenId }), transactionHash: receipt.transactionHash };
  }), [run, signerAddress, t, locale]);

  const list = useCallback((tokenId: number, priceStroops: bigint) => run('listing', async () => {
    const receipt = await (await chain()).listCosmetic(await signerAddress(), tokenId, priceStroops);
    return { text: t('chainListedDone', { listing: receipt.listingId }), transactionHash: receipt.transactionHash };
  }), [run, signerAddress, t]);

  const cancel = useCallback((listingId: number) => run('cancelling', async () => {
    const receipt = await (await chain()).cancelListing(await signerAddress(), listingId);
    return { text: t('chainCancelledDone', { listing: listingId }), transactionHash: receipt.transactionHash };
  }), [run, signerAddress, t]);

  const buyListing = useCallback((listing: MarketListing) => run('trading', async () => {
    const receipt = await (await chain()).buyListing(await signerAddress(), listing.listingId, listing.priceStroops);
    return { text: t('chainTradedDone', { name: nameOf(itemForClass(listing.classId), `#${listing.tokenId}`) }), transactionHash: receipt.transactionHash };
  }), [run, signerAddress, t, locale]);

  return {
    wallet, owned, ownedClasses, listings, listingByToken, balance, busy, notice, loaded,
    refresh, link, unlink, buy, list, cancel, buyListing, dismiss: () => setNotice(null),
  };
}
