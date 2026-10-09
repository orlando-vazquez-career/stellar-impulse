import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultCosmeticLoadout, loadCosmeticLoadout, saveCosmeticLoadout } from './loadout';
import { writeOwnedClasses } from './ownership';

describe('cosmetic loadout', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads the default cosmetic-only selection', () => {
    expect(loadCosmeticLoadout()).toEqual(defaultCosmeticLoadout);
  });

  it('persists unlocked selections', () => {
    saveCosmeticLoadout({ ...defaultCosmeticLoadout, hull: 'polar', trail: 'solar', insignia: 'orbit' });
    expect(loadCosmeticLoadout()).toEqual({ ...defaultCosmeticLoadout, hull: 'polar', trail: 'solar', insignia: 'orbit' });
  });

  it('keeps NFT pieces only while the cached wallet holds them', () => {
    const nft = { ...defaultCosmeticLoadout, hull: 'aurora-andina', voice: 'voz-analista', music: 'musica-gravity-final-path', insignia: 'primera-victoria' };
    saveCosmeticLoadout(nft);
    expect(loadCosmeticLoadout()).toEqual(defaultCosmeticLoadout);
    writeOwnedClasses('GWALLET', [1, 3, 5, 6]);
    expect(loadCosmeticLoadout()).toEqual(nft);
    writeOwnedClasses('GWALLET', [1]);
    expect(loadCosmeticLoadout()).toEqual({ ...defaultCosmeticLoadout, hull: 'aurora-andina' });
    expect(loadCosmeticLoadout(new Set([3]))).toEqual({ ...defaultCosmeticLoadout, insignia: 'primera-victoria' });
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
