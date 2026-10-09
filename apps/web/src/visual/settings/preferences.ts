export type ColorProfile = 'default' | 'deuteranopia' | 'tritanopia';
import { DEFAULT_CONTROL_BINDINGS, readControlBindings, type ControlBindings } from './control-bindings';
export type { ControlAction } from './control-bindings';

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
    musicMuted: boolean;
  };
  controls: ControlBindings;
  accessibility: {
    highContrast: boolean;
    reducedMotion: boolean;
    largeText: boolean;
    colorProfile: ColorProfile;
  };
}

export const defaultVisualPreferences: VisualPreferences = {
  audio: { master: 80, effects: 85, music: 60, voice: 90, interface: 60, muted: false, musicMuted: false },
  controls: DEFAULT_CONTROL_BINDINGS,
  accessibility: { highContrast: false, reducedMotion: false, largeText: false, colorProfile: 'default' },
};

const storageKey = 'impulso.visual-preferences';

function cloneDefaults(): VisualPreferences {
  return {
    audio: { ...defaultVisualPreferences.audio },
    controls: Object.fromEntries(Object.entries(defaultVisualPreferences.controls).map(([action, bindings]) => [action, [...bindings]])) as ControlBindings,
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
  if (typeof fields.musicMuted === 'boolean') audio.musicMuted = fields.musicMuted;
  return audio;
}

function readControls(stored: unknown): VisualPreferences['controls'] {
  return readControlBindings(stored);
}

export function loadVisualPreferences(): VisualPreferences {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return cloneDefaults();
    const parsed = JSON.parse(stored) as Partial<VisualPreferences>;
    return {
      audio: readAudio(parsed.audio),
      controls: readControls(parsed.controls),
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
