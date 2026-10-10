import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchAudio, playEvent, SFX_SLOTS, VOICE_SLOTS } from './audio';
import type { GameplayEvent } from './model';

describe('audio manifest', () => {
  it('lists exactly the sound and voice slots the match uses', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../public/audio/manifest.json', import.meta.url), 'utf8')) as {
      music: Record<string, unknown>; sfx: Record<string, unknown>; voice: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(manifest.music).sort()).toEqual(['match', 'menu']);
    expect(Object.keys(manifest.sfx).sort()).toEqual([...SFX_SLOTS].sort());
    for (const locale of ['es', 'en']) expect(Object.keys(manifest.voice[locale]!).sort()).toEqual([...VOICE_SLOTS].sort());
  });

  it('points every filled slot and voice pack at files that exist', () => {
    const root = new URL('../../../public/audio/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as {
      sfx: Record<string, unknown>; voice: Record<string, Record<string, unknown>>;
      voicePacks?: Record<string, Record<string, Record<string, unknown>>>;
    };
    const packs = Object.values(manifest.voicePacks ?? {}).flatMap((pack) => Object.values(pack));
    for (const pack of Object.values(manifest.voicePacks ?? {})) {
      for (const lines of Object.values(pack)) for (const slot of Object.keys(lines)) expect(VOICE_SLOTS).toContain(slot);
    }
    const clips = [manifest.sfx, ...Object.values(manifest.voice), ...packs].flatMap((slots) => Object.values(slots))
      .flatMap((clip) => (clip === null ? [] : Array.isArray(clip) ? clip : [clip])) as string[];
    for (const clip of clips) expect(() => readFileSync(new URL(clip, root)), clip).not.toThrow();
  });
});

