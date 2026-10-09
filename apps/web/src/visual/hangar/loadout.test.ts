import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultCosmeticLoadout, loadCosmeticLoadout, saveCosmeticLoadout } from './loadout';

describe('cosmetic loadout', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads the default cosmetic-only selection', () => {
    expect(loadCosmeticLoadout()).toEqual(defaultCosmeticLoadout);
  });

  it('persists unlocked selections', () => {
    saveCosmeticLoadout({ ...defaultCosmeticLoadout, hull: 'polar', trail: 'solar', insignia: 'orbit', voice: 'voz-analista', music: 'musica-gravity-final-path' });
    expect(loadCosmeticLoadout()).toEqual({ ...defaultCosmeticLoadout, hull: 'polar', trail: 'solar', insignia: 'orbit', voice: 'voz-analista', music: 'musica-gravity-final-path' });
  });

  it('migrates older loadouts without losing the visual selection', () => {
    localStorage.setItem('impulso.cosmetic-loadout', JSON.stringify({ hull: 'polar', trail: 'solar', insignia: 'orbit' }));
    expect(loadCosmeticLoadout()).toEqual({ ...defaultCosmeticLoadout, hull: 'polar', trail: 'solar', insignia: 'orbit' });
  });

  it('rejects wrong-category and external audio values', () => {
    localStorage.setItem('impulso.cosmetic-loadout', JSON.stringify({ voice: 'musica-iron-vanguard', music: 'https://example.com/music.mp3' }));
    expect(loadCosmeticLoadout()).toEqual(defaultCosmeticLoadout);
  });

  it('rejects locked or unknown stored items', () => {
    localStorage.setItem('impulso.cosmetic-loadout', JSON.stringify({ hull: 'obsidian', trail: 'missing', insignia: 'vector' }));
    expect(loadCosmeticLoadout()).toEqual(defaultCosmeticLoadout);
  });
});
