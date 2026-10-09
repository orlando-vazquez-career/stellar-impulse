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
    preferences.keybindings.hold = 'KeyH';
    saveVisualPreferences(preferences);
    expect(loadVisualPreferences().accessibility.highContrast).toBe(true);
    expect(loadVisualPreferences().keybindings.hold).toBe('KeyH');
  });

  it('falls back safely when storage is malformed', () => {
    localStorage.setItem('impulso.visual-preferences', '{not-json');
    expect(loadVisualPreferences()).toEqual(defaultVisualPreferences);
  });
  it('drops the old move, attack and capture controls and starts from the new defaults', () => {
    localStorage.setItem('impulso.visual-preferences', JSON.stringify({ controls: { move: 'M', attack: 'Q', hold: 'H', cancel: 'Esc' } }));
    const preferences = loadVisualPreferences();
    expect(preferences).not.toHaveProperty('controls');
    expect(preferences.keybindings.hold).toBe('KeyZ');
    expect(preferences.keybindings.stop).toBe('Escape');
  });
  it('adds the voice and menu channels to older saved settings and keeps volumes in range', () => {
    localStorage.setItem('impulso.visual-preferences', JSON.stringify({ audio: { master: 140, music: -5, effects: 'loud', muted: true } }));
    expect(loadVisualPreferences().audio).toEqual({
      master: 100, music: 0, effects: defaultVisualPreferences.audio.effects,
      voice: defaultVisualPreferences.audio.voice, interface: defaultVisualPreferences.audio.interface, muted: true,
    });
  });
});
