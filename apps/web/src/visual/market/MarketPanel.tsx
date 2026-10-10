import { useEffect, useId, useState } from 'react';
import { useI18n } from '../i18n';
import { useSpaceSound } from '../../login/sound';
import type { AccountUser } from '../../auth/client';
import { formatBalance, formatXlm, imageForCosmetic, itemById } from '../hangar/catalog';
import { MarketView, parseXlm, Swatch } from '../hangar/HangarChainPanels';
import { short } from '../chain/chain-errors';
import { useCosmeticsChain, type ChainBusy, type ChainNotice, type CosmeticsChain } from '../chain/useCosmeticsChain';
import { MarketDetail } from './MarketDetail';
import { sellablePieces, sellerReceives, shopItems, type SellablePiece } from './market-sections';
import { marketText } from './market-copy';
import './market.css';

const EXPLORER = 'https://stellar.expert/explorer/testnet';

type MarketTab = 'shop' | 'listings' | 'mine';
const TABS: readonly MarketTab[] = ['shop', 'listings', 'mine'];
const TAB_COPY = { shop: 'tabShop', listings: 'tabListings', mine: 'tabMine' } as const;

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
        {balance !== null && <span>{t('chainBalance', { amount: formatBalance(balance) })}</span>}</p>}
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

/** New pieces from the shop: illustration, price and "Buy"; the name opens the detail. */
function ShopSection({ chain, onOpen }: { chain: CosmeticsChain; onOpen(itemId: string): void }) {
  const { t, locale } = useI18n();
  const locked = chain.busy !== null && chain.busy !== 'loading';
  return <section className="vi-shop" aria-label={marketText(locale, 'tabShop')}>
    <p className="vi-market__note">{marketText(locale, 'shopNote')}</p>
    <div className="vi-shop__grid">
      {shopItems().map((item) => {
        const owned = item.chain !== undefined && chain.ownedClasses.has(item.chain.classId);
        const image = imageForCosmetic(item);
        return <article key={item.id} className={owned ? 'is-owned' : ''}>
          <button type="button" className="vi-shop__open" onClick={() => onOpen(item.id)}
            aria-label={marketText(locale, 'openDetail', { name: item.name[locale] })}>
            {image ? <img src={image} alt="" /> : <i style={{ background: item.tone }} />}
          </button>
          <div className="vi-shop__copy">
            <strong>{item.name[locale]}</strong>
            <small>{item.description[locale]}</small>
          </div>
          <div className="vi-shop__buy">
            <b>{formatXlm(item.chain!.priceStroops)}</b>
            {owned && <span className="vi-wallet-badge">{t('chainOwned')}</span>}
            <button type="button" className="is-primary" disabled={!chain.wallet || locked} onClick={() => chain.buy(item)}>
              {t('marketBuy')}
            </button>
          </div>
        </article>;
      })}
    </div>
    {!chain.wallet && <small>{t('chainNeedWallet')}</small>}
  </section>;
}

/** One piece of the wallet: list it for a price, or cancel its listing. */
function SellRow({ piece, busy, onList, onCancel }: {
  piece: SellablePiece; busy: ChainBusy; onList(tokenId: number, price: bigint): void; onCancel(listingId: number): void;
}) {
  const { t, locale } = useI18n();
  const [price, setPrice] = useState('');
  const parsed = parseXlm(price);
  const locked = busy !== null && busy !== 'loading';
  const inputId = `sell-${piece.tokenId}`;
  return <article className="vi-mine__row">
    <Swatch item={piece.item} />
    <div>
      <strong>{piece.item.name[locale]}</strong>
      <small>{marketText(locale, 'pieceToken', { token: piece.tokenId })}</small>
    </div>
    {piece.listing
      ? <div className="vi-mine__action">
        <span>{t('chainListedFor', { price: formatXlm(piece.listing.priceStroops) })}</span>
        <button type="button" disabled={locked} onClick={() => onCancel(piece.listing!.listingId)}>{t('chainCancel')}</button>
      </div>
      : <form className="vi-mine__action" onSubmit={(event) => {
        event.preventDefault();
        if (parsed) onList(piece.tokenId, parsed);
      }}>
        <label htmlFor={inputId}>{t('chainSellPrice')}</label>
        <input id={inputId} inputMode="decimal" placeholder="2.5" value={price} onChange={(event) => setPrice(event.target.value)} />
        <button type="submit" disabled={!parsed || locked}>{t('chainSell')}</button>
        {parsed && <small>{t('chainSellHelp', { net: formatXlm(sellerReceives(parsed)) })}</small>}
      </form>}
  </article>;
}

