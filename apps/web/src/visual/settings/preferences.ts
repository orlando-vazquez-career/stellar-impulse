import { freshKeybindings, readKeybindings, type Keybindings } from './keybindings';

export type ColorProfile = 'default' | 'deuteranopia' | 'tritanopia';

export interface VisualPreferences {
  audio: {
    master: number;
    effects: number;
    music: number;
    /** Announcer lines during a match. */
    voice: number;
    /** Menu clicks and hovers. */
    interface: number;
    muted: boolean;
  };
  /** Every match shortcut; see keybindings.ts. */
  keybindings: Keybindings;
  accessibility: {
    highContrast: boolean;
    reducedMotion: boolean;
    largeText: boolean;
    colorProfile: ColorProfile;
  };
}

export const defaultVisualPreferences: VisualPreferences = {
  audio: { master: 80, effects: 85, music: 60, voice: 90, interface: 60, muted: false },
  keybindings: freshKeybindings(),
  accessibility: { highContrast: false, reducedMotion: false, largeText: false, colorProfile: 'default' },
};

const storageKey = 'impulso.visual-preferences';

function cloneDefaults(): VisualPreferences {
  return {
    audio: { ...defaultVisualPreferences.audio },
    keybindings: freshKeybindings(),
    accessibility: { ...defaultVisualPreferences.accessibility },
  };
}

/** Stored volumes are whole percentages; anything else falls back to the default for that channel. */
function readAudio(stored: unknown): VisualPreferences['audio'] {
  const audio = { ...defaultVisualPreferences.audio };
  if (!stored || typeof stored !== 'object') return audio;
  const fields = stored as Record<string, unknown>;
  for (const channel of ['master', 'effects', 'music', 'voice', 'interface'] as const) {
    const value = fields[channel];
    if (typeof value === 'number' && Number.isFinite(value)) audio[channel] = Math.min(100, Math.max(0, Math.round(value)));
  }
  if (typeof fields.muted === 'boolean') audio.muted = fields.muted;
  return audio;
}

export function loadVisualPreferences(): VisualPreferences {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return cloneDefaults();
    const parsed = JSON.parse(stored) as Partial<VisualPreferences>;
    return {
      audio: readAudio(parsed.audio),
      // The old `controls` field (move, attack and capture modes) is dropped: those actions no longer exist.
      keybindings: readKeybindings(parsed.keybindings),
      accessibility: { ...defaultVisualPreferences.accessibility, ...parsed.accessibility },
    };
  } catch {
    return cloneDefaults();
  }
}

export function saveVisualPreferences(preferences: VisualPreferences) {
  localStorage.setItem(storageKey, JSON.stringify(preferences));
}

export function freshDefaultVisualPreferences() {
  return cloneDefaults();
}
