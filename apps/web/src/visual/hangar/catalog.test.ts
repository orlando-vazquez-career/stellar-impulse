import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hullFilter, itemById, itemForClass, itemsForCategory } from './catalog';

describe('local audio cosmetics', () => {
  it('offers the onboard AI as the free voice, the analyst as a collection piece and the commander as coming soon', () => {
    const voices = itemsForCategory('voice');
    expect(voices.map((item) => item.id)).toEqual(['voz-vela', 'voz-comandante', 'voz-analista']);
    expect(voices.map((item) => [item.unlocked, item.chain?.classId ?? null])).toEqual([[true, null], [false, null], [true, 5]]);
    // Speech settings only shape the browser fallback, but each pack keeps its own.
    expect(new Set(voices.map((item) => JSON.stringify(item.announcer))).size).toBe(3);
  });

  it('offers both unlocked music tracks backed by existing local files', () => {
    const tracks = itemsForCategory('music');
    expect(tracks.map((item) => item.id)).toEqual(['musica-iron-vanguard', 'musica-gravity-final-path']);
    for (const item of tracks) {
      expect(item.unlocked).toBe(true);
      expect(item.musicFile).toMatch(/^\/audio\/music\/[^/]+\.mp3$/);
      expect(existsSync(new URL(`../../../public${item.musicFile}`, import.meta.url))).toBe(true);
    }
  });
});

describe('hull try-on', () => {
  it('gives every available hull a real CSS filter, so the preview never drops its glow', () => {
    for (const item of itemsForCategory('hull').filter((hull) => hull.unlocked)) {
      expect(item.preview?.filter, item.id).toBeTruthy();
      expect(item.preview?.filter?.trim(), item.id).not.toBe('none');
    }
    expect(itemsForCategory('hull').find((item) => item.id === 'aurora-andina')?.preview?.filter)
      .toBe('hue-rotate(-45deg) saturate(1.2)');
  });

  it('falls back to a neutral filter, never to none', () => {
    expect(hullFilter(itemById('aurora-andina'))).toBe('hue-rotate(-45deg) saturate(1.2)');
    expect(hullFilter(itemById('ion'))).toBe('saturate(1)');
    expect(hullFilter(undefined)).toBe('saturate(1)');
  });
});

describe('merit emblems', () => {
  it('say they are earned in the 1v1 multiplayer campaign', () => {
    for (const classId of [3, 4]) {
      const item = itemForClass(classId)!;
      expect(item.chain?.family).toBe('merit');
      expect(item.description.es).toMatch(/campaña multijugador 1v1/);
      expect(item.description.en).toMatch(/1v1 multiplayer campaign/);
    }
  });
});
