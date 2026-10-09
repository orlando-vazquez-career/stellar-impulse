import { useState } from 'react';
import type { MarketListing } from '@impulso/chain';
import { useI18n } from '../i18n';
import { formatXlm, itemForClass, type CosmeticItem } from './catalog';
import { short, type ChainBusy, type ChainNotice } from './useHangarChain';

const EXPLORER = 'https://stellar.expert/explorer/testnet';
const FEE_BPS = 500n;
const net = (price: bigint) => price - (price * FEE_BPS) / 10_000n;

/** "2.5" → 25_000_000 stroops; null for anything that is not a positive amount with ≤ 7 decimals. */
export function parseXlm(value: string): bigint | null {
  const match = /^\s*(\d{1,9})(?:[.,](\d{1,7}))?\s*$/.exec(value);
  if (!match) return null;
  const stroops = BigInt(match[1]!) * 10_000_000n + BigInt((match[2] ?? '').padEnd(7, '0'));
  return stroops > 0n ? stroops : null;
}

export function ChainNoticeBar({ notice, onDismiss }: { notice: ChainNotice; onDismiss(): void }) {
  const { t } = useI18n();
  if (!notice) return null;
  return <div className={`vi-chain-notice is-${notice.tone}`} role={notice.tone === 'bad' ? 'alert' : 'status'}>
    <p>{notice.text}</p>
    {notice.transactionHash && <a href={`${EXPLORER}/tx/${notice.transactionHash}`} target="_blank" rel="noreferrer">{t('chainViewTx')} ↗</a>}
    {notice.tone !== 'info' && <button type="button" onClick={onDismiss} aria-label={t('chainDismiss')}>×</button>}
  </div>;
}

export function WalletStrip({ signedIn, wallet, balance, busy, onLink, onUnlink, onRefresh }: {
  signedIn: boolean; wallet: string | null; balance: bigint | null; busy: ChainBusy;
  onLink(): void; onUnlink(): void; onRefresh(): void;
}) {
  const { t } = useI18n();
  return <section className="vi-wallet-strip" aria-label={t('chainWalletTitle')}>
    <div>
      <small>{t('chainWalletTitle')}</small>
      {!signedIn && <p>{t('chainSignInFirst')}</p>}
      {signedIn && !wallet && <p>{t('chainConnectHelp')}</p>}
      {wallet && <p><b title={wallet}>{short(wallet)}</b><span className="vi-wallet-badge">{t('chainLinked')}</span>
        {balance !== null && <span>{t('chainBalance', { amount: formatXlm(balance) })}</span>}</p>}
    </div>
    <div className="vi-wallet-strip__actions">
      {busy === 'loading' && <span className="vi-wallet-busy">{t('chainLoading')}</span>}
      {signedIn && !wallet && <button type="button" className="is-primary" disabled={busy !== null && busy !== 'loading'} onClick={onLink}>{t('chainConnect')}</button>}
      {wallet && <>
        <button type="button" disabled={busy !== null} onClick={onRefresh}>{t('chainRefresh')}</button>
        <button type="button" disabled={busy !== null} onClick={onUnlink}>{t('chainUnlink')}</button>
      </>}
    </div>
  </section>;
}

/** What the player can do with the selected NFT piece: buy, list, cancel or learn how to earn it. */
export function ItemDetail({ item, wallet, tokens, listingByToken, busy, onBuy, onList, onCancel }: {
  item: CosmeticItem; wallet: string | null; tokens: number[]; listingByToken: ReadonlyMap<number, MarketListing>; busy: ChainBusy;
  onBuy(item: CosmeticItem): void; onList(tokenId: number, price: bigint): void; onCancel(listingId: number): void;
}) {
  const { t, locale } = useI18n();
  const [price, setPrice] = useState('');
  if (!item.chain) return null;
  const parsed = parseXlm(price);
  const locked = busy !== null && busy !== 'loading';
  const listed = tokens.map((token) => listingByToken.get(token)).find((listing) => listing && listing.seller === wallet);
  const unlisted = tokens.find((token) => !listingByToken.has(token));
  return <section className="vi-item-detail" aria-label={item.name[locale]}>
    <header>
      <i style={{ background: item.tone }} />
      <div><strong>{item.name[locale]}</strong><small>{item.description[locale]}</small></div>
      <span className="vi-nft-tag">{t('chainNft')}</span>
    </header>
    {item.chain.family === 'merit'
      ? <p>{t('chainMeritHow')}</p>
      : <div className="vi-item-detail__actions">
        {tokens.length > 0 && <p>{t('chainCopies', { count: tokens.length })}</p>}
        <button type="button" className="is-primary" disabled={!wallet || locked} onClick={() => onBuy(item)}>
          {t('chainBuy', { price: formatXlm(item.chain.priceStroops) })}
        </button>
        {!wallet && <small>{t('chainNeedWallet')}</small>}
        {listed && <div className="vi-item-detail__row">
          <span>{t('chainListedFor', { price: formatXlm(listed.priceStroops) })}</span>
          <button type="button" disabled={locked} onClick={() => onCancel(listed.listingId)}>{t('chainCancel')}</button>
        </div>}
        {!listed && unlisted !== undefined && <form className="vi-item-detail__row" onSubmit={(event) => {
          event.preventDefault();
          if (parsed) onList(unlisted, parsed);
        }}>
          <label htmlFor={`sell-${item.id}`}>{t('chainSellPrice')}</label>
          <input id={`sell-${item.id}`} inputMode="decimal" placeholder="2.5" value={price} onChange={(event) => setPrice(event.target.value)} />
          <button type="submit" disabled={!parsed || locked}>{t('chainSell')}</button>
          {parsed && <small>{t('chainSellHelp', { net: formatXlm(net(parsed)) })}</small>}
        </form>}
      </div>}
  </section>;
}

export function MarketView({ listings, wallet, busy, onBuy, onCancel }: {
  listings: MarketListing[]; wallet: string | null; busy: ChainBusy;
  onBuy(listing: MarketListing): void; onCancel(listingId: number): void;
}) {
  const { t, locale } = useI18n();
  const locked = busy !== null && busy !== 'loading';
  return <section className="vi-market" aria-label={t('viewMarket')}>
    <p className="vi-market__note">{t('marketFeeNote')}</p>
    {listings.length === 0 && <p className="vi-market__empty">{t('marketEmpty')}</p>}
    <div className="vi-market__grid">
      {listings.map((listing) => {
        const item = itemForClass(listing.classId);
        const mine = listing.seller === wallet;
        return <article key={listing.listingId} className={mine ? 'is-mine' : ''}>
          <i style={{ background: item?.tone ?? '#5b6b80' }} />
          <div>
            <strong>{item?.name[locale] ?? `#${listing.tokenId}`}</strong>
            <small>{mine ? t('marketYours') : t('marketSeller', { seller: short(listing.seller) })}</small>
          </div>
          <b>{formatXlm(listing.priceStroops)}</b>
          {mine
            ? <button type="button" disabled={locked} onClick={() => onCancel(listing.listingId)}>{t('chainCancel')}</button>
            : <button type="button" className="is-primary" disabled={!wallet || locked} onClick={() => onBuy(listing)}>
              {t('chainBuy', { price: formatXlm(listing.priceStroops) })}
            </button>}
        </article>;
      })}
    </div>
    {!wallet && listings.length > 0 && <small>{t('chainNeedWallet')}</small>}
  </section>;
}
