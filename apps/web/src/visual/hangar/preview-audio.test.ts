import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { itemById } from './catalog';
import { PREVIEW_FADE_MS, PREVIEW_MAX_MS, PreviewPlayer, previewClipFor, type PreviewManifest } from './preview-audio';

const manifest: PreviewManifest = {
  voice: { es: { start: ['voice/es/start-1.mp3', 'voice/es/start-2.mp3'] }, en: { start: 'voice/en/start-1.mp3' } },
  voicePacks: { 'voz-analista': { es: { start: ['voice/analista/es/start-1.mp3'] }, en: { start: ['voice/analista/en/start-1.mp3'] } } },
};

describe('preview clip', () => {
  it('plays the first start line of the voice pack, the onboard AI or the track itself', () => {
    expect(previewClipFor(itemById('voz-analista')!, 'es', manifest)).toBe('/audio/voice/analista/es/start-1.mp3');
    expect(previewClipFor(itemById('voz-analista')!, 'en', manifest)).toBe('/audio/voice/analista/en/start-1.mp3');
    expect(previewClipFor(itemById('voz-vela')!, 'es', manifest)).toBe('/audio/voice/es/start-1.mp3');
    expect(previewClipFor(itemById('voz-vela')!, 'en', manifest)).toBe('/audio/voice/en/start-1.mp3');
    expect(previewClipFor(itemById('musica-gravity-final-path')!, 'es', manifest)).toBe('/audio/music/Gravity_s_Final_Path.mp3');
  });

  it('has nothing to play for a hull, a locked voice or a missing manifest', () => {
    expect(previewClipFor(itemById('aurora-andina')!, 'es', manifest)).toBeNull();
    expect(previewClipFor(itemById('voz-comandante')!, 'es', manifest)).toBeNull();
    expect(previewClipFor(itemById('voz-analista')!, 'es', null)).toBeNull();
    expect(previewClipFor(itemById('voz-analista')!, 'es', { voicePacks: { 'voz-analista': {} } })).toBeNull();
  });
});

class FakeAudio {
  src = '';
  volume = 1;
  currentTime = 12;
  paused = true;
  plays = 0;
  private ended: (() => void)[] = [];
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener(type: string, listener: () => void) { if (type === 'ended') this.ended.push(listener); }
  end() { this.paused = true; this.ended.forEach((listener) => listener()); }
}

describe('preview player', () => {
  let elements: FakeAudio[];
  let ducks: boolean[];
  let player: PreviewPlayer;
  const levels = { voice: 0.5, music: 0.25 };

  beforeEach(() => {
    vi.useFakeTimers();
    elements = [];
    ducks = [];
    player = new PreviewPlayer({
      createAudio: () => { const audio = new FakeAudio(); elements.push(audio); return audio; },
      duck: (active) => ducks.push(active),
      volume: (channel) => levels[channel],
      subscribe: () => () => {},
    });
  });
  afterEach(() => vi.useRealTimers());

  it('plays one clip at the channel volume and lowers the music under it', () => {
    player.play('voz-analista', '/audio/a.mp3', 'voice');
    const [audio] = elements;
    expect(audio).toMatchObject({ src: '/audio/a.mp3', volume: 0.5, currentTime: 0, paused: false });
    expect(ducks).toEqual([true]);
    expect(player.current).toBe('voz-analista');
  });

  it('cuts the previous clip with the same single element', () => {
    player.play('voz-analista', '/audio/a.mp3', 'voice');
    player.play('musica-gravity-final-path', '/audio/b.mp3', 'music');
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ src: '/audio/b.mp3', volume: 0.25, plays: 2, paused: false });
    expect(player.current).toBe('musica-gravity-final-path');
    expect(ducks.at(-1)).toBe(true);
  });

  it('stops on request and brings the music back', () => {
    const heard: (string | null)[] = [];
    player.subscribe((key) => heard.push(key));
    player.play('voz-analista', '/audio/a.mp3', 'voice');
    player.stop();
    expect(elements[0]!.paused).toBe(true);
    expect(ducks).toEqual([true, false]);
    expect(player.current).toBeNull();
    expect(heard).toEqual(['voz-analista', null]);
    player.stop();
    expect(ducks).toEqual([true, false]);
  });

  it('fades out and stops after twenty seconds at most', () => {
    player.play('musica-gravity-final-path', '/audio/b.mp3', 'music');
    const [audio] = elements;
    vi.advanceTimersByTime(PREVIEW_MAX_MS - PREVIEW_FADE_MS);
    expect(audio!.volume).toBe(0.25);
    vi.advanceTimersByTime(PREVIEW_FADE_MS / 2);
    expect(audio!.volume).toBeGreaterThan(0);
    expect(audio!.volume).toBeLessThan(0.25);
    vi.advanceTimersByTime(PREVIEW_FADE_MS / 2);
    expect(audio!.paused).toBe(true);
    expect(player.current).toBeNull();
    expect(ducks).toEqual([true, false]);
  });

  it('stops when the clip ends on its own', () => {
    player.play('voz-analista', '/audio/a.mp3', 'voice');
    elements[0]!.end();
    expect(player.current).toBeNull();
    expect(ducks).toEqual([true, false]);
    // A later timer from the ended clip does nothing.
    vi.advanceTimersByTime(PREVIEW_MAX_MS);
    expect(ducks).toEqual([true, false]);
  });

  it('gives up quietly when the browser refuses to play', async () => {
    const refusing = new PreviewPlayer({
      createAudio: () => Object.assign(new FakeAudio(), { play: () => Promise.reject(new Error('NotAllowedError')) }),
      duck: (active) => ducks.push(active),
      volume: () => 1,
      subscribe: () => () => {},
    });
    refusing.play('voz-vela', '/audio/c.mp3', 'voice');
    await vi.runAllTimersAsync();
    expect(refusing.current).toBeNull();
    expect(ducks).toEqual([true, false]);
  });
});
