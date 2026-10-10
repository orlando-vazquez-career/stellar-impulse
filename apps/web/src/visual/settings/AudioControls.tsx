import { Fragment, useEffect, useRef } from 'react';
import { SpaceSound } from '../../login/sound';
import type { AudioMix } from '../audio-mix';
import { MatchAudio } from '../game/audio';
import { useI18n } from '../i18n';

type Level = 'master' | 'music' | 'effects' | 'voice' | 'interface';
const LEVELS: readonly Level[] = ['master', 'music', 'effects', 'voice', 'interface'];
const LABEL = {
  master: 'masterVolume', music: 'musicVolume', effects: 'effectsVolume', voice: 'voiceVolume', interface: 'interfaceVolume',
} as const satisfies Record<Level, string>;

/**
 * Volume sliders shared by the settings screen and the in-match sound panel. Every change goes
 * straight to `onChange`, which feeds the live mix, so the player hears it while dragging.
 */
export function AudioControls({ value, onChange }: { value: AudioMix; onChange(mix: AudioMix): void }) {
  const { t, locale } = useI18n();
  const samples = useRef<{ match: MatchAudio; menu: SpaceSound } | null>(null);
  useEffect(() => () => { samples.current?.match.dispose(); samples.current?.menu.dispose(); samples.current = null; }, []);
  const sample = () => (samples.current ??= { match: new MatchAudio(locale), menu: new SpaceSound() });
  const test: Partial<Record<Level, () => void>> = {
    effects: () => sample().match.play('explosion-small'),
    voice: () => sample().match.announce('node-captured'),
    interface: () => sample().menu.playSelect(),
  };
  return <div className="vi-audio-controls">
    {LEVELS.map((level) => <Fragment key={level}><div className="vi-setting-range">
      <span>
        <strong id={`audio-${level}`}>{t(LABEL[level])}</strong>
        <span className="vi-setting-range__tail">
          {test[level] && <button type="button" className="vi-audio-test" disabled={value.muted} onClick={test[level]}
            aria-label={`${t('testSound')}: ${t(LABEL[level])}`}>▶ {t('testSound')}</button>}
          <output htmlFor={`audio-${level}-range`}>{value[level]}%</output>
        </span>
      </span>
      <input id={`audio-${level}-range`} type="range" min="0" max="100" step="1" value={value[level]} disabled={value.muted}
        aria-labelledby={`audio-${level}`}
        onChange={(event) => onChange({ ...value, [level]: Number(event.target.value) })} />
    </div>
    {level === 'music' && <label className="vi-setting-toggle vi-setting-toggle--compact">
      <span><strong>{t('muteMusic')}</strong></span>
      <input type="checkbox" checked={value.musicMuted} disabled={value.muted} onChange={(event) => onChange({ ...value, musicMuted: event.target.checked })} />
    </label>}
    </Fragment>)}
    <label className="vi-setting-toggle">
      <span><strong>{t('muteAll')}</strong><small>{t('audioPending')}</small></span>
      <input type="checkbox" checked={value.muted} onChange={(event) => onChange({ ...value, muted: event.target.checked })} />
    </label>
  </div>;
}
