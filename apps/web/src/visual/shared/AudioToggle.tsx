import { musicAudible, toggleMusic, type AudioMix } from '../audio-mix';
import { useI18n } from '../i18n';

/**
 * Header switch for the music alone. It shows and changes the saved mix, so it agrees with the
 * settings panel; with everything muted there is nothing for it to switch.
 */
export function AudioToggle({ audio, onChange, disabled = false }: { audio: AudioMix; onChange(audio: AudioMix): void; disabled?: boolean }) {
  const { t } = useI18n();
  const label = t(audio.musicMuted ? 'musicToggleUnmute' : 'musicToggleMute');
  return (
    <button
      type="button"
      className={`vi-audio-toggle ${musicAudible(audio) ? '' : 'is-muted'}`}
      onClick={() => onChange(toggleMusic(audio))}
      disabled={disabled || audio.muted}
      aria-label={label}
      title={label}
    >
      <span className="vi-audio-toggle__icon" aria-hidden="true">{musicAudible(audio) ? '🔊' : '🔇'}</span>
      <span className="vi-audio-toggle__label">{t('musicToggleLabel')}</span>
    </button>
  );
}
