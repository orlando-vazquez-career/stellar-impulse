import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { itemsForCategory } from './catalog';

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
