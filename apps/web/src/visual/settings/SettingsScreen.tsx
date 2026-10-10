import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';
import { useSpaceSound } from '../../login/sound';
import { createCommandSpaceScene } from '../menu/command-space';
import { freshDefaultVisualPreferences, type ControlAction, type VisualPreferences } from './preferences';
import { CONTROL_SECTIONS, findBindingConflict, formatKeyBinding, keyBindingFromEvent, type ControlBindings } from './control-bindings';
import { AudioControls } from './AudioControls';
import './settings.css';

type SettingsCategory = 'audio' | 'controls' | 'language' | 'accessibility';

function ToggleSetting({ title, detail, checked, onChange }: { title: string; detail: string; checked: boolean; onChange(checked: boolean): void }) {
  return <label className="vi-setting-toggle"><span><strong>{title}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

export type SettingsPanelHandle = { requestLeave(): void };

type SettingsPanelProps = {
  preferences: VisualPreferences;
  onBack(): void;
  onSave(preferences: VisualPreferences): void;
  onPreviewAudio?(audio: VisualPreferences['audio']): void;
  isEmbedded?: boolean;
};

export const SettingsPanel = forwardRef<SettingsPanelHandle, SettingsPanelProps>(function SettingsPanel({
  preferences,
  onBack,
  onSave,
  onPreviewAudio,
  isEmbedded = false,
}, ref) {
  const { locale, setLocale, t } = useI18n();
  const sound = useSpaceSound();
  const [category, setCategory] = useState<SettingsCategory>('audio');
  const [draft, setDraft] = useState<VisualPreferences>(() => ({
    audio: { ...preferences.audio }, controls: { ...preferences.controls }, accessibility: { ...preferences.accessibility },
  }));
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [recording, setRecording] = useState<{ action: ControlAction; replacing: string | null } | null>(null);
  const [bindingError, setBindingError] = useState<{ action: ControlAction; message: string } | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const soundEnabled = !draft.audio.muted && draft.audio.master > 0 && draft.audio.effects > 0;
  const hover = () => { if (soundEnabled) sound.playHover({ pitch: 560 }); };
  const select = () => { if (soundEnabled) sound.playSelect(); };
  const changeAudio = (audio: VisualPreferences['audio']) => {
    setDraft({ ...draft, audio });
    onPreviewAudio?.(audio);
    markDirty();
  };

  useEffect(() => {
    if (!recording) return;
    const capture = (event: KeyboardEvent) => {
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
      setDirty(true);
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
      move: t('move'), attack: t('attack'), hold: t('hold'), capture: t('capture'), cancel: t('cancel'),
      cameraFocus: t('resetCamera'), panUp: t('panUp'), panDown: t('panDown'), panLeft: t('panLeft'), panRight: t('panRight'),
      produceInterceptor: t('produceInterceptor'), produceFrigate: t('produceFrigate'), produceBomber: t('produceBomber'), produceExplorer: t('produceExplorer'),
      cycleFormation: t('cycleFormation'), disband: t('disbandSelected'),
    };
    return labels[action] ?? action;
  }

  const changeBindings = (action: ControlAction, bindings: string[]) => {
    setDraft({ ...draft, controls: { ...draft.controls, [action]: bindings } });
    setSaved(false);
    setDirty(true);
    setBindingError(null);
  };

  const beginRecording = (action: ControlAction, replacing: string | null) => {
    setBindingError(null);
    setRecording({ action, replacing });
  };

  const markDirty = () => { setSaved(false); setDirty(true); };
  const save = () => {
    sound.playEnter({ pitch: 392 });
    onSave(draft);
    setSaved(true);
    setDirty(false);
  };
  const restore = () => {
    select();
    const defaults = freshDefaultVisualPreferences();
    setDraft(defaults);
    onPreviewAudio?.(defaults.audio);
    markDirty();
  };
  const leaveWithoutSaving = () => {
    onPreviewAudio?.(preferences.audio);
    setLeaveOpen(false);
    onBack();
  };
  const saveAndLeave = () => {
    save();
    setLeaveOpen(false);
    onPreviewAudio?.(draft.audio);
    onBack();
  };
  const requestLeave = () => {
    select();
    if (!dirty) {
      onBack();
      return;
    }
    setLeaveOpen(true);
  };
  useImperativeHandle(ref, () => ({ requestLeave }), [dirty]);

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
              onClick={requestLeave}
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
              <div><button className={locale === 'es' ? 'is-selected' : ''} onClick={() => setLocale('es')} aria-pressed={locale === 'es'}><span>ES</span><strong>{t('spanishName')}</strong><i>01</i></button><button className={locale === 'en' ? 'is-selected' : ''} onClick={() => setLocale('en')} aria-pressed={locale === 'en'}><span>EN</span><strong>{t('englishName')}</strong><i>02</i></button></div>
            </div>
          </>}

          {category === 'accessibility' && <>
            <header><span>04</span><div><h2 id="settings-accessibility">{t('accessibility')}</h2><p>{t('accessibilityDescription')}</p></div></header>
            <div className="vi-settings-panel__body vi-accessibility-settings">
              <ToggleSetting title={t('highContrast')} detail={t('highContrastDetail')} checked={draft.accessibility.highContrast} onChange={(highContrast) => { setDraft({ ...draft, accessibility: { ...draft.accessibility, highContrast } }); markDirty(); }} />
              <ToggleSetting title={t('reducedMotion')} detail={t('reducedMotionDetail')} checked={draft.accessibility.reducedMotion} onChange={(reducedMotion) => { setDraft({ ...draft, accessibility: { ...draft.accessibility, reducedMotion } }); markDirty(); }} />
              <ToggleSetting title={t('largeInterfaceText')} detail={t('largeInterfaceTextDetail')} checked={draft.accessibility.largeText} onChange={(largeText) => { setDraft({ ...draft, accessibility: { ...draft.accessibility, largeText } }); markDirty(); }} />
              <label className="vi-color-profile"><span><strong>{t('colorProfile')}</strong></span><select value={draft.accessibility.colorProfile} onChange={(event) => { setDraft({ ...draft, accessibility: { ...draft.accessibility, colorProfile: event.target.value as VisualPreferences['accessibility']['colorProfile'] } }); markDirty(); }}><option value="default">{t('colorDefault')}</option><option value="deuteranopia">{t('colorDeuteranopia')}</option><option value="tritanopia">{t('colorTritanopia')}</option></select></label>
            </div>
          </>}

          <footer><button className="vi-settings__restore" onMouseEnter={hover} onClick={restore}>{t('restoreDefaults')}</button><div>{saved && <output>{t('settingsSaved')}</output>}<button className="vi-settings__save" onMouseEnter={hover} onClick={save}>{t('saveSettings')}<span>→</span></button></div></footer>
        </section>
      </div>

      {leaveOpen && (
        <div className="vi-result vi-settings-leave" role="dialog" aria-modal="true" aria-labelledby="settings-leave-title">
          <div className="vi-result__card">
            <h2 id="settings-leave-title">{t('settingsLeaveTitle')}</h2>
            <p>{t('settingsLeaveBody')}</p>
            <div>
              <button type="button" onMouseEnter={hover} onClick={() => { select(); setLeaveOpen(false); }}>{t('settingsLeaveStay')}</button>
              <button type="button" onMouseEnter={hover} onClick={() => { select(); leaveWithoutSaving(); }}>{t('settingsLeaveDiscard')}</button>
              <button type="button" className="vi-primary" onMouseEnter={hover} onClick={saveAndLeave}>{t('settingsLeaveSave')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
});

export function SettingsScreen({
  preferences,
  onBack,
  onSave,
  onPreviewAudio,
  embedded = false,
}: {
  preferences: VisualPreferences;
  onBack(): void;
  onSave(preferences: VisualPreferences): void;
  onPreviewAudio?(audio: VisualPreferences['audio']): void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const sound = useSpaceSound();
  const canvas = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<SettingsPanelHandle>(null);

  useEffect(() => {
    if (embedded || !canvas.current) return;
    const scene = createCommandSpaceScene(canvas.current);
    scene.start();
    if (preferences.accessibility.reducedMotion) scene.stop();

    const onResize = () => scene.resize();
    const onPointer = (event: PointerEvent) => {
      scene.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    window.addEventListener('resize', onResize);
    if (!preferences.accessibility.reducedMotion) window.addEventListener('pointermove', onPointer);
    return () => {
      scene.stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [embedded, preferences.accessibility.reducedMotion]);

  if (embedded) {
    return <SettingsPanel ref={panelRef} preferences={preferences} onBack={onBack} onSave={onSave} onPreviewAudio={onPreviewAudio} isEmbedded />;
  }

  const hover = () => sound.playHover({ pitch: 560 });

  return (
    <main className="vi-settings vi-screen">
      <canvas ref={canvas} className="vi-settings-canvas" aria-hidden="true" />
      <header className="vi-screen__header">
        <Brand />
        <div className="vi-header-actions">
          <LanguageToggle />
          <button className="vi-text-button" onMouseEnter={hover} onClick={() => panelRef.current?.requestLeave()}>
            ← {t('backToCommand')}
          </button>
        </div>
      </header>

      <SettingsPanel ref={panelRef} preferences={preferences} onBack={onBack} onSave={onSave} onPreviewAudio={onPreviewAudio} />

      <footer className="vi-screen__footer">
        <span>IMPULSO // {t('settings').toUpperCase()}</span>
        <span>LOCAL // v0.4</span>
      </footer>
    </main>
  );
}
