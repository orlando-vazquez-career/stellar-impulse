import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useI18n } from '../i18n';
import { SettingsPanel } from '../settings/SettingsScreen';
import { usePreferences } from '../settings/preferences-context';
import { useSettingsLeaveGuard } from '../settings/useSettingsLeaveGuard';
import { gameText } from './game-copy';
import { focusAfterMenu, wrapTab } from './game-menu-state';

/** What the match can ask of an open menu. */
export interface GameMenuHandle {
  /** Closes the menu the way Resume does; with unsaved settings it first asks to save or discard them. */
  requestClose(): void;
}

/** Elements Tab stops on. */
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The in-match menu: resume, the full settings and leave. Where the match can pause (practice against the AI, the
 * offline sandbox) the match pauses while it is open; elsewhere it says the match keeps running. Every way out of
 * the settings goes through the unsaved-changes guard. Tab never leaves it for the HUD behind the overlay.
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

  const root = useRef<HTMLDivElement>(null);

  // Focus starts on Resume and comes back to Settings after leaving them. Once the menu closes it returns where it
  // was, except to a control: Space is a match shortcut that the match lets through to a focused button, so Space
  // on the Menu button that opened it would reopen the menu. Then focus stays on the page.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resume.current?.focus();
    return () => {
      const target = focusAfterMenu(previous);
      if (target) target.focus();
      else if (previous && document.activeElement === previous) previous.blur();
    };
  }, []);

  // A modal: Tab wraps inside the menu (or inside the unsaved-changes question while it is up) and focus that
  // lands outside it comes back.
  useEffect(() => {
    const menu = root.current;
    if (!menu) return;
    let backwards = false;
    const stops = () => Array.from((menu.querySelector<HTMLElement>('.vi-confirm-leave') ?? menu).querySelectorAll<HTMLElement>(TABBABLE))
      .filter((element) => element.getClientRects().length > 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      backwards = event.shiftKey;
      const target = wrapTab(stops(), document.activeElement instanceof HTMLElement ? document.activeElement : null, event.shiftKey);
      if (!target) return;
      event.preventDefault();
      target.focus();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && menu.contains(event.target)) return;
      wrapTab(stops(), null, backwards)?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);
  const back = () => guard(() => {
    setSection('main');
    requestAnimationFrame(() => settings.current?.focus());
  });

  const title = gameText(locale, canPause ? 'menuPausedTitle' : 'menuLiveTitle');
  // The settings record key bindings, and they ignore keys aimed at an aria-modal element: only the main card is modal.
  return <div ref={root} className={`vi-game-menu vi-game-menu--${section}`} role="dialog" aria-modal={section === 'main' ? true : undefined} aria-labelledby={titleId}>
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
