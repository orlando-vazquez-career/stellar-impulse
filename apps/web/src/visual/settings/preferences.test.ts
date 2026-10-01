import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultVisualPreferences, loadVisualPreferences, saveVisualPreferences } from './preferences';

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
    preferences.controls.move = 'Q';
    saveVisualPreferences(preferences);
    expect(loadVisualPreferences().accessibility.highContrast).toBe(true);
    expect(loadVisualPreferences().controls.move).toBe('Q');
  });

  it('falls back safely when storage is malformed', () => {
    localStorage.setItem('impulso.visual-preferences', '{not-json');
    expect(loadVisualPreferences()).toEqual(defaultVisualPreferences);
  });
  it('migrates a saved attack shortcut that conflicts with WASD camera controls', () => {
    localStorage.setItem('impulso.visual-preferences', JSON.stringify({ controls: { attack: 'A' } }));
    expect(loadVisualPreferences().controls.attack).toBe('Q');
  });
});
