import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';
import { AudioToggle } from '../shared/AudioToggle';
import { useSpaceSound } from '../../login/sound';
import { createCommandSpaceScene } from './command-space';
import { HangarPanel } from '../hangar/HangarScreen';
import { SettingsPanel } from '../settings/SettingsScreen';
import { loadVisualPreferences, saveVisualPreferences, type VisualPreferences } from '../settings/preferences';

function MenuCard({
  title,
  detail,
  glyph,
  enabled = false,
  active = false,
  onClick,
}: {
  title: string;
  detail: string;
  glyph: string;
  enabled?: boolean;
  active?: boolean;
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
      className={`vi-menu-card ${active ? 'is-active' : ''}`}
      disabled={!enabled}
      onMouseEnter={handleHover}
      onClick={handleClick}
      aria-expanded={active}
    >
      <span className="vi-menu-card__glyph" aria-hidden="true">{glyph}</span>
      <span className="vi-menu-card__copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {enabled ? (
        <span className="vi-menu-card__arrow" aria-hidden="true">
          {active ? '◀' : '→'}
        </span>
      ) : (
        <span className="vi-menu-card__tag">{t('inDevelopment')}</span>
      )}
    </button>
  );
}

export interface CommandCenterProps {
  alias: string;
  accountEmail?: string;
  preferences?: VisualPreferences;
  onSavePreferences?: (preferences: VisualPreferences) => void;
  onCreateRoom(): void;
  onCreateMultiplayer(): void;
  onJoinRoom(): void;
  onHangar?(): void;
  onSettings?(): void;
  onSignOut(): void;
  onProfile?(): void;
  onBack?(): void;
}

export function CommandCenter({
  alias,
  accountEmail,
  preferences,
  onSavePreferences,
  onCreateRoom,
  onCreateMultiplayer,
  onJoinRoom,
  onHangar,
  onSettings,
  onSignOut,
  onProfile,
  onBack,
}: CommandCenterProps) {
  const { t } = useI18n();
  const sound = useSpaceSound();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [unfoldedPanel, setUnfoldedPanel] = useState<'hangar' | 'settings' | null>(null);
  const [internalPreferences, setInternalPreferences] = useState<VisualPreferences>(
    () => preferences ?? loadVisualPreferences(),
  );

  useEffect(() => {
    if (preferences) {
      setInternalPreferences(preferences);
    }
  }, [preferences]);

  const effectivePreferences = preferences ?? internalPreferences;
  const handleSavePreferences = (next: VisualPreferences) => {
    saveVisualPreferences(next);
    setInternalPreferences(next);
    onSavePreferences?.(next);
  };

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

  function toggleHangar() {
    setUnfoldedPanel((current) => (current === 'hangar' ? null : 'hangar'));
  }

  function toggleSettings() {
    setUnfoldedPanel((current) => (current === 'settings' ? null : 'settings'));
  }

  function handleBack() {
    sound.playSelect();
    if (unfoldedPanel) {
      setUnfoldedPanel(null);
    } else if (onBack) {
      onBack();
    } else {
      onSignOut();
    }
  }

  return (
    <main className="vi-command vi-screen">
      <canvas ref={canvas} className="vi-command-canvas" aria-hidden="true" />
      <header className="vi-screen__header vi-command__header">
        <div className="vi-command__header-brand">
          <Brand />
          <div className="vi-command__header-tag">
            <span className="vi-hud-badge">● SISTEMAS EN LÍNEA</span>
            <span className="vi-command__channel">{t('sector').toUpperCase()} 01 // PUENTE</span>
          </div>
        </div>

        <div className="vi-command__header-greeting">
          <h1 className="vi-command__greeting">{t('welcome', { name: alias })}</h1>
          <p className="vi-command__subtitle">{t('menuBody')}</p>
        </div>

        <div className="vi-header-actions vi-command__header-actions">
          <AudioToggle />
          <LanguageToggle />
          {onProfile && <button className="vi-text-button" onClick={onProfile}>{t('profile')}</button>}
          <button className="vi-text-button" onClick={onSignOut}>{t(accountEmail ? 'accountLogout' : 'signOut')}</button>
        </div>
      </header>

      <section className={`vi-command__content ${unfoldedPanel ? 'has-unfolded-panel' : ''}`}>
        <div className="vi-command__sidebar">
          <div className="vi-command__menu-label">
            <button
              type="button"
              className="vi-command__back-btn"
              onClick={handleBack}
              onMouseEnter={() => sound.playHover({ pitch: 580 })}
              title="Ir atrás"
            >
              <span className="vi-command__back-arrow" aria-hidden="true">◀</span>
              <span>IR ATRÁS</span>
            </button>
            <span className="vi-command__menu-tag">OPERACIONES</span>
          </div>

          <div className="vi-menu-grid">
            <MenuCard glyph="△" title={t('deploy')} detail={t('deployDetail')} enabled onClick={onCreateRoom} />
            <MenuCard glyph="⇄" title={t('createMultiplayer')} detail={t('createMultiplayerDetail')} enabled onClick={onCreateMultiplayer} />
            <MenuCard glyph="⌁" title={t('joinRoom')} detail={t('joinDetail')} enabled onClick={onJoinRoom} />
            <MenuCard
              glyph="◇"
              title={t('hangar')}
              detail={t('hangarDetail')}
              enabled
              active={unfoldedPanel === 'hangar'}
              onClick={toggleHangar}
            />
            <MenuCard
              glyph="＋"
              title={t('settings')}
              detail={t('settingsDetail')}
              enabled
              active={unfoldedPanel === 'settings'}
              onClick={toggleSettings}
            />
          </div>
        </div>

        {unfoldedPanel && (
          <div className="vi-command__workspace">
            {unfoldedPanel === 'hangar' && (
              <HangarPanel onBack={() => setUnfoldedPanel(null)} isEmbedded />
            )}
            {unfoldedPanel === 'settings' && (
              <SettingsPanel
                preferences={effectivePreferences}
                onSave={handleSavePreferences}
                onBack={() => setUnfoldedPanel(null)}
                isEmbedded
              />
            )}
          </div>
        )}
      </section>

      <footer className="vi-screen__footer vi-command__footer">
        <span>{t('commander')} // {alias.toUpperCase()}</span>
        <span>{accountEmail || t('localConnection')}</span>
      </footer>
    </main>
  );
}

