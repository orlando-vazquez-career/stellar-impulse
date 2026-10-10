import { useId, useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n';
import { useSpaceSound } from '../../login/sound';
import type { SquadType } from '../game/model';
import { GAME_ASSET_MANIFEST, GAME_SHIP_TYPES } from '../game/phaser/game-assets';
import { hangarCategories, hullFilter, itemById, type CosmeticItem, type HangarCategory } from './catalog';
import type { CosmeticLoadout } from './loadout';
import { marketText } from '../market/market-copy';
import './hangar.css';

const HANGAR_SHIPS = GAME_SHIP_TYPES.map((shipType, index) => {
  const asset = GAME_ASSET_MANIFEST.find((candidate) => candidate.kind === 'ship'
    && candidate.faction === 'blue' && candidate.shipType === shipType);
  if (!asset) throw new Error(`Missing Hangar preview for ${shipType}`);
  return { shipType, src: asset.src, number: String(index + 1).padStart(2, '0') };
});

/**
 * The ship wearing a loadout: hull filter, trail and insignia colours, and the fleet selector.
 * The Hangar passes the equipped loadout (with a piece tried on); the Market passes the piece on sale.
 */
export function CosmeticPreview({ loadout, trying = null, summary = null }: {
  /** What the ship wears. */
  loadout: CosmeticLoadout;
  /** A piece shown without being equipped: the badge says so. */
  trying?: CosmeticItem | null;
  /** The equipped loadout listed under the ship (the Hangar); left out when null. */
  summary?: CosmeticLoadout | null;
}) {
  const { t, locale } = useI18n();
  const sound = useSpaceSound();
  const titleId = useId();
  const [ship, setShip] = useState<SquadType>('interceptor');
  const shipAsset = HANGAR_SHIPS.find((candidate) => candidate.shipType === ship)!;
  const worn = (slot: HangarCategory) => itemById(loadout[slot]);
  const shipLabels: Record<SquadType, string> = {
    interceptor: t('unitInterceptor'),
    explorer: t('unitExplorer'),
    frigate: t('unitFrigate'),
    bomber: t('unitBomber'),
  };
  const categoryLabels: Record<HangarCategory, string> = {
    hull: t('hullFinish'),
    trail: t('engineTrail'),
    insignia: t('insignia'),
    voice: t('announcerPack'),
    music: t('musicTrack'),
  };
  const style = {
    '--hangar-hull': worn('hull')?.tone,
    '--hangar-trail': worn('trail')?.tone,
    '--hangar-insignia': worn('insignia')?.tone,
    '--hangar-finish-filter': hullFilter(worn('hull')),
  } as CSSProperties;

  return (
    <section className={`vi-ship-preview ${trying ? 'is-trying' : ''}`} aria-labelledby={titleId} style={style}>
      <header>
        <div>
          <span>{t('shipPreview')}</span>
          <h2 id={titleId}>{shipLabels[ship]}</h2>
        </div>
        <b>{ship === 'interceptor' ? 'AX-7' : shipAsset.number}</b>
      </header>
      <div className="vi-ship-stage">
        {trying && <em className="vi-preview-badge">{marketText(locale, 'previewBadge')}</em>}
        <div className="vi-ship-trail vi-ship-trail--left" />
        <div className="vi-ship-trail vi-ship-trail--right" />
        <div className="vi-ship-model">
          <img className="vi-ship-model__art" src={shipAsset.src} alt={shipLabels[ship]} />
          <span className="vi-ship-model__insignia" aria-hidden="true">△</span>
        </div>
        <div className="vi-ship-orbit" />
      </div>
      <nav className="vi-ship-roster" aria-label={t('hangarFleet')}>
        {HANGAR_SHIPS.map(({ shipType, src, number }) => (
          <button
            key={shipType}
            type="button"
            className={ship === shipType ? 'is-selected' : ''}
            aria-pressed={ship === shipType}
            onClick={() => {
              sound.playSelect();
              setShip(shipType);
            }}
            onMouseEnter={() => sound.playHover({ pitch: 500 })}
          >
            <img src={src} alt="" aria-hidden="true" loading="lazy" />
            <span>{shipLabels[shipType]}</span>
            <small>{shipType === 'interceptor' ? 'AX-7' : number}</small>
          </button>
        ))}
      </nav>
      {summary && (
        <div className="vi-loadout-summary">
          <strong>{t('currentLoadout')}</strong>
          <div>
            {hangarCategories.map((slot) => (
              <span key={slot}>
                <small>{categoryLabels[slot]}</small>
                <b>{itemById(summary[slot])?.name[locale]}</b>
              </span>
            ))}
          </div>
          <p>{t('previewHint')}</p>
        </div>
      )}
    </section>
  );
}
