import { afterEach, describe, expect, it, vi } from 'vitest';
import { channelVolume, getAudioMix, musicAudible, setAudioMix, subscribeAudioMix, toggleMusic } from './audio-mix';
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

  it('hears music only when nothing silences it', () => {
    expect(musicAudible(mix())).toBe(true);
    expect(musicAudible(mix({ muted: true }))).toBe(false);
    expect(musicAudible(mix({ musicMuted: true }))).toBe(false);
    expect(musicAudible(mix({ master: 0 }))).toBe(false);
    expect(musicAudible(mix({ music: 0 }))).toBe(false);
  });

  it('toggles only the music mute', () => {
    const muted = toggleMusic(mix({ music: 35 }));
    expect(muted).toEqual(mix({ music: 35, musicMuted: true }));
    expect(toggleMusic(muted)).toEqual(mix({ music: 35 }));
    expect(toggleMusic(mix({ muted: true, master: 40 }))).toEqual(mix({ muted: true, master: 40, musicMuted: true }));
  });

  it('brings a music level of zero back to 60 when music is switched on again', () => {
    expect(toggleMusic(mix({ music: 0, musicMuted: true }))).toEqual(mix({ music: 60, musicMuted: false }));
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

class GainStub {
  readonly gain = {
    value: 1,
    setValueAtTime: (value: number) => { this.gain.value = value; },
    linearRampToValueAtTime: (value: number) => { this.gain.value = value; },
    setTargetAtTime: (value: number) => { this.gain.value = value; },
    cancelScheduledValues() {},
  };
  connect() {}
  disconnect() {}
}

/** A Web Audio stand-in whose gains jump straight to their target, so a test can read the level. */
function stubMusicAudio() {
  const gains: GainStub[] = [];
  const sources: unknown[] = [];
  vi.stubGlobal('AudioContext', class {
    currentTime = 0; state = 'running'; destination = {}; sampleRate = 8000;
    createGain() { const gain = new GainStub(); gains.push(gain); return gain; }
    createBufferSource() { const source = { connect() {}, start() {}, stop() {}, disconnect() {} }; sources.push(source); return source; }
    decodeAudioData() { return Promise.resolve({}); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  });
  vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({}) }));
  vi.stubGlobal('window', { location: { href: 'http://localhost/' } });
  return { gains, sources };
}

describe('music player', () => {
  afterEach(() => { setAudioMix(mix()); vi.unstubAllGlobals(); });

  it('drops the music to silence while musicMuted and brings it back after', () => {
    const { gains } = stubMusicAudio();
    setAudioMix(mix());
    const player = new MusicPlayer(mix(), 'http://localhost/audio/manifest.json');
    player.play('menu');
    const master = gains[0]!;
    expect(master.gain.value).toBeCloseTo(0.8 * 0.6);
    setAudioMix(mix({ musicMuted: true }));
    expect(master.gain.value).toBe(0);
    setAudioMix(mix());
    expect(master.gain.value).toBeCloseTo(0.8 * 0.6);
    player.dispose();
  });

  it('ducks under a voice and restores the level without restarting the track', () => {
    const { gains, sources } = stubMusicAudio();
    setAudioMix(mix());
    const player = new MusicPlayer(mix(), 'http://localhost/audio/manifest.json');
    player.play('menu');
    const master = gains[0]!;
    const level = master.gain.value;
    const created = { gains: gains.length, sources: sources.length };
    player.duck(true);
    expect(master.gain.value).toBeGreaterThan(0);
    expect(master.gain.value).toBeLessThan(level);
    // A change to the mix while ducked stays ducked.
    setAudioMix(mix({ music: 30 }));
    expect(master.gain.value).toBeLessThan(0.8 * 0.3);
    player.duck(false);
    expect(master.gain.value).toBeCloseTo(0.8 * 0.3);
    expect({ gains: gains.length, sources: sources.length }).toEqual(created);
    expect(player.isPlaying).toBe(true);
    player.dispose();
  });

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
