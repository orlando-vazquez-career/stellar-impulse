import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';
import { useSpaceSound } from '../../login/sound';
import { createCommandSpaceScene } from './command-space';

function MenuCard({
  title,
  detail,
  glyph,
  enabled = false,
  onClick,
}: {
  title: string;
  detail: string;
  glyph: string;
  enabled?: boolean;
  onClick?(): void;
}) {
  const { t } = useI18n();
  const sound = useSpaceSound();

  function handleHover() {
    if (enabled) {
      sound.playHover({ pitch: 580 });
    }
  }

  function handleClick() {
    if (enabled && onClick) {
      sound.playSelect();
      onClick();
    }
  }

  return (
    <button
      className="vi-menu-card"
      disabled={!enabled}
      onMouseEnter={handleHover}
      onClick={handleClick}
    >
      <span className="vi-menu-card__glyph" aria-hidden="true">{glyph}</span>
      <span className="vi-menu-card__copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {enabled ? (
        <span className="vi-menu-card__arrow" aria-hidden="true">→</span>
      ) : (
        <span className="vi-menu-card__tag">{t('inDevelopment')}</span>
      )}
    </button>
  );
}

export function CommandCenter({
  alias,
  accountEmail,
  onCreateRoom,
  onCreateMultiplayer,
  onJoinRoom,
  onHangar,
  onSettings,
  onSignOut,
}: {
  alias: string;
  accountEmail?: string;
  onCreateRoom(): void;
  onCreateMultiplayer(): void;
  onJoinRoom(): void;
  onHangar(): void;
  onSettings(): void;
  onSignOut(): void;
}) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);

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

  return (
    <main className="vi-command vi-screen">
      <canvas ref={canvas} className="vi-command-canvas" aria-hidden="true" />
      <header className="vi-screen__header">
        <Brand />
        <div className="vi-header-actions">
          <LanguageToggle />
          <button className="vi-text-button" onClick={onSignOut}>{t(accountEmail ? 'accountLogout' : 'signOut')}</button>
        </div>
      </header>

      <section className="vi-command__content">
        <div className="vi-command__heading">
          <p className="vi-eyebrow">{t('commandCenter')}</p>
          <h1>{t('welcome', { name: alias })}</h1>
          <p>{t('menuBody')}</p>
        </div>

        <div className="vi-menu-grid">
          <MenuCard glyph="△" title={t('deploy')} detail={t('deployDetail')} enabled onClick={onCreateRoom} />
          <MenuCard glyph="⇄" title={t('createMultiplayer')} detail={t('createMultiplayerDetail')} enabled onClick={onCreateMultiplayer} />
          <MenuCard glyph="⌁" title={t('joinRoom')} detail={t('joinDetail')} enabled onClick={onJoinRoom} />
          <MenuCard glyph="◇" title={t('hangar')} detail={t('hangarDetail')} enabled onClick={onHangar} />
          <MenuCard glyph="＋" title={t('settings')} detail={t('settingsDetail')} enabled onClick={onSettings} />
        </div>
      </section>

      <div className="vi-command__sector" aria-hidden="true">
        <span>01</span>
        <i />
        <small>{t('sector')} // {t('preparation')}</small>
      </div>

      <footer className="vi-screen__footer">
        <span>{t('commander')} // {alias.toUpperCase()}</span>
        <span>{accountEmail || t('localConnection')}</span>
      </footer>
    </main>
  );
}
