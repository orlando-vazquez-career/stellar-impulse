import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SFX_SLOTS, VOICE_SLOTS } from './audio';

describe('audio manifest', () => {
  it('lists exactly the sound and voice slots the match uses', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../public/audio/manifest.json', import.meta.url), 'utf8')) as {
      music: Record<string, unknown>; sfx: Record<string, unknown>; voice: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(manifest.music).sort()).toEqual(['match', 'menu']);
    expect(Object.keys(manifest.sfx).sort()).toEqual([...SFX_SLOTS].sort());
    for (const locale of ['es', 'en']) expect(Object.keys(manifest.voice[locale]!).sort()).toEqual([...VOICE_SLOTS].sort());
  });
});
