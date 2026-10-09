import { useMemo, useState, useRef, useEffect, type CSSProperties } from 'react';
import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';
import { useSpaceSound } from '../../login/sound';
import { createCommandSpaceScene } from '../menu/command-space';
import type { AccountUser } from '../../auth/client';
import { canEquip, cosmeticCatalog, formatXlm, hangarCategories, itemsForCategory, type HangarCategory } from './catalog';
import { defaultCosmeticLoadout, loadCosmeticLoadout, saveCosmeticLoadout, type CosmeticLoadout } from './loadout';
import { ChainNoticeBar, ItemDetail, MarketView, WalletStrip } from './HangarChainPanels';
import { useHangarChain } from './useHangarChain';
import './hangar.css';

/** `account`: the signed-in account (null for guests), whose linked wallet holds the NFT pieces. */
export function HangarScreen({ onBack, account = null, onAccountChange = () => {} }: {
  onBack(): void; account?: AccountUser | null; onAccountChange?(user: AccountUser): void;
}) {
  const i18n = useI18n();
  const { locale, t } = i18n;
  const chain = useHangarChain(account, onAccountChange, i18n);
  const [view, setView] = useState<'collection' | 'market'>('collection');
  const [selected, setSelected] = useState<string | null>(null);
  const sound = useSpaceSound();
  const canvas = useRef<HTMLCanvasElement>(null);

  const [category, setCategory] = useState<HangarCategory>('hull');
  const [loadout, setLoadout] = useState<CosmeticLoadout>(loadCosmeticLoadout);
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

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const scene = createCommandSpaceScene(el);
    scene.start();

    const onResize = () => scene.resize();
    const onPointer = (event: PointerEvent) => {
      scene.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointer);
    return () => {
      scene.stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, []);

  const equippedItems = useMemo(
    () => ({
      hull: cosmeticCatalog.find((item) => item.id === loadout.hull)!,
      trail: cosmeticCatalog.find((item) => item.id === loadout.trail)!,
      insignia: cosmeticCatalog.find((item) => item.id === loadout.insignia)!,
      voice: cosmeticCatalog.find((item) => item.id === loadout.voice)!,
      music: cosmeticCatalog.find((item) => item.id === loadout.music)!,
    }),
    [loadout],
  );

  const categoryLabels: Record<HangarCategory, string> = {
    hull: t('hullFinish'),
    trail: t('engineTrail'),
    insignia: t('insignia'),
    voice: t('announcerPack'),
    music: t('musicTrack'),
  };

  const previewStyle = {
    '--hangar-hull': equippedItems.hull.tone,
    '--hangar-trail': equippedItems.trail.tone,
    '--hangar-insignia': equippedItems.insignia.tone,
  } as CSSProperties;

  const equip = (itemId: string) => {
    sound.playSelect();
    setLoadout({ ...loadout, [category]: itemId });
    setSaved(false);
  };

  /** Equips what the player may use; an NFT piece they do not hold only opens its detail. */
  const choose = (itemId: string) => {
    const item = cosmeticCatalog.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setSelected(item.chain ? item.id : null);
    if (canEquip(item, chain.ownedClasses)) equip(item.id);
    else sound.playSelect();
  };
  const selectedItem = cosmeticCatalog.find((item) => item.id === selected && item.category === category);
  const tokensOf = (classId: number) => chain.owned.filter((piece) => piece.classId === classId).map((piece) => piece.tokenId);

  const save = () => {
    sound.playEnter();
    saveCosmeticLoadout(loadout);
    setSaved(true);
  };

  function hover(pitch = 560) {
    sound.playHover({ pitch });
  }

  return (
    <main className="vi-hangar vi-screen">
      <canvas ref={canvas} className="vi-hangar-canvas" aria-hidden="true" />
      <header className="vi-screen__header">
        <Brand />
        <div className="vi-header-actions">
          <LanguageToggle />
          <button
            className="vi-text-button"
            onClick={() => {
              sound.playSelect();
              onBack();
            }}
          >
            ← {t('backToCommand')}
          </button>
        </div>
      </header>

      <section className="vi-hangar__content">
        <div className="vi-hangar__heading">
          <div>
            <p className="vi-eyebrow">{t('hangarEyebrow')}</p>
            <h1>{t('hangarTitle')}</h1>
          </div>
          <div>
            <p>{t('hangarBody')}</p>
            <span>
              <i />
              {t('cosmeticOnly')}
            </span>
          </div>
        </div>

        <div className="vi-hangar__workspace">
          <section className="vi-ship-preview" aria-labelledby="ship-preview-title" style={previewStyle}>
            <header>
              <div>
                <span>{t('shipPreview')}</span>
                <h2 id="ship-preview-title">{t('interceptorFrame')}</h2>
              </div>
              <b>AX-7</b>
            </header>
            <div className="vi-ship-stage" aria-hidden="true">
              <div className="vi-ship-trail vi-ship-trail--left" />
              <div className="vi-ship-trail vi-ship-trail--right" />
              <div className="vi-ship-model">
                <i className="vi-ship-model__wing vi-ship-model__wing--left" />
                <i className="vi-ship-model__body" />
                <i className="vi-ship-model__wing vi-ship-model__wing--right" />
                <span>△</span>
              </div>
              <div className="vi-ship-orbit" />
            </div>
            <div className="vi-loadout-summary">
              <strong>{t('currentLoadout')}</strong>
              <div>
                {hangarCategories.map((slot) => (
                  <span key={slot}>
                    <small>{categoryLabels[slot]}</small>
                    <b>{equippedItems[slot].name[locale]}</b>
                  </span>
                ))}
              </div>
              <p>{t('previewHint')}</p>
            </div>
          </section>

          <section className="vi-collection" aria-labelledby="collection-title">
            <header>
              <div>
                <span>02</span>
                <h2 id="collection-title">{view === 'market' ? t('viewMarket') : t('collection')}</h2>
              </div>
              <div className="vi-view-toggle" role="tablist" aria-label={t('collection')}>
                {(['collection', 'market'] as const).map((option) => <button key={option} type="button" role="tab"
                  aria-selected={view === option} className={view === option ? 'is-active' : ''}
                  onClick={() => { sound.playSelect(); setView(option); }}>
                  {option === 'market' ? t('viewMarket') : t('collection')}
                </button>)}
              </div>
            </header>
            <WalletStrip signedIn={account !== null} wallet={chain.wallet} balance={chain.balance} busy={chain.busy}
              onLink={chain.link} onUnlink={chain.unlink} onRefresh={() => void chain.refresh()} />
            <ChainNoticeBar notice={chain.notice} onDismiss={chain.dismiss} />
            {view === 'market'
              ? <MarketView listings={chain.listings} wallet={chain.wallet} busy={chain.busy} onBuy={chain.buyListing} onCancel={chain.cancel} />
              : <>
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
                return (
                  <button
                    key={item.id}
                    className={`${equipped ? 'is-equipped' : ''} ${!item.unlocked ? 'is-locked' : ''} ${item.chain ? 'is-nft' : ''} ${item.chain && !usable ? 'is-unowned' : ''} ${selected === item.id ? 'is-selected' : ''}`}
                    disabled={!item.unlocked}
                    onClick={() => choose(item.id)}
                    onMouseEnter={() => {
                      if (item.unlocked) hover(460);
                    }}
                  >
                    <i style={{ background: item.tone }} />
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
            {/* An owned merit emblem has nothing left to do; everything else gets its actions. */}
            {selectedItem?.chain && !(selectedItem.chain.family === 'merit' && chain.ownedClasses.has(selectedItem.chain.classId)) && <ItemDetail key={selectedItem.id} item={selectedItem} wallet={chain.wallet}
              tokens={tokensOf(selectedItem.chain.classId)} listingByToken={chain.listingByToken} busy={chain.busy}
              onBuy={chain.buy} onList={chain.list} onCancel={chain.cancel} />}
              </>}
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

      <footer className="vi-screen__footer">
        <span>IMPULSO // {t('hangar').toUpperCase()}</span>
        <span>{t('cosmeticOnly').toUpperCase()}</span>
      </footer>
    </main>
  );
}
