import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n';

/**
 * Asks what to do with unsaved settings before leaving them. Focus starts on "keep editing", the
 * safe choice, and Escape means the same.
 */
export function ConfirmLeaveDialog({ onSaveAndLeave, onDiscard, onKeepEditing }: {
  onSaveAndLeave(): void;
  onDiscard(): void;
  onKeepEditing(): void;
}) {
  const { t } = useI18n();
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    keepEditing.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onKeepEditing();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep focus inside the dialog while it is open.
    const buttons = Array.from(dialog.current?.querySelectorAll('button') ?? []);
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <div className="vi-confirm-leave">
    <div ref={dialog} className="vi-confirm-leave__card" role="alertdialog" aria-modal="true"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} onKeyDown={onKeyDown}>
      <h2 id={`${id}-title`}>{t('unsavedTitle')}</h2>
      <p id={`${id}-body`}>{t('unsavedBody')}</p>
      <div className="vi-confirm-leave__actions">
        <button type="button" className="vi-confirm-leave__primary" onClick={onSaveAndLeave}>{t('saveAndLeave')}</button>
        <button type="button" onClick={onDiscard}>{t('discardChanges')}</button>
        <button type="button" ref={keepEditing} onClick={onKeepEditing}>{t('keepEditing')}</button>
      </div>
    </div>
  </div>;
}
