export type ColorProfile = 'default' | 'deuteranopia' | 'tritanopia';
import { CONTROL_ACTIONS, DEFAULT_CONTROL_BINDINGS, readControlBindings, type ControlBindings } from './control-bindings';
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
const COLOR_PROFILES: readonly ColorProfile[] = ['default', 'deuteranopia', 'tritanopia'];

/** The operating system's reduced-motion request; false where it cannot be read. */
function systemPrefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Accessibility before the player saves anything: motion follows the system setting. */
function defaultAccessibility(): VisualPreferences['accessibility'] {
  return { ...defaultVisualPreferences.accessibility, reducedMotion: systemPrefersReducedMotion() };
}

function cloneDefaults(): VisualPreferences {
  return {
    audio: { ...defaultVisualPreferences.audio },
    controls: Object.fromEntries(Object.entries(defaultVisualPreferences.controls).map(([action, bindings]) => [action, [...bindings]])) as ControlBindings,
    accessibility: defaultAccessibility(),
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

/** Each stored switch must be a boolean and the profile a known one; anything else keeps its default. */
function readAccessibility(stored: unknown): VisualPreferences['accessibility'] {
  const accessibility = defaultAccessibility();
  if (!stored || typeof stored !== 'object') return accessibility;
  const fields = stored as Record<string, unknown>;
  for (const flag of ['highContrast', 'reducedMotion', 'largeText'] as const) {
    const value = fields[flag];
    if (typeof value === 'boolean') accessibility[flag] = value;
  }
  if (COLOR_PROFILES.includes(fields.colorProfile as ColorProfile)) accessibility.colorProfile = fields.colorProfile as ColorProfile;
  return accessibility;
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
      accessibility: readAccessibility(parsed.accessibility),
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

function sameFields<T extends object>(saved: T, draft: T): boolean {
  const keys = new Set([...Object.keys(saved), ...Object.keys(draft)]) as Set<keyof T>;
  return [...keys].every((key) => Object.is(saved[key], draft[key]));
}

function sameBindings(saved: ControlBindings, draft: ControlBindings): boolean {
  const actions = new Set<string>([...CONTROL_ACTIONS, ...Object.keys(saved), ...Object.keys(draft)]);
  return [...actions].every((action) => {
    const before = saved[action as keyof ControlBindings] ?? [];
    const after = draft[action as keyof ControlBindings] ?? [];
    // In order: the HUD shows the first key of each action.
    return before.length === after.length && before.every((binding, index) => binding === after[index]);
  });
}

/** True when the draft differs from what is saved in audio, accessibility or controls. */
export function hasUnsavedChanges(saved: VisualPreferences, draft: VisualPreferences): boolean {
  return !sameFields(saved.audio, draft.audio)
    || !sameFields(saved.accessibility, draft.accessibility)
    || !sameBindings(saved.controls, draft.controls);
}
