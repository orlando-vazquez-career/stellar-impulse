import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useSpaceSound } from '../../login/sound';
import type { AccountUser } from '../../auth/client';
import { canEquip, cosmeticCatalog, formatXlm, hangarCategories, imageForCosmetic, itemById, itemsForCategory, type HangarCategory } from './catalog';
import { defaultCosmeticLoadout, loadCosmeticLoadout, previewLoadout, saveCosmeticLoadout, type CosmeticLoadout } from './loadout';
import { HangarPieceOffer } from './HangarChainPanels';
import { CosmeticPreview } from './CosmeticPreview';
import { useCosmeticsChain } from '../chain/useCosmeticsChain';
import './hangar.css';

/**
 * The dressing room: equip what the player holds, try on what they do not. Every purchase and
 * sale happens in the Market; an NFT piece the player lacks only links there.
 */
export function HangarPanel({
  onBack,
  isEmbedded = false,
  account = null,
  onAccountChange = () => {},
  onOpenMarket,
}: {
  onBack(): void;
  isEmbedded?: boolean;
  account?: AccountUser | null;
  onAccountChange?(user: AccountUser): void;
  /** Opens the Market focused on one piece. */
  onOpenMarket?(itemId: string): void;
}) {
  const { locale, t } = useI18n();
  const chain = useCosmeticsChain(account, onAccountChange, locale, { market: false });
  const sound = useSpaceSound();

  const [category, setCategory] = useState<HangarCategory>('hull');
  const [loadout, setLoadout] = useState<CosmeticLoadout>(loadCosmeticLoadout);
  /** A piece shown on the ship without being equipped: never saved. */
  const [trying, setTrying] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // A piece the wallet no longer holds (sold, or another wallet linked) falls back to the default.
  useEffect(() => {
    if (!chain.loaded) return;
    setLoadout((current) => {
      let changed = false;
      const next = { ...current };
      for (const slot of hangarCategories) {
        const item = cosmeticCatalog.find((candidate) => candidate.id === current[slot]);
        if (item && !canEquip(item, chain.ownedClasses)) { next[slot] = defaultCosmeticLoadout[slot]; changed = true; }
      }
      return changed ? next : current;
    });
  }, [chain.loaded, chain.ownedClasses]);

  const tryingItem = itemById(trying);
  const shown = useMemo(() => previewLoadout(loadout, tryingItem), [loadout, tryingItem]);

  const categoryLabels: Record<HangarCategory, string> = {
    hull: t('hullFinish'),
    trail: t('engineTrail'),
    insignia: t('insignia'),
    voice: t('announcerPack'),
    music: t('musicTrack'),
  };

  /** Equips what the player may use; an NFT piece they do not hold is tried on instead. */
  const choose = (itemId: string) => {
    const item = itemById(itemId);
    if (!item?.unlocked) return;
    sound.playSelect();
    if (canEquip(item, chain.ownedClasses)) {
      setLoadout({ ...loadout, [item.category]: item.id });
      setTrying(null);
      setSaved(false);
    } else {
      setTrying(item.id);
    }
  };

  // Saving keeps only equipped pieces: whatever is being tried on stays out of the match.
  const save = () => {
    sound.playEnter();
    saveCosmeticLoadout(loadout);
    setSaved(true);
  };

  function hover(pitch = 560) {
    sound.playHover({ pitch });
  }

  const offer = tryingItem?.category === category ? tryingItem : undefined;

  return (
    <section className={`vi-hangar__content ${isEmbedded ? 'vi-hangar__content--embedded' : ''}`}>
      <div className="vi-hangar__heading">
        <div>
          <p className="vi-eyebrow">{t('hangarEyebrow')}</p>
          <h1>{t('hangarTitle')}</h1>
        </div>
        <div className="vi-hangar__heading-meta">
          <p>{t('hangarBody')}</p>
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

      <div className="vi-hangar__workspace">
        <CosmeticPreview loadout={shown} trying={tryingItem ?? null} summary={loadout} />

        <section className="vi-collection" aria-labelledby="collection-title">
          <header>
            <div>
              <span>02</span>
              <h2 id="collection-title">{t('collection')}</h2>
            </div>
          </header>
          <nav aria-label={t('collection')}>
            {hangarCategories.map((item) => (
              <button
                key={item}
                className={category === item ? 'is-active' : ''}
                onClick={() => {
                  sound.playSelect();
                  setCategory(item);
                }}
                onMouseEnter={() => hover(520)}
                aria-pressed={category === item}
              >
                {categoryLabels[item]}
              </button>
            ))}
          </nav>
          <div className="vi-cosmetic-grid">
            {itemsForCategory(category).map((item) => {
              const equipped = loadout[category] === item.id;
              const usable = canEquip(item, chain.ownedClasses);
              const status = !item.unlocked ? t('comingSoon') : equipped ? t('equipped')
                : !item.chain ? t('available') : usable ? t('chainOwned')
                : item.chain.family === 'merit' ? t('chainMerit') : formatXlm(item.chain.priceStroops);
              const image = imageForCosmetic(item);
              return (
                <button
                  key={item.id}
                  className={`${equipped ? 'is-equipped' : ''} ${!item.unlocked ? 'is-locked' : ''} ${item.chain ? 'is-nft' : ''} ${item.chain && !usable ? 'is-unowned' : ''} ${trying === item.id ? 'is-selected' : ''}`}
                  disabled={!item.unlocked}
                  onClick={() => choose(item.id)}
                  onMouseEnter={() => {
                    if (item.unlocked) hover(460);
                  }}
                >
                  {image ? <img className="vi-cosmetic-image" src={image} alt="" /> : <i style={{ background: item.tone }} />}
                  <span>
                    <strong>{item.name[locale]}</strong>
                    <small>{item.description[locale]}</small>
                  </span>
                  <em>
                    {item.chain && <b className="vi-nft-tag">{t('chainNft')}</b>}
                    {status}
                  </em>
                </button>
              );
            })}
          </div>
          {offer && <HangarPieceOffer key={offer.id} item={offer} onOpenMarket={onOpenMarket} />}
          <div className="vi-collection__footer">
            <p>{t('cosmeticDisclaimer')}</p>
            <div>
              {saved && <output>{t('loadoutSaved')}</output>}
              <button
                onClick={save}
                onMouseEnter={() => hover(640)}
              >
                {t('saveLoadout')}
                <span>→</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
