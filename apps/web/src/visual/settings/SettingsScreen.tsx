import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useI18n } from '../i18n';
import { useSpaceSound } from '../../login/sound';
import { chooseReducedMotion, freshDefaultVisualPreferences, hasUnsavedChanges, type ControlAction, type VisualPreferences } from './preferences';
import { CONTROL_SECTIONS, findBindingConflict, formatKeyBinding, keyBindingFromEvent, type ControlBindings } from './control-bindings';
import { AudioControls } from './AudioControls';
import { publishSavedAccessibility, setAccessibilityPreview } from './accessibility-store';
import './settings.css';

type SettingsCategory = 'audio' | 'controls' | 'language' | 'accessibility';

/** What a screen that hosts the panel can ask of it before leaving (see useSettingsLeaveGuard). */
export interface SettingsPanelHandle {
  /** True when the draft differs from what is saved. */
  isDirty(): boolean;
  /** Saves the draft, as the save button does. */
  save(): void;
  /** Drops the draft: the audio and accessibility previews go back to what is saved and key recording stops. */
  discard(): void;
}

function copyPreferences(preferences: VisualPreferences): VisualPreferences {
  return { audio: { ...preferences.audio }, controls: { ...preferences.controls }, accessibility: { ...preferences.accessibility } };
}

