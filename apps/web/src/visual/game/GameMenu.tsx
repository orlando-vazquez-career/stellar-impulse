import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useI18n } from '../i18n';
import { SettingsPanel } from '../settings/SettingsScreen';
import { usePreferences } from '../settings/preferences-context';
import { useSettingsLeaveGuard } from '../settings/useSettingsLeaveGuard';
import { gameText } from './game-copy';

/** What the match can ask of an open menu. */
export interface GameMenuHandle {
  /** Closes the menu the way Resume does; with unsaved settings it first asks to save or discard them. */
  requestClose(): void;
}

/**
 * The in-match menu: resume, the full settings and leave. Where the match can pause (practice against the AI, the
 * offline sandbox) the match pauses while it is open; elsewhere it says the match keeps running. Every way out of
 * the settings goes through the unsaved-changes guard.
 */
export function GameMenu({ canPause, onResume, onLeave, ref }: {
  canPause: boolean;
  onResume(): void;
  onLeave(): void;
  ref?: Ref<GameMenuHandle>;
}) {
  const { locale } = useI18n();
  const { preferences, savePreferences, previewAudio } = usePreferences();
  const { panelRef, guard, dialog } = useSettingsLeaveGuard();
  const [section, setSection] = useState<'main' | 'settings'>('main');
  const titleId = useId();
  const resume = useRef<HTMLButtonElement>(null);
  const settings = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => ({ requestClose: () => guard(onResume) }), [guard, onResume]);

  // Focus starts on Resume, comes back to Settings after leaving them and returns where it was once the menu closes.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resume.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const back = () => guard(() => {
    setSection('main');
    requestAnimationFrame(() => settings.current?.focus());
  });

  const title = gameText(locale, canPause ? 'menuPausedTitle' : 'menuLiveTitle');
  // The settings record key bindings, and they ignore keys aimed at an aria-modal element: only the main card is modal.
  return <div className={`vi-game-menu vi-game-menu--${section}`} role="dialog" aria-modal={section === 'main' ? true : undefined} aria-labelledby={titleId}>
    {section === 'main' ? <div className="vi-game-menu__card">
      <h2 id={titleId}>{title}</h2>
      <p>{gameText(locale, 'menuEscapeHint')}</p>
      <div className="vi-game-menu__actions">
        <button ref={resume} className="vi-primary" onClick={onResume}>{gameText(locale, 'menuResume')}</button>
        <button ref={settings} onClick={() => setSection('settings')}>{gameText(locale, 'menuSettings')}</button>
        <button onClick={onLeave}>{gameText(locale, 'menuLeave')}</button>
      </div>
    </div> : <div className="vi-game-menu__settings">
      <h2 id={titleId} className="vi-game-menu__settings-title">{title}</h2>
      <SettingsPanel ref={panelRef} preferences={preferences} onSave={savePreferences} onPreviewAudio={previewAudio} onBack={back} isEmbedded />
    </div>}
    {dialog}
  </div>;
}
