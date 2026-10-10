import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { formatXlm, imageForCosmetic, type CosmeticItem } from '../hangar/catalog';
import { loadCosmeticLoadout, previewLoadout } from '../hangar/loadout';
import { CosmeticPreview } from '../hangar/CosmeticPreview';
import { ListenButton } from '../hangar/HangarChainPanels';
import { short } from '../chain/chain-errors';
import type { CosmeticsChain } from '../chain/useCosmeticsChain';
import { listingsForItem } from './market-sections';
import { marketText, type MarketCopyKey } from './market-copy';

const VISUAL = new Set(['hull', 'trail', 'insignia']);

/** What buying the piece does for the player's matches. */
function purchaseNote(item: CosmeticItem): MarketCopyKey {
  if (item.category === 'music') return 'musicPurchaseNote';
  if (item.category === 'voice') return 'voicePurchaseNote';
  return 'equipAfterPurchase';
}

/**
 * One piece on sale: its illustration, a try-on on the chosen ship (or "Listen" for audio), the
 * price, who sells it and "Buy". Other commanders' listings of the same piece follow.
 */
export function MarketDetail({ item, chain, onClose }: { item: CosmeticItem; chain: CosmeticsChain; onClose(): void }) {
  const { t, locale } = useI18n();
  const equipped = useMemo(() => loadCosmeticLoadout(chain.ownedClasses), [chain.ownedClasses]);
  if (!item.chain) return null;
  const price = item.chain.priceStroops;
  const owned = chain.ownedClasses.has(item.chain.classId);
  const locked = chain.busy !== null && chain.busy !== 'loading';
  const image = imageForCosmetic(item);
  const offers = listingsForItem(chain.listings, item, chain.wallet);

  return (
    <article className="vi-market-detail" aria-label={item.name[locale]}>
      <button type="button" className="vi-market-detail__back" onClick={onClose}>{marketText(locale, 'closeDetail')}</button>
      <div className="vi-market-detail__grid">
        <figure className="vi-market-detail__art">
          {image ? <img src={image} alt={item.name[locale]} width={512} height={512} /> : <i style={{ background: item.tone }} />}
        </figure>
        <div className="vi-market-detail__info">
          <span className="vi-nft-tag">{t('chainNft')}</span>
          <h2>{item.name[locale]}</h2>
          <p>{item.description[locale]}</p>
          <ListenButton item={item} />
          <dl className="vi-market-detail__facts">
            <div><dt>{marketText(locale, 'price')}</dt><dd>{formatXlm(price)}</dd></div>
            <div><dt>{marketText(locale, 'seller')}</dt><dd>{marketText(locale, 'officialSeller')}</dd></div>
          </dl>
          <p className="vi-market-detail__note">{marketText(locale, purchaseNote(item))}</p>
          <button type="button" className="is-primary" disabled={!chain.wallet || locked} onClick={() => chain.buy(item)}>
            {t('chainBuy', { price: formatXlm(price) })}
          </button>
          {!chain.wallet && <small>{t('chainNeedWallet')}</small>}
          {owned && <small>{marketText(locale, 'ownedHint')}</small>}
        </div>
      </div>
      {VISUAL.has(item.category) && (
        <CosmeticPreview loadout={previewLoadout(equipped, item)} trying={owned ? null : item} />
      )}
      {offers.length > 0 && (
        <section className="vi-market-detail__offers" aria-label={marketText(locale, 'listingsOfPiece', { count: offers.length })}>
          <h3>{marketText(locale, 'listingsOfPiece', { count: offers.length })}</h3>
          {offers.map((offer) => (
            <div key={offer.listingId} className="vi-market-detail__offer">
              <span>{t('marketSeller', { seller: short(offer.seller) })}</span>
              <b>{formatXlm(offer.priceStroops)}</b>
              <button type="button" className="is-primary" disabled={!chain.wallet || locked} onClick={() => chain.buyListing(offer)}>
                {t('marketBuy')}
              </button>
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