describe('recorded announcer', () => {
  const players: MatchAudio[] = [];
  let now = 0;
  type Source = { buffer: { url: string } | null; when: number; stopped: boolean; onended: (() => void) | null };
  let sources: Source[] = [];
  afterEach(() => {
    players.splice(0).forEach((player) => player.dispose());
    setAudioMix({ ...defaultVisualPreferences.audio });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  /** A Web Audio stand-in that remembers which file each source played, when, and whether it was cut. */
  function stage(manifest: object) {
    now = 0; sources = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('fetch', async (url: URL | string) => {
      const href = String(url);
      if (href.endsWith('manifest.json')) return { ok: true, json: async () => manifest };
      return { ok: true, arrayBuffer: async () => ({ url: href.replace(/^.*\/audio\//, '') }) };
    });
    vi.stubGlobal('AudioContext', class {
      currentTime = 10; state = 'running'; destination = {};
      createGain() {
        const node = { gain: { value: 1, setValueAtTime() {}, setTargetAtTime() {} }, connect: () => node, disconnect() {} };
        return node;
      }
      createBufferSource() {
        const source: Source & { connect(target: unknown): unknown; start(when?: number): void; stop(): void } = {
          buffer: null, when: -1, stopped: false, onended: null,
          connect: (target) => target,
          start(when = 0) { source.when = when; sources.push(source); },
          stop() { source.stopped = true; },
        };
        return source;
      }
      decodeAudioData(data: { url: string }) { return Promise.resolve(data); }
      close() { return Promise.resolve(); }
    });
    setAudioMix({ ...defaultVisualPreferences.audio, master: 100, voice: 100, effects: 100 });
  }
  const ready = async (locale: 'es' | 'en' = 'es') => {
    const audio = new MatchAudio(locale, '/audio/manifest.json'); players.push(audio);
    await audio.loaded;
    return audio;
  };
  const played = () => sources.map((source) => source.buffer?.url);

  it('plays the recording of the equipped voice pack and falls back to the default recording', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    writeOwnedClasses('GTESTWALLET', [5]);
    saveCosmeticLoadout({ ...defaultCosmeticLoadout, voice: 'voz-analista' });
    stage({ voice: { es: { start: 'voice/es/start.mp3', victory: 'voice/es/victory.mp3' } },
      voicePacks: { 'voz-analista': { es: { start: 'voice/analista/es/start.mp3' } } } });
    const audio = await ready();
    audio.announce('start');
    audio.announce('victory');
    expect(played()).toEqual(['voice/analista/es/start.mp3', 'voice/es/victory.mp3']);
  });

  it('never falls back to browser speech for a line whose recording is still loading', async () => {
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    stage({ voice: { es: { start: 'voice/es/start.mp3' } } });
    const audio = new MatchAudio('es', '/audio/manifest.json'); players.push(audio);
    audio.announce('start');
    await audio.loaded;
    expect(speak).not.toHaveBeenCalled();
    expect(played()).toEqual(['voice/es/start.mp3']);
  });

  it('keeps a line asked for during a slow load until the recordings are ready', async () => {
    stage({ voice: { es: { 'node-captured': 'voice/es/node-captured.mp3' } } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchFile = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: URL | string) => { await gate; return fetchFile(url); });
    const audio = new MatchAudio('es', '/audio/manifest.json'); players.push(audio);
    audio.announce('node-captured');
    now += 4000; release();
    await audio.loaded;
    expect(played()).toEqual(['voice/es/node-captured.mp3']);
  });

  it('starts a line after the requested delay so it follows its sound effect', async () => {
    stage({ voice: { es: { 'core-open': 'voice/es/core-open.mp3' } } });
    const audio = await ready();
    audio.announce('core-open', 0.5);
    expect(sources[0]!.when).toBeCloseTo(10.5);
  });

  it('lets an urgent line cut an informative one, and holds an informative line behind an urgent one', async () => {
    stage({ voice: { es: { 'node-captured': 'voice/es/node-captured.mp3', 'under-attack': 'voice/es/under-attack.mp3', 'ship-lost': 'voice/es/ship-lost.mp3' } } });
    const audio = await ready();
    audio.announce('node-captured');
    audio.announce('under-attack');
    expect(sources[0]!.stopped).toBe(true);
    audio.announce('ship-lost');
    expect(played()).toEqual(['voice/es/node-captured.mp3', 'voice/es/under-attack.mp3']);
    now += 900; sources[1]!.onended?.();
    expect(played()).toEqual(['voice/es/node-captured.mp3', 'voice/es/under-attack.mp3', 'voice/es/ship-lost.mp3']);
  });

  it('drops a held line that waited too long to be useful', async () => {
    stage({ voice: { es: { 'under-attack': 'voice/es/under-attack.mp3', 'ship-lost': 'voice/es/ship-lost.mp3' } } });
    const audio = await ready();
    audio.announce('under-attack');
    audio.announce('ship-lost');
    now += 6000; sources[0]!.onended?.();
    expect(played()).toEqual(['voice/es/under-attack.mp3']);
  });

  it('does not repeat a line inside its cooldown', async () => {
    stage({ voice: { es: { 'under-attack': 'voice/es/under-attack.mp3' } } });
    const audio = await ready();
    audio.announce('under-attack'); sources[0]!.onended?.();
    now += 5000; audio.announce('under-attack');
    now += 20_000; audio.announce('under-attack');
    expect(played()).toHaveLength(2);
  });

  it('rotates through the recorded takes of a line without repeating the last one', async () => {
    stage({ voice: { es: { 'ship-lost': ['voice/es/ship-lost-1.mp3', 'voice/es/ship-lost-2.mp3', 'voice/es/ship-lost-3.mp3'] } } });
    const audio = await ready();
    for (let index = 0; index < 8; index += 1) { audio.announce('ship-lost'); sources.at(-1)!.onended?.(); now += 10_000; }
    const takes = played();
    expect(new Set(takes).size).toBeGreaterThan(1);
    takes.slice(1).forEach((take, index) => expect(take).not.toBe(takes[index]));
  });

  it('closes the match on the result line and says nothing after it', async () => {
    stage({ voice: { es: { victory: 'voice/es/victory.mp3', 'ship-lost': 'voice/es/ship-lost.mp3' } } });
    const audio = await ready();
    audio.announce('victory');
    audio.announce('ship-lost');
    sources[0]!.onended?.();
    expect(played()).toEqual(['voice/es/victory.mp3']);
  });
});

describe('announcer across sectors', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); setAudioMix({ ...defaultVisualPreferences.audio }); });

  it('speaks again when the next sector starts after a sector result', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false }));
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    setAudioMix({ ...defaultVisualPreferences.audio, master: 100, voice: 100 });
    const audio = new MatchAudio('es');
    await audio.loaded;
    playEvent(audio, { kind: 'victory' }, 'es');
    playEvent(audio, { kind: 'match-start' }, 'es');
    playEvent(audio, { kind: 'battle-start' }, 'es');
    expect(speak.mock.calls.map((call) => call[0].text)).toEqual(['Victoria. Sector asegurado.', 'Enlace establecido. Captura Metal antes de que se abra el Núcleo.']);
    audio.dispose();
  });
});

