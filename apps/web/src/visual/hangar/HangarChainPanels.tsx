import type { MarketListing } from '@impulso/chain';
import { useI18n } from '../i18n';
import { formatXlm, imageForCosmetic, itemForClass, type CosmeticItem } from './catalog';
import { short } from '../chain/chain-errors';
import type { ChainBusy } from '../chain/useCosmeticsChain';
import { marketText } from '../market/market-copy';
import { canPreviewAudio, usePreviewAudio } from './preview-audio';

/** "2.5" → 25_000_000 stroops; null for anything that is not a positive amount with ≤ 7 decimals. */
export function parseXlm(value: string): bigint | null {
  const match = /^\s*(\d{1,9})(?:[.,](\d{1,7}))?\s*$/.exec(value);
  if (!match) return null;
  const stroops = BigInt(match[1]!) * 10_000_000n + BigInt((match[2] ?? '').padEnd(7, '0'));
  return stroops > 0n ? stroops : null;
}

/** The piece's illustration, or its colour when it has none. */
export function Swatch({ item }: { item: CosmeticItem }) {
  const image = imageForCosmetic(item);
  return image ? <img className="vi-swatch-image" src={image} alt="" /> : <i style={{ background: item.tone }} />;
}

/** "▶ Listen" / "■ Stop" for a voice or a track; nothing for visual pieces. */
export function ListenButton({ item }: { item: CosmeticItem }) {
  const { locale } = useI18n();
  const preview = usePreviewAudio(locale);
  if (!canPreviewAudio(item)) return null;
  const playing = preview.playing === item.id;
  return (
    <button type="button" className="vi-listen" aria-pressed={playing} onClick={() => void preview.toggle(item)}>
      {marketText(locale, playing ? 'stop' : 'listen')}
    </button>
  );
}

/**
 * An NFT piece the player does not hold yet, in the Hangar: its price, a try-on (the preview, or
 * "Listen") and the way to the Market, where every purchase happens. Merits explain how they are earned.
 */
export function HangarPieceOffer({ item, onOpenMarket }: { item: CosmeticItem; onOpenMarket?(itemId: string): void }) {
  const { t, locale } = useI18n();
  if (!item.chain) return null;
  return <section className="vi-item-detail" aria-label={item.name[locale]}>
    <header>
      <Swatch item={item} />
      <div><strong>{item.name[locale]}</strong><small>{item.description[locale]}</small></div>
      <span className="vi-nft-tag">{t('chainNft')}</span>
    </header>
    {item.chain.family === 'merit'
      ? <p>{t('chainMeritHow')}</p>
      : <div className="vi-item-detail__actions vi-item-detail__actions--row">
        <span className="vi-item-detail__price">{marketText(locale, 'price')} <b>{formatXlm(item.chain.priceStroops)}</b></span>
        <ListenButton item={item} />
        {onOpenMarket && <button type="button" className="is-primary" onClick={() => onOpenMarket(item.id)}>
          {marketText(locale, 'viewInMarket')}
        </button>}
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
          {item ? <Swatch item={item} /> : <i style={{ background: '#5b6b80' }} />}
          <div>
            <strong>{item?.name[locale] ?? `#${listing.tokenId}`}</strong>
            <small>{mine ? t('marketYours') : t('marketSeller', { seller: short(listing.seller) })}</small>
          </div>
          <b>{formatXlm(listing.priceStroops)}</b>
          {mine
            ? <button type="button" disabled={locked} onClick={() => onCancel(listing.listingId)}>{t('chainCancel')}</button>
            : <button type="button" className="is-primary" disabled={!wallet || locked} onClick={() => onBuy(listing)}>
              {t('marketBuy')}
            </button>}
        </article>;
      })}
    </div>
    {!wallet && listings.length > 0 && <small>{t('chainNeedWallet')}</small>}
  </section>;
}
