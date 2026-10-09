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
  it('adds the voice and menu channels to older saved settings and keeps volumes in range', () => {
    localStorage.setItem('impulso.visual-preferences', JSON.stringify({ audio: { master: 140, music: -5, effects: 'loud', muted: true } }));
    expect(loadVisualPreferences().audio).toEqual({
      master: 100, music: 0, effects: defaultVisualPreferences.audio.effects,
      voice: defaultVisualPreferences.audio.voice, interface: defaultVisualPreferences.audio.interface, muted: true, musicMuted: false,
    });
  });
});
