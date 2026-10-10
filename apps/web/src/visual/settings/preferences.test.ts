import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultVisualPreferences, freshDefaultVisualPreferences, hasUnsavedChanges, loadVisualPreferences, saveVisualPreferences, type VisualPreferences } from './preferences';

const clone = (preferences: VisualPreferences): VisualPreferences => JSON.parse(JSON.stringify(preferences)) as VisualPreferences;

describe('unsaved settings', () => {
  const saved = freshDefaultVisualPreferences();

  it('sees no change in an untouched copy', () => {
    expect(hasUnsavedChanges(saved, clone(saved))).toBe(false);
  });

  it('notices a single change in audio, accessibility or controls', () => {
    expect(hasUnsavedChanges(saved, { ...clone(saved), audio: { ...saved.audio, music: 12 } })).toBe(true);
    expect(hasUnsavedChanges(saved, { ...clone(saved), audio: { ...saved.audio, musicMuted: true } })).toBe(true);
    expect(hasUnsavedChanges(saved, { ...clone(saved), accessibility: { ...saved.accessibility, highContrast: true } })).toBe(true);
    expect(hasUnsavedChanges(saved, { ...clone(saved), controls: { ...saved.controls, move: ['KeyZ'] } })).toBe(true);
  });

  it('forgets a toggle switched on and off again', () => {
    const draft = clone(saved);
    draft.accessibility.largeText = true;
    draft.accessibility.largeText = false;
    expect(hasUnsavedChanges(saved, draft)).toBe(false);
  });

  it('sees nothing to save when Restore lands on what is already saved', () => {
    expect(hasUnsavedChanges(freshDefaultVisualPreferences(), freshDefaultVisualPreferences())).toBe(false);
  });

  it('treats reordered bindings as a change, because the first one is the key shown in the HUD', () => {
    expect(hasUnsavedChanges(saved, { ...clone(saved), controls: { ...saved.controls, panUp: ['ArrowUp', 'KeyW'] } })).toBe(true);
  });
});

describe('accessibility defaults', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follows the system reduced-motion setting until the player saves one', () => {
    vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }) });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} });
    expect(loadVisualPreferences().accessibility.reducedMotion).toBe(true);
    expect(freshDefaultVisualPreferences().accessibility.reducedMotion).toBe(true);
  });

  it('does not break where matchMedia is missing', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} });
    expect(loadVisualPreferences().accessibility.reducedMotion).toBe(false);
  });
});

describe('visual preferences', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      clear: () => values.clear(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads independent defaults when storage is empty', () => {
    const preferences = loadVisualPreferences();
    preferences.audio.master = 10;
    expect(defaultVisualPreferences.audio.master).toBe(80);
  });

  it('persists and restores visual preferences', () => {
    const preferences = loadVisualPreferences();
    preferences.accessibility.highContrast = true;
    preferences.controls.cancel = ['KeyF'];
    preferences.controls.move = ['Ctrl+KeyZ'];
    saveVisualPreferences(preferences);
    expect(loadVisualPreferences().accessibility.highContrast).toBe(true);
    expect(loadVisualPreferences().controls.cancel).toEqual(['KeyF']);
    expect(loadVisualPreferences().controls.move).toEqual(['Ctrl+KeyZ']);
  });

  it('falls back safely when storage is malformed', () => {
    localStorage.setItem('impulso.visual-preferences', '{not-json');
    expect(loadVisualPreferences()).toEqual(defaultVisualPreferences);
  });
  it('migrates legacy action keys and the camera key into rebindable controls', () => {
    localStorage.setItem('impulso.visual-preferences', JSON.stringify({ controls: {
      move: 'M', attack: 'G', hold: 'H', capture: 'C', cancel: 'Esc', camera: 'Space',
    } }));
    const controls = loadVisualPreferences().controls;
    expect(controls.move).toEqual(['KeyM']);
    expect(controls.attack).toEqual(['KeyG']);
    expect(controls.hold).toEqual(['KeyH']);
    expect(controls.capture).toEqual(['KeyC']);
    expect(controls.cancel).toEqual(['Escape']);
    expect(controls.cameraFocus).toEqual(['Space']);
  });
  it('loads arbitrary key codes and modifier chords without losing camera or production controls', () => {
    localStorage.setItem('impulso.visual-preferences', JSON.stringify({ controls: {
      move: ['Ctrl+KeyZ'], attack: ['Alt+ArrowDown'],
    } }));
    const controls = loadVisualPreferences().controls;
    expect(controls.move).toEqual(['Ctrl+KeyZ']);
    expect(controls.attack).toEqual(['Alt+ArrowDown']);
    expect(controls.produceInterceptor).toEqual(['KeyQ']);
    expect(controls.panUp).toContain('ArrowUp');
  });
  it('validates stored accessibility field by field', () => {
    localStorage.setItem('impulso.visual-preferences', JSON.stringify({ accessibility: {
      highContrast: true, reducedMotion: 'yes', largeText: 1, colorProfile: 'sepia',
    } }));
    expect(loadVisualPreferences().accessibility).toEqual({
      ...defaultVisualPreferences.accessibility, highContrast: true,
    });
  });
  it('keeps a known colour profile', () => {
    localStorage.setItem('impulso.visual-preferences', JSON.stringify({ accessibility: { colorProfile: 'tritanopia' } }));
    expect(loadVisualPreferences().accessibility.colorProfile).toBe('tritanopia');
  });
  it('adds the voice and menu channels to older saved settings and keeps volumes in range', () => {
    localStorage.setItem('impulso.visual-preferences', JSON.stringify({ audio: { master: 140, music: -5, effects: 'loud', muted: true } }));
    expect(loadVisualPreferences().audio).toEqual({
      master: 100, music: 0, effects: defaultVisualPreferences.audio.effects,
      voice: defaultVisualPreferences.audio.voice, interface: defaultVisualPreferences.audio.interface, muted: true, musicMuted: false,
    });
  });
});
