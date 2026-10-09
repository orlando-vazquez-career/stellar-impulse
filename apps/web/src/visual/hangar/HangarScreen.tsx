import { useMemo, useState, useRef, useEffect, type CSSProperties } from 'react';
import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';
import { useSpaceSound } from '../../login/sound';
import { createCommandSpaceScene } from '../menu/command-space';
import type { SquadType } from '../game/model';
import { GAME_ASSET_MANIFEST, GAME_SHIP_TYPES } from '../game/phaser/game-assets';
import { cosmeticCatalog, hangarCategories, imageForCosmetic, itemsForCategory, type HangarCategory } from './catalog';
import { loadCosmeticLoadout, saveCosmeticLoadout, type CosmeticLoadout } from './loadout';
import './hangar.css';

const HANGAR_SHIPS = GAME_SHIP_TYPES.map((shipType, index) => {
  const asset = GAME_ASSET_MANIFEST.find((candidate) => candidate.kind === 'ship'
    && candidate.faction === 'blue' && candidate.shipType === shipType);
  if (!asset) throw new Error(`Missing Hangar preview for ${shipType}`);
  return { shipType, src: asset.src, number: String(index + 1).padStart(2, '0') };
});

const HULL_PREVIEW_FILTERS: Record<string, string> = {
  aegis: 'saturate(1.18)',
  polar: 'grayscale(.78) brightness(1.35) saturate(.4)',
  obsidian: 'grayscale(.65) brightness(.68) sepia(.3) hue-rotate(205deg) saturate(1.6)',
};

export function HangarScreen({ onBack }: { onBack(): void }) {
  const { locale, t } = useI18n();
  const sound = useSpaceSound();
  const canvas = useRef<HTMLCanvasElement>(null);

  const [category, setCategory] = useState<HangarCategory>('hull');
  const [selectedShip, setSelectedShip] = useState<SquadType>('interceptor');
  const [loadout, setLoadout] = useState<CosmeticLoadout>(loadCosmeticLoadout);
  const [saved, setSaved] = useState(false);

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
  const shipLabels: Record<SquadType, string> = {
    interceptor: t('unitInterceptor'),
    explorer: t('unitExplorer'),
    frigate: t('unitFrigate'),
    bomber: t('unitBomber'),
  };
  const selectedShipAsset = HANGAR_SHIPS.find((ship) => ship.shipType === selectedShip)!;

  const previewStyle = {
    '--hangar-hull': equippedItems.hull.tone,
    '--hangar-trail': equippedItems.trail.tone,
    '--hangar-insignia': equippedItems.insignia.tone,
    '--hangar-finish-filter': HULL_PREVIEW_FILTERS[loadout.hull] ?? 'none',
  } as CSSProperties;

  const equip = (itemId: string) => {
    sound.playSelect();
    setLoadout({ ...loadout, [category]: itemId });
    setSaved(false);
  };

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
                <h2 id="ship-preview-title">{shipLabels[selectedShip]}</h2>
              </div>
              <b>{selectedShip === 'interceptor' ? 'AX-7' : selectedShipAsset.number}</b>
            </header>
            <div className="vi-ship-stage">
              <div className="vi-ship-trail vi-ship-trail--left" />
              <div className="vi-ship-trail vi-ship-trail--right" />
              <div className="vi-ship-model">
                <img className="vi-ship-model__art" src={selectedShipAsset.src} alt={shipLabels[selectedShip]} />
                <span className="vi-ship-model__insignia" aria-hidden="true">△</span>
              </div>
              <div className="vi-ship-orbit" />
            </div>
            <nav className="vi-ship-roster" aria-label={t('hangarFleet')}>
              {HANGAR_SHIPS.map(({ shipType, src, number }) => (
                <button
                  key={shipType}
                  type="button"
                  className={selectedShip === shipType ? 'is-selected' : ''}
                  aria-pressed={selectedShip === shipType}
                  onClick={() => {
                    sound.playSelect();
                    setSelectedShip(shipType);
                  }}
                  onMouseEnter={() => hover(500)}
                >
                  <img src={src} alt="" aria-hidden="true" loading="lazy" />
                  <span>{shipLabels[shipType]}</span>
                  <small>{shipType === 'interceptor' ? 'AX-7' : number}</small>
                </button>
              ))}
            </nav>
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
                <h2 id="collection-title">{t('collection')}</h2>
              </div>
              <small>{t('cosmeticOnly')}</small>
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
                const image = imageForCosmetic(item);
                return (
                  <button
                    key={item.id}
                    className={`${equipped ? 'is-equipped' : ''} ${!item.unlocked ? 'is-locked' : ''}`}
                    disabled={!item.unlocked}
                    onClick={() => equip(item.id)}
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
                      {!item.unlocked ? t('comingSoon') : equipped ? t('equipped') : t('available')}
                    </em>
                  </button>
                );
              })}
            </div>
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
