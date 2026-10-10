import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setAudioMix, type AudioMix } from '../audio-mix';
import { loadVisualPreferences, saveVisualPreferences, type VisualPreferences } from './preferences';

interface PreferencesValue {
  /** What is saved on this device. */
  preferences: VisualPreferences;
  /** Stores the preferences and makes them the app's current ones. */
  savePreferences(next: VisualPreferences): void;
  /** Plays a mix live without saving it; the saved mix comes back on the next save or preview. */
  previewAudio(mix: AudioMix): void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

/** One owner for the saved preferences, shared by the menus and the match. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadVisualPreferences);
  // Every sound source reads the live mix; the saved preferences are its resting value.
  useEffect(() => { setAudioMix(preferences.audio); }, [preferences.audio]);
  const savePreferences = useCallback((next: VisualPreferences) => {
    saveVisualPreferences(next);
    setPreferences(next);
  }, []);
  const previewAudio = useCallback((mix: AudioMix) => setAudioMix(mix), []);
  const value = useMemo(() => ({ preferences, savePreferences, previewAudio }), [preferences, savePreferences, previewAudio]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}