function MineSection({ chain }: { chain: CosmeticsChain }) {
  const { locale } = useI18n();
  const pieces = sellablePieces(chain.owned, chain.listings, chain.wallet);
  return <section className="vi-mine" aria-label={marketText(locale, 'tabMine')}>
    {!chain.wallet && <p className="vi-market__empty">{marketText(locale, 'mineNeedWallet')}</p>}
    {chain.wallet && pieces.length === 0 && <p className="vi-market__empty">{marketText(locale, 'mineEmpty')}</p>}
    {pieces.map((piece) => <SellRow key={piece.tokenId} piece={piece} busy={chain.busy} onList={chain.list} onCancel={chain.cancel} />)}
  </section>;
}

/**
 * Every NFT transaction of the game, unfolded from the command center: the shop, other
 * commanders' listings and the player's own pieces, with the wallet strip on top.
 */
export function MarketPanel({
  onBack,
  isEmbedded = false,
  account = null,
  onAccountChange = () => {},
  focusItemId = null,
}: {
  onBack(): void;
  isEmbedded?: boolean;
  account?: AccountUser | null;
  onAccountChange?(user: AccountUser): void;
  /** A piece to open right away, e.g. from "View in the Market" in the Hangar. */
  focusItemId?: string | null;
}) {
  const { t, locale } = useI18n();
  const sound = useSpaceSound();
  const chain = useCosmeticsChain(account, onAccountChange, locale);
  const [tab, setTab] = useState<MarketTab>('shop');
  const [detail, setDetail] = useState<string | null>(focusItemId);
  const ids = useId();

  useEffect(() => {
    if (!focusItemId) return;
    setTab('shop');
    setDetail(focusItemId);
  }, [focusItemId]);

  const detailItem = itemById(detail);

  return (
    <section className={`vi-hangar__content vi-market-panel ${isEmbedded ? 'vi-hangar__content--embedded' : ''}`} aria-labelledby={`${ids}-title`}>
      <div className="vi-hangar__heading">
        <div>
          <p className="vi-eyebrow">{marketText(locale, 'eyebrow')}</p>
          <h1 id={`${ids}-title`}>{marketText(locale, 'title')}</h1>
        </div>
        <div className="vi-hangar__heading-meta">
          <p>{marketText(locale, 'body')}</p>
          <div className="vi-hangar__heading-tags">
            <span>
              <i />
              {t('cosmeticOnly')}
            </span>
            {isEmbedded && (
              <button
                className="vi-embedded-close"
                onClick={() => {
                  sound.playSelect();
                  onBack();
                }}
                aria-label={t('backToCommand')}
                title={t('backToCommand')}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="vi-market-board">
        <WalletStrip signedIn={account !== null} wallet={chain.wallet} balance={chain.balance} busy={chain.busy}
          onLink={chain.link} onUnlink={chain.unlink} onRefresh={() => void chain.refresh()} />
        <ChainNoticeBar notice={chain.notice} onDismiss={chain.dismiss} />
        <div className="vi-market-tabs" role="tablist" aria-label={marketText(locale, 'sections')}>
          {TABS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              id={`${ids}-${option}`}
              aria-controls={`${ids}-panel`}
              aria-selected={tab === option}
              className={tab === option ? 'is-active' : ''}
              onClick={() => {
                sound.playSelect();
                setTab(option);
                setDetail(null);
              }}
            >
              {marketText(locale, TAB_COPY[option])}
            </button>
          ))}
        </div>
        <div className="vi-market-body" role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-${tab}`}>
          {tab === 'shop' && (detailItem?.chain
            ? <MarketDetail key={detailItem.id} item={detailItem} chain={chain} onClose={() => setDetail(null)} />
            : <ShopSection chain={chain} onOpen={setDetail} />)}
          {tab === 'listings' && <MarketView listings={chain.listings} wallet={chain.wallet} busy={chain.busy} onBuy={chain.buyListing} onCancel={chain.cancel} />}
          {tab === 'mine' && <MineSection chain={chain} />}
        </div>
      </div>
    </section>
  );
}
