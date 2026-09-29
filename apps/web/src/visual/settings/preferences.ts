export type ColorProfile = 'default' | 'deuteranopia' | 'tritanopia';
export type ControlAction = 'move' | 'attack' | 'hold' | 'capture' | 'cancel' | 'camera';

export interface VisualPreferences {
  audio: {
    master: number;
    effects: number;
    music: number;
    muted: boolean;
  };
  controls: Record<ControlAction, string>;
  accessibility: {
    highContrast: boolean;
    reducedMotion: boolean;
    largeText: boolean;
    colorProfile: ColorProfile;
  };
}

export const defaultVisualPreferences: VisualPreferences = {
  audio: { master: 80, effects: 85, music: 55, muted: false },
  controls: { move: 'M', attack: 'A', hold: 'H', capture: 'C', cancel: 'Esc', camera: 'Space' },
  accessibility: { highContrast: false, reducedMotion: false, largeText: false, colorProfile: 'default' },
};

const storageKey = 'impulso.visual-preferences';

function cloneDefaults(): VisualPreferences {
  return {
    audio: { ...defaultVisualPreferences.audio },
    controls: { ...defaultVisualPreferences.controls },
    accessibility: { ...defaultVisualPreferences.accessibility },
  };
}

export function loadVisualPreferences(): VisualPreferences {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return cloneDefaults();
    const parsed = JSON.parse(stored) as Partial<VisualPreferences>;
    return {
      audio: { ...defaultVisualPreferences.audio, ...parsed.audio },
      controls: { ...defaultVisualPreferences.controls, ...parsed.controls },
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
