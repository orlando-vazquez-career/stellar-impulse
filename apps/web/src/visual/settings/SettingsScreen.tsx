import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';
import { useSpaceSound } from '../../login/sound';
import { createCommandSpaceScene } from '../menu/command-space';
import { freshDefaultVisualPreferences, type ControlAction, type VisualPreferences } from './preferences';
import { AudioControls } from './AudioControls';
import './settings.css';

type SettingsCategory = 'audio' | 'controls' | 'language' | 'accessibility';

const controlActions: ControlAction[] = ['move', 'attack', 'hold', 'capture', 'cancel', 'camera'];
const keyOptions = ['M', 'H', 'C', 'Q', 'E', 'R', 'F', 'Space', 'Esc']; // WASD is reserved for the camera.

function ToggleSetting({ title, detail, checked, onChange }: { title: string; detail: string; checked: boolean; onChange(checked: boolean): void }) {
  return <label className="vi-setting-toggle"><span><strong>{title}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

/** `onPreviewAudio` plays the draft mix live; leaving without saving makes the app restore the saved one. */
export function SettingsScreen({ preferences, onBack, onSave, onPreviewAudio }: { preferences: VisualPreferences; onBack(): void; onSave(preferences: VisualPreferences): void; onPreviewAudio?(audio: VisualPreferences['audio']): void }) {
  const { locale, setLocale, t } = useI18n();
  const sound = useSpaceSound();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [category, setCategory] = useState<SettingsCategory>('audio');
  const [draft, setDraft] = useState<VisualPreferences>(() => ({
    audio: { ...preferences.audio }, controls: { ...preferences.controls }, accessibility: { ...preferences.accessibility },
  }));
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!canvas.current) return;
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
  }, [preferences.accessibility.reducedMotion]);

  // Menu sounds already follow the live Interface volume.
  const hover = () => sound.playHover({ pitch: 560 });
  const select = () => sound.playSelect();
  const changeAudio = (audio: VisualPreferences['audio']) => {
    setDraft({ ...draft, audio });
    onPreviewAudio?.(audio);
    markDirty();
  };

  const categories: Array<{ id: SettingsCategory; label: string; glyph: string }> = [
    { id: 'audio', label: t('audio'), glyph: '◖' },
    { id: 'controls', label: t('controls'), glyph: '⌁' },
    { id: 'language', label: t('language'), glyph: '文' },
    { id: 'accessibility', label: t('accessibility'), glyph: '◎' },
  ];
  const controlLabels: Record<ControlAction, string> = {
    move: t('move'), attack: t('attack'), hold: t('hold'), capture: t('capture'), cancel: t('cancel'), camera: t('resetCamera'),
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

  return <main className="vi-settings vi-screen">
    <canvas ref={canvas} className="vi-settings-canvas" aria-hidden="true" />
    <header className="vi-screen__header"><Brand /><div className="vi-header-actions"><LanguageToggle /><button className="vi-text-button" onMouseEnter={hover} onClick={() => { select(); onBack(); }}>← {t('backToCommand')}</button></div></header>
    <section className="vi-settings__content">
      <div className="vi-settings__heading"><div><p className="vi-eyebrow">{t('settingsEyebrow')}</p><h1>{t('settingsTitle')}</h1></div><p>{t('settingsBody')}</p></div>

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
              <div className="vi-control-settings__head"><span>{t('action')}</span><span>{t('assignedKey')}</span></div>
              {controlActions.map((action) => <label key={action}><strong>{controlLabels[action]}</strong><select aria-label={controlLabels[action]} value={draft.controls[action]} onChange={(event) => { setDraft({ ...draft, controls: { ...draft.controls, [action]: event.target.value } }); markDirty(); }}>{keyOptions.map((key) => <option key={key} value={key}>{key}</option>)}</select></label>)}
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
    </section>
    <footer className="vi-screen__footer"><span>IMPULSO // {t('settings').toUpperCase()}</span><span>LOCAL // v0.4</span></footer>
  </main>;
}
