import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchAudio, SFX_SLOTS, VOICE_SLOTS } from './audio';

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


import { getAudioMix, setAudioMix } from '../audio-mix';
import { defaultVisualPreferences } from '../settings/preferences';
import { defaultCosmeticLoadout, saveCosmeticLoadout } from '../hangar/loadout';
import { writeOwnedClasses } from '../hangar/ownership';

describe('live match audio', () => {
  const players: MatchAudio[] = [];
  afterEach(() => {
    players.splice(0).forEach((player) => player.dispose());
    setAudioMix({ ...defaultVisualPreferences.audio });
    vi.unstubAllGlobals();
  });
  const mix = (changes: Partial<typeof defaultVisualPreferences.audio> = {}) =>
    setAudioMix({ ...defaultVisualPreferences.audio, master: 100, voice: 100, effects: 100, ...changes });
  const player = () => {
    vi.stubGlobal('fetch', async () => ({ ok: false }));
    const audio = new MatchAudio('es'); players.push(audio); return audio;
  };

  it('changes the gain of recorded effects and voices that are already playing', () => {
    const gains: { gain: { value: number; setValueAtTime(value: number): void }; connect(): unknown; disconnect(): void }[] = [];
    vi.stubGlobal('AudioContext', class {
      currentTime = 0; state = 'running'; destination = {};
      createGain() {
        const node = { gain: { value: 1, setValueAtTime(value: number) { this.value = value; } }, connect() { return node; }, disconnect() {} };
        gains.push(node); return node;
      }
      createBufferSource() { return { connect: (target: unknown) => target, start() {}, stop() {} }; }
      close() { return Promise.resolve(); }
    });
    mix(); const audio = player();
    const recorded = audio as unknown as { sfx: Map<string, AudioBuffer>; voice: Map<string, AudioBuffer> };
    recorded.sfx.set('launch', {} as AudioBuffer); recorded.voice.set('start', {} as AudioBuffer);
    audio.play('launch'); audio.announce('start');
    const effects = gains[1]!, voice = gains[3]!;
    expect([effects.gain.value, voice.gain.value]).toEqual([1, 1]);
    setAudioMix({ ...getAudioMix(), effects: 20, voice: 40 });
    expect([effects.gain.value, voice.gain.value]).toEqual([0.2, 0.4]);
    setAudioMix({ ...getAudioMix(), muted: true });
    expect([effects.gain.value, voice.gain.value]).toEqual([0, 0]);
  });

  it('mutes active browser speech without allowing a sample player to cancel the match voice', () => {
    const speak = vi.fn(), cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    mix(); const audio = player(); audio.announce('start');
    const sample = player(); sample.dispose();
    expect(cancel).not.toHaveBeenCalled();
    setAudioMix({ ...getAudioMix(), voice: 20 });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[1]![0].volume).toBeCloseTo(0.24);
    setAudioMix({ ...getAudioMix(), muted: true });
    expect(cancel).toHaveBeenCalledTimes(2);
    audio.announce('node-captured');
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['voz-comandante', 1.08, 0.85],
    ['voz-analista', 0.95, 1.15],
  ])('uses the equipped %s profile for announcements in both languages', (voice, rate, pitch) => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    // The premium voice and track are NFT pieces: this wallet holds both.
    writeOwnedClasses('GTESTWALLET', [5, 6]);
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    saveCosmeticLoadout({ ...defaultCosmeticLoadout, voice: String(voice) });
    mix();
    const spanish = player(); spanish.announce('start');
    const english = new MatchAudio('en'); players.push(english); english.announce('victory');
    expect(speak.mock.calls[0]![0]).toMatchObject({ rate, pitch, lang: 'es-ES' });
    expect(speak.mock.calls[1]![0]).toMatchObject({ rate, pitch, lang: 'en-US', text: 'Victory' });
    setAudioMix({ ...getAudioMix(), voice: 20 });
    expect(speak.mock.calls[2]![0]).toMatchObject({ rate, pitch });
    expect(speak.mock.calls[2]![0].volume).toBeCloseTo(0.24);
    setAudioMix({ ...getAudioMix(), muted: true });
    english.announce('start');
    expect(speak).toHaveBeenCalledTimes(3);
  });
});
