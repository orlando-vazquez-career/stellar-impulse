import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicPlayer } from './music';
import { defaultCosmeticLoadout, saveCosmeticLoadout } from './hangar/loadout';
import { writeOwnedClasses } from './hangar/ownership';

const iron = '/audio/music/Iron_Vanguard.mp3';
const gravity = '/audio/music/Gravity_s_Final_Path.mp3';
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe('equipped match music', () => {
  const players: MusicPlayer[] = [];
  const sources: { buffer?: { path: string }; start: ReturnType<typeof vi.fn> }[] = [];
  const decode = vi.fn(async (data: { path: string }) => data);
  const response = (path: string) => ({ ok: true, arrayBuffer: async () => ({ path }) });
  const fetchAudio = vi.fn(async (url: string | URL) => String(url).endsWith('manifest.json')
    ? { ok: true, json: async () => ({ music: { menu: 'music/menu.mp3', match: 'music/default.mp3' } }) }
    : response(String(url)));
  const player = () => { const music = new MusicPlayer(); players.push(music); return music; };

  beforeEach(() => {
    vi.useFakeTimers(); sources.length = 0; decode.mockReset().mockImplementation(async (data: { path: string }) => data); fetchAudio.mockClear();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    // The premium voice and track are NFT pieces: this wallet holds both.
    writeOwnedClasses('GTESTWALLET', [5, 6]);
    vi.stubGlobal('window', { location: { href: 'http://localhost/' } });
    vi.stubGlobal('fetch', fetchAudio);
    vi.stubGlobal('AudioContext', class {
      currentTime = 0; state = 'running'; destination = {};
      createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }; }
      createBufferSource() {
        const source = { buffer: undefined, loop: false, start: vi.fn(), stop() {}, connect() {}, disconnect() {} };
        sources.push(source); return source;
      }
      decodeAudioData = decode;
      close() { return Promise.resolve(); }
    });
  });
  afterEach(() => {
    players.splice(0).forEach((music) => music.dispose());
    vi.useRealTimers(); vi.unstubAllGlobals();
  });

  it.each([
    ['musica-iron-vanguard', iron],
    ['musica-gravity-final-path', gravity],
  ])('plays %s in the match while keeping the manifest menu track', async (music, path) => {
    saveCosmeticLoadout({ ...defaultCosmeticLoadout, music });
    const audio = player(); await settle();
    audio.play('menu');
    expect(sources.at(-1)?.buffer?.path).toBe('http://localhost/audio/music/menu.mp3');
    audio.play('match');
    expect(sources.at(-1)?.buffer?.path).toBe(path);
    expect(sources.at(-1)?.start).toHaveBeenCalledOnce();
    expect(fetchAudio.mock.calls.map(([url]) => String(url))).not.toContain('http://localhost/audio/music/default.mp3');
  });

  it('rereads the hangar selection on the next match without recreating the player', async () => {
    const audio = player(); await settle(); audio.play('match');
    expect(sources.at(-1)?.buffer?.path).toBe(iron);
    audio.play('menu');
    saveCosmeticLoadout({ ...defaultCosmeticLoadout, music: 'musica-gravity-final-path' });
    audio.play('match'); await settle();
    expect(sources.at(-1)?.buffer?.path).toBe(gravity);
  });

  it('does not let a late download replace a newer equipped track', async () => {
    let release!: (value: ReturnType<typeof response>) => void;
    const pending = new Promise<ReturnType<typeof response>>((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', (url: string | URL) => String(url) === iron ? pending : fetchAudio(url));
    const audio = player(); await settle();
    saveCosmeticLoadout({ ...defaultCosmeticLoadout, music: 'musica-gravity-final-path' });
    audio.play('match'); await settle();
    expect(sources.at(-1)?.buffer?.path).toBe(gravity);
    const count = sources.length;
    release(response(iron)); await settle();
    expect(sources).toHaveLength(count);
    expect(sources.at(-1)?.buffer?.path).toBe(gravity);
  });

  it('loads the equipped recording even when the manifest fails', async () => {
    vi.stubGlobal('fetch', (url: string | URL) => String(url).endsWith('manifest.json') ? Promise.reject(new Error('offline manifest')) : fetchAudio(url));
    const audio = player(); await settle(); audio.play('match');
    expect(sources.at(-1)?.buffer?.path).toBe(iron);
  });

  it.each(['missing', 'undecodable'])('keeps the generative fallback when the equipped file is %s', async (failure) => {
    if (failure === 'missing') vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({}) }));
    else decode.mockRejectedValue(new Error('decode failed'));
    const audio = player(); await settle(); audio.play('match'); await settle();
    expect(sources).toHaveLength(0);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('never restarts music if decoding completes after disposal', async () => {
    let release!: (value: { path: string }) => void;
    decode.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const audio = player(); audio.play('match'); await settle();
    audio.dispose(); release({ path: iron }); await settle();
    expect(sources).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
