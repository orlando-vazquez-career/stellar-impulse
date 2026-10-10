import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { itemById } from './catalog';
import { defaultCosmeticLoadout, equipAfterPurchase, loadCosmeticLoadout, previewLoadout, saveCosmeticLoadout } from './loadout';
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
    expect(defaultCosmeticLoadout.voice).toBe('voz-vela');
  });

  it('moves a saved commander voice to the onboard AI until the commander is recorded', () => {
    saveCosmeticLoadout({ ...defaultCosmeticLoadout, voice: 'voz-comandante' });
    expect(loadCosmeticLoadout().voice).toBe('voz-vela');
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

  it('previews a candidate in its slot without saving anything', () => {
    const setItem = vi.spyOn(localStorage, 'setItem');
    const equipped = { ...defaultCosmeticLoadout, hull: 'polar' };
    const preview = previewLoadout(equipped, itemById('aurora-andina'));
    expect(preview).toEqual({ ...equipped, hull: 'aurora-andina' });
    expect(equipped.hull).toBe('polar');
    expect(previewLoadout(equipped, null)).toBe(equipped);
    // A locked piece cannot even be tried on.
    expect(previewLoadout(equipped, itemById('obsidian'))).toBe(equipped);
    expect(setItem).not.toHaveBeenCalled();
    expect(loadCosmeticLoadout()).toEqual(defaultCosmeticLoadout);
  });

  it('equips a piece right after it is bought, in its own slot', () => {
    const equipped = { ...defaultCosmeticLoadout, hull: 'polar' };
    expect(equipAfterPurchase(equipped, itemById('voz-analista')!)).toEqual({ ...equipped, voice: 'voz-analista' });
    expect(equipAfterPurchase(equipped, itemById('musica-gravity-final-path')!)).toEqual({ ...equipped, music: 'musica-gravity-final-path' });
    expect(equipped.voice).toBe('voz-vela');
    // Only NFT pieces are bought; a free or locked piece changes nothing.
    expect(equipAfterPurchase(equipped, itemById('solar')!)).toBe(equipped);
    expect(equipAfterPurchase(equipped, itemById('obsidian')!)).toBe(equipped);
  });
});
