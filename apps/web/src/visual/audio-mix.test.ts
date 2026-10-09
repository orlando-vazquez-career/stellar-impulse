import { afterEach, describe, expect, it, vi } from 'vitest';
import { channelVolume, getAudioMix, setAudioMix, subscribeAudioMix } from './audio-mix';
import { MusicPlayer } from './music';
import { defaultVisualPreferences } from './settings/preferences';

const mix = (changes: Partial<typeof defaultVisualPreferences.audio> = {}) => ({ ...defaultVisualPreferences.audio, ...changes });

describe('audio mix', () => {
  it('multiplies the master level by each channel and silences everything when muted', () => {
    expect(channelVolume(mix({ master: 50, music: 50 }), 'music')).toBeCloseTo(0.25);
    expect(channelVolume(mix({ master: 100, voice: 30 }), 'voice')).toBeCloseTo(0.3);
    expect(channelVolume(mix({ muted: true }), 'effects')).toBe(0);
    expect(channelVolume(mix({ master: 100, effects: 50, musicMuted: true }), 'music')).toBe(0);
    expect(channelVolume(mix({ master: 100, effects: 50, musicMuted: true }), 'effects')).toBe(0.5);
    expect(channelVolume(mix({ master: 0 }), 'interface')).toBe(0);
  });

  it('tells every listener about a live change', () => {
    const heard: number[] = [];
    const stop = subscribeAudioMix((next) => heard.push(next.music));
    setAudioMix(mix({ music: 12 }));
    stop();
    setAudioMix(mix({ music: 40 }));
    expect(heard).toEqual([12]);
    expect(getAudioMix().music).toBe(40);
  });
});

describe('music player', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('never starts sound after it was disposed, even when the recorded tracks load late', async () => {
    const contexts: unknown[] = [];
    vi.stubGlobal('AudioContext', class {
      currentTime = 0; state = 'running'; destination = {};
      constructor() { contexts.push(this); }
      createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }; }
      createBufferSource() { return { connect() {}, start() {}, stop() {}, disconnect() {} }; }
      decodeAudioData() { return Promise.resolve({}); }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    });
    let release!: () => void;
    const manifestLoaded = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', async (url: string | URL) => {
      if (String(url).endsWith('manifest.json')) {
        await manifestLoaded;
        return { ok: true, json: async () => ({ music: { menu: 'music/menu.mp3', match: 'music/match.mp3' } }) };
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    vi.stubGlobal('window', { location: { href: 'http://localhost/' } });

    // React StrictMode mounts, disposes and mounts again: the first player must stay silent.
    const first = new MusicPlayer(mix(), 'http://localhost/audio/manifest.json');
    first.play('menu');
    first.dispose();
    const created = contexts.length;
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(contexts.length).toBe(created);
    first.play('match');
    expect(contexts.length).toBe(created);
  });
});