describe('match events to sound', () => {
  const calls = () => {
    const log: string[] = [];
    const audio = { play: (slot: string) => log.push(`sfx:${slot}`), announce: (slot: string) => log.push(`voice:${slot}`), reopen: () => {} };
    return { log, audio: audio as unknown as MatchAudio };
  };

  it('leaves the opening view silent and opens the battle with the horn and the briefing', () => {
    const { log, audio } = calls();
    expect(playEvent(audio, { kind: 'match-start' }, 'es')).toBeNull();
    expect(playEvent(audio, { kind: 'battle-start' }, 'es')).toEqual({ text: 'Captura Metal antes de que se abra el Núcleo', tone: 'info' });
    expect(log).toEqual(['sfx:horn', 'voice:start']);
  });

  it.each([
    ['insufficient_metal', 'voice:insufficient-metal'],
    ['fleet_full', 'voice:fleet-full'],
    ['cannot_attack', 'voice:order-denied'],
    ['target_not_visible', 'voice:order-denied'],
  ])('answers the %s rejection out loud', (reason, line) => {
    const { log, audio } = calls();
    playEvent(audio, { kind: 'order-rejected', reason }, 'es');
    expect(log).toEqual([line]);
  });

  it('keeps routine rejections to the written notice', () => {
    const { log, audio } = calls();
    playEvent(audio, { kind: 'order-rejected', reason: 'rate_limit' }, 'es');
    expect(log).toEqual([]);
  });

  it.each([
    ['base-under-attack', 'base-under-attack'], ['base-hull-critical', 'base-hull-critical'], ['shields-down', 'shields-down'],
    ['sudden-death', 'sudden-death'], ['satellite-warning', 'satellite-warning'], ['nebula-warning', 'nebula-advancing'],
    ['belt-warning', 'belt-closing'], ['core-guardian-down', 'core-guardian-down'], ['core-contested', 'core-contested'],
    ['node-threatened', 'node-threatened'], ['module-online', 'module-online'], ['augment-offer', 'augment-offer'],
    ['link-lost', 'link-lost'], ['link-restored', 'link-restored'], ['ship-launched', 'ship-ready'],
    ['station-captured', 'station-captured'], ['station-lost', 'station-lost'],
  ] as const)('gives the %s event its own line', (kind, line) => {
    const { log, audio } = calls();
    playEvent(audio, { kind } as GameplayEvent, 'es');
    expect(log).toContain(`voice:${line}`);
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

  it('changes the gain of recorded effects and voices that are already playing', async () => {
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
    mix(); const audio = player(); await audio.loaded;
    const recorded = audio as unknown as { sfx: Map<string, AudioBuffer[]>; voice: Map<string, AudioBuffer[]>; recorded: Set<string> };
    recorded.sfx.set('launch', [{} as AudioBuffer]); recorded.voice.set('start', [{} as AudioBuffer]); recorded.recorded.add('start');
    audio.play('launch'); audio.announce('start');
    const effects = gains[1]!, voice = gains[3]!;
    expect([effects.gain.value, voice.gain.value]).toEqual([1, 1]);
    setAudioMix({ ...getAudioMix(), effects: 20, voice: 40 });
    expect([effects.gain.value, voice.gain.value]).toEqual([0.2, 0.4]);
    setAudioMix({ ...getAudioMix(), muted: true });
    expect([effects.gain.value, voice.gain.value]).toEqual([0, 0]);
  });

  it('mutes active browser speech without allowing a sample player to cancel the match voice', async () => {
    const speak = vi.fn(), cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    mix(); const audio = player(); await audio.loaded; audio.announce('start');
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
    ['voz-vela', 1, 1.05],
    ['voz-analista', 0.95, 1.15],
  ])('uses the equipped %s profile for unrecorded announcements in both languages', async (voice, rate, pitch) => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    // The premium voice and track are NFT pieces: this wallet holds both.
    writeOwnedClasses('GTESTWALLET', [5, 6]);
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    saveCosmeticLoadout({ ...defaultCosmeticLoadout, voice: String(voice) });
    mix();
    const spanish = player(); await spanish.loaded; spanish.announce('start');
    const english = new MatchAudio('en'); players.push(english); await english.loaded; english.announce('victory');
    expect(speak.mock.calls[0]![0]).toMatchObject({ rate, pitch, lang: 'es-ES' });
    expect(speak.mock.calls[1]![0]).toMatchObject({ rate, pitch, lang: 'en-US', text: 'Victory. Sector secured.' });
    setAudioMix({ ...getAudioMix(), voice: 20 });
    expect(speak.mock.calls[2]![0]).toMatchObject({ rate, pitch });
    expect(speak.mock.calls[2]![0].volume).toBeCloseTo(0.24);
    setAudioMix({ ...getAudioMix(), muted: true });
    english.announce('start');
    expect(speak).toHaveBeenCalledTimes(3);
  });
});