function ToggleSetting({ title, detail, checked, onChange }: { title: string; detail: string; checked: boolean; onChange(checked: boolean): void }) {
  return <label className="vi-setting-toggle"><span><strong>{title}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

export function SettingsPanel({
  preferences,
  onBack,
  onSave,
  onPreviewAudio,
  isEmbedded = false,
  ref,
}: {
  preferences: VisualPreferences;
  onBack(): void;
  onSave(preferences: VisualPreferences): void;
  onPreviewAudio?(audio: VisualPreferences['audio']): void;
  isEmbedded?: boolean;
  ref?: Ref<SettingsPanelHandle>;
}) {
  const { locale, setLocale, t } = useI18n();
  const sound = useSpaceSound();
  const [category, setCategory] = useState<SettingsCategory>('audio');
  const [draft, setDraft] = useState<VisualPreferences>(() => copyPreferences(preferences));
  const [saved, setSaved] = useState(false);
  /** What is saved right now; save() moves it before the host re-renders with the new preferences. */
  const savedRef = useRef(preferences);
  useEffect(() => { savedRef.current = preferences; }, [preferences]);
  const dirty = hasUnsavedChanges(preferences, draft);
  const previewAudio = useRef(onPreviewAudio);
  previewAudio.current = onPreviewAudio;
  // However the panel goes away, the live mix and the accessibility preview return to what is saved.
  useEffect(() => () => {
    previewAudio.current?.(savedRef.current.audio);
    setAccessibilityPreview(null);
  }, []);
  /** Accessibility changes show at once across the app, before they are saved. */
  const changeAccessibility = (change: Partial<VisualPreferences['accessibility']>) => {
    showAccessibility({ ...draft.accessibility, ...change });
  };
  /** The motion switch is the player's own choice; until they touch it, motion follows the system. */
  const changeReducedMotion = (reducedMotion: boolean) => {
    showAccessibility(chooseReducedMotion(savedRef.current.accessibility, draft.accessibility, reducedMotion));
  };
  const showAccessibility = (accessibility: VisualPreferences['accessibility']) => {
    setDraft({ ...draft, accessibility });
    setAccessibilityPreview(accessibility);
    clearSavedNotice();
  };
  const [recording, setRecording] = useState<{ action: ControlAction; replacing: string | null } | null>(null);
  const [bindingError, setBindingError] = useState<{ action: ControlAction; message: string } | null>(null);

  const soundEnabled = !draft.audio.muted && draft.audio.master > 0 && draft.audio.effects > 0;
  const hover = () => { if (soundEnabled) sound.playHover({ pitch: 560 }); };
  const select = () => { if (soundEnabled) sound.playSelect(); };
  const changeAudio = (audio: VisualPreferences['audio']) => {
    setDraft({ ...draft, audio });
    onPreviewAudio?.(audio);
    setSaved(false);
  };

  useEffect(() => {
    if (!recording) return;
    const capture = (event: KeyboardEvent) => {
      // Keys aimed at a modal dialog (such as the leave confirmation) are not a new binding.
      if (event.target instanceof Element && event.target.closest('[aria-modal="true"]')) return;
      const binding = keyBindingFromEvent(event);
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!binding) {
        setBindingError({ action: recording.action, message: t('pressNonModifierKey') });
        return;
      }
      const conflict = findBindingConflict(draft.controls, binding, recording.action, recording.replacing ?? undefined);
      if (conflict) {
        setBindingError({ action: recording.action, message: t('bindingConflict', { action: controlLabel(conflict) }) });
        return;
      }
      const current = draft.controls[recording.action];
      const next = recording.replacing
        ? current.map((existing) => existing === recording.replacing ? binding : existing)
        : [...current, binding];
      const controls = { ...draft.controls, [recording.action]: [...new Set(next)] } as ControlBindings;
      setDraft({ ...draft, controls });
      setRecording(null);
      setBindingError(null);
      setSaved(false);
    };
    window.addEventListener('keydown', capture, true);
    return () => window.removeEventListener('keydown', capture, true);
  }, [recording, draft, locale]);

  const categories: Array<{ id: SettingsCategory; label: string; glyph: string }> = [
    { id: 'audio', label: t('audio'), glyph: '◖' },
    { id: 'controls', label: t('controls'), glyph: '⌁' },
    { id: 'language', label: t('language'), glyph: '文' },
    { id: 'accessibility', label: t('accessibility'), glyph: '◎' },
  ];
  const controlSectionTitles = {
    orders: t('controlSectionOrders'), camera: t('controlSectionCamera'), production: t('controlSectionProduction'),
    formation: t('controlSectionFormation'), groups: t('controlSectionGroups'),
  };
  function controlLabel(action: ControlAction): string {
    const assign = /^groupAssign([1-9])$/.exec(action);
    if (assign) return `${t('assignGroup')} ${assign[1]}`;
    const recall = /^groupRecall([1-9])$/.exec(action);
    if (recall) return `${t('recallGroup')} ${recall[1]}`;
    const labels: Partial<Record<ControlAction, string>> = {
      move: t('move'), attack: t('attack'), hold: t('hold'), capture: t('capture'), cancel: t('cancel'), selectBase: t('selectBase'),
      cameraFocus: t('resetCamera'), panUp: t('panUp'), panDown: t('panDown'), panLeft: t('panLeft'), panRight: t('panRight'),
      produceInterceptor: t('produceInterceptor'), produceFrigate: t('produceFrigate'), produceBomber: t('produceBomber'), produceExplorer: t('produceExplorer'),
      cycleFormation: t('cycleFormation'), disband: t('disbandSelected'),
    };
    return labels[action] ?? action;
  }

  const changeBindings = (action: ControlAction, bindings: string[]) => {
    setDraft({ ...draft, controls: { ...draft.controls, [action]: bindings } });
    setSaved(false);
    setBindingError(null);
  };

  const beginRecording = (action: ControlAction, replacing: string | null) => {
    setBindingError(null);
    setRecording({ action, replacing });
  };

  const clearSavedNotice = () => { setSaved(false); };
  const commit = () => {
    setRecording(null);
    onSave(draft);
    savedRef.current = draft;
    // The saved accessibility takes over from the preview in one step, whatever the host does next.
    publishSavedAccessibility(draft.accessibility);
    setAccessibilityPreview(null);
    setSaved(true);
  };
  const save = () => {
    sound.playEnter({ pitch: 392 });
    commit();
  };
  const discard = () => {
    setRecording(null);
    setBindingError(null);
    const current = savedRef.current;
    setDraft(copyPreferences(current));
    onPreviewAudio?.(current.audio);
    setAccessibilityPreview(null);
    setSaved(false);
  };
  useImperativeHandle(ref, () => ({
    isDirty: () => hasUnsavedChanges(savedRef.current, draft),
    save: commit,
    discard,
  }));
  const restore = () => {
    select();
    const defaults = freshDefaultVisualPreferences();
    setDraft(defaults);
    onPreviewAudio?.(defaults.audio);
    setAccessibilityPreview(defaults.accessibility);
    clearSavedNotice();
  };

  return (
    <section className={`vi-settings__content ${isEmbedded ? 'vi-settings__content--embedded' : ''}`}>
      <div className="vi-settings__heading">
        <div>
          <p className="vi-eyebrow">{t('settingsEyebrow')}</p>
          <h1>{t('settingsTitle')}</h1>
        </div>
        <div className="vi-settings__heading-meta">
          <p>{t('settingsBody')}</p>
          {isEmbedded && (
            <button
              className="vi-embedded-close"
              onClick={() => {
                select();
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

      <div className="vi-settings__workspace">
        <nav className="vi-settings__nav" aria-label={t('settings')}>
          <span>{t('settingsLocalNote')}</span>
          {categories.map((item, index) => <button key={item.id} className={category === item.id ? 'is-active' : ''} onMouseEnter={hover} onClick={() => { select(); setCategory(item.id); }} aria-pressed={category === item.id}>
            <i>{item.glyph}</i><strong>{item.label}</strong><small>0{index + 1}</small>
          </button>)}
        </nav>

        <section className="vi-settings-panel" aria-labelledby={`settings-${category}`}>
          {category === 'audio' && <>
            <header><span>01</span><div><h2 id="settings-audio">{t('audio')}</h2><p>{t('audioDescription')}</p></div></header>
            <div className="vi-settings-panel__body vi-audio-settings">
              <AudioControls value={draft.audio} onChange={changeAudio} />
              {dirty && <p className="vi-audio-unsaved">{t('unsavedAudio')}</p>}
            </div>
          </>}

          {category === 'controls' && <>
            <header><span>02</span><div><h2 id="settings-controls">{t('controls')}</h2><p>{t('controlsDescription')}</p></div></header>
            <div className="vi-settings-panel__body vi-control-settings">
              {CONTROL_SECTIONS.map((section) => {
                const title = controlSectionTitles[section.id];
                return <section className="vi-control-settings__section" key={section.id} aria-label={title}>
                  <h3>{title}</h3>
                  {section.actions.map((action) => {
                    const label = controlLabel(action);
                    const isRecording = recording?.action === action;
                    return <div className="vi-control-settings__row" key={action} role="group" aria-label={label}>
                      <strong>{label}</strong>
                      <div className="vi-control-settings__bindings">
                        {draft.controls[action].map((binding) => {
                          const display = formatKeyBinding(binding, locale === 'es' ? 'Espacio' : 'Space');
                          return <span className="vi-control-binding" key={binding}>
                            <button type="button" className="vi-control-binding__key" aria-label={t('changeKeyFor', { key: display, action: label })} onClick={() => beginRecording(action, binding)}><kbd>{display}</kbd></button>
                            <button type="button" className="vi-control-binding__remove" aria-label={t('removeKeyFor', { key: display, action: label })} onClick={() => changeBindings(action, draft.controls[action].filter((item) => item !== binding))}>×</button>
                          </span>;
                        })}
                        <button type="button" className="vi-control-binding__add" aria-label={`${t('addKeyFor')} ${label}`} onClick={() => beginRecording(action, null)}>+ {t('addKey')}</button>
                      </div>
                      {isRecording && <div className="vi-control-settings__recording" role="status"><span>{t('pressAnyKey')}</span><button type="button" onClick={() => setRecording(null)}>{t('stopRecording')}</button></div>}
                      {bindingError?.action === action && <small className="vi-control-settings__error" role="alert">{bindingError.message}</small>}
                    </div>;
                  })}
                </section>;
              })}
            </div>
          </>}

          {category === 'language' && <>
            <header><span>03</span><div><h2 id="settings-language">{t('language')}</h2><p>{t('languageDescription')}</p></div></header>
            <div className="vi-settings-panel__body vi-language-settings">
              <h3>{t('interfaceLanguage')}</h3>
              <p className="vi-language-settings__note">{t('languageInstantNote')}</p>
              <div><button className={locale === 'es' ? 'is-selected' : ''} onClick={() => setLocale('es')} aria-pressed={locale === 'es'}><span>ES</span><strong>{t('spanishName')}</strong><i>01</i></button><button className={locale === 'en' ? 'is-selected' : ''} onClick={() => setLocale('en')} aria-pressed={locale === 'en'}><span>EN</span><strong>{t('englishName')}</strong><i>02</i></button></div>
            </div>
          </>}

          {category === 'accessibility' && <>
            <header><span>04</span><div><h2 id="settings-accessibility">{t('accessibility')}</h2><p>{t('accessibilityDescription')}</p></div></header>
            <div className="vi-settings-panel__body vi-accessibility-settings">
              <ToggleSetting title={t('highContrast')} detail={t('highContrastDetail')} checked={draft.accessibility.highContrast} onChange={(highContrast) => changeAccessibility({ highContrast })} />
              <ToggleSetting title={t('reducedMotion')} detail={t('reducedMotionDetail')} checked={draft.accessibility.reducedMotion} onChange={changeReducedMotion} />
              <ToggleSetting title={t('largeInterfaceText')} detail={t('largeInterfaceTextDetail')} checked={draft.accessibility.largeText} onChange={(largeText) => changeAccessibility({ largeText })} />
              {/* The colour profile stays in the saved preferences, but no palette uses it yet, so it is not offered. */}
            </div>
          </>}

          <footer><button className="vi-settings__restore" onMouseEnter={hover} onClick={restore}>{t('restoreDefaults')}</button><div>{saved && <output>{t('settingsSaved')}</output>}<button className="vi-settings__save" onMouseEnter={hover} onClick={save}>{t('saveSettings')}<span>→</span></button></div></footer>
        </section>
      </div>
    </section>
  );
}
