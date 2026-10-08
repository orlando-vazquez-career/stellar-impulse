import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { itemsForCategory } from './catalog';

describe('local audio cosmetics', () => {
  it('offers both unlocked announcer profiles with distinct speech settings', () => {
    const voices = itemsForCategory('voice');
    expect(voices.map((item) => item.id)).toEqual(['voz-comandante', 'voz-analista']);
    expect(voices.every((item) => item.unlocked && item.announcer)).toBe(true);
    expect(voices[0]!.announcer).not.toEqual(voices[1]!.announcer);
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
