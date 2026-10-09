import { channelVolume, getAudioMix, setAudioMix, subscribeAudioMix, type AudioMix } from './audio-mix';
import { equippedCosmetic } from './hangar/loadout';

export type MusicTrack = 'menu' | 'match';

/** Seconds of audio scheduled ahead of the clock; the scheduler wakes every 100 ms. */
const LOOKAHEAD = 0.4;
const A = 220;
const hz = (semitones: number) => A * 2 ** (semitones / 12);

/** Am – F – C – G for the menu; Am – Am – F – G (tenser, faster) for the match. Semitones from A3. */
const PROGRESSIONS: Record<MusicTrack, number[][]> = {
  menu: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
  match: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-2, 2, 5]],
};
const TEMPO: Record<MusicTrack, number> = { menu: 64, match: 104 };
/** A natural minor, two octaves, for the bell melody. */
const SCALE = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];

/**
 * Generative background music in Web Audio: no files, nothing to license.
 * A recorded loop can replace a track through the `music` slots of public/audio/manifest.json.
 */
export class MusicPlayer {
  private static readonly CROSSFADE_DURATION = 1.2;
  private static readonly TAB_FADE_DURATION = 0.6;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private visibilityGain: GainNode | null = null;
  private track: MusicTrack | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private recorded = new Map<string, AudioBuffer>();
  private paths: Partial<Record<MusicTrack, string>> = { match: equippedCosmetic('music').musicFile };
  private pending = new Map<string, Promise<void>>();
  private playingPath: string | undefined;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeGain: GainNode | null = null;
  private synthGain: GainNode | null = null;
  private seed = 1;
  /** Set once disposed: late async work (decoding the recorded tracks) must never start sound again. */
  private _disposed = false;
  private audio: AudioMix;
  private readonly unsubscribe: () => void;

  constructor(audio: AudioMix = getAudioMix(), manifestUrl = '/audio/manifest.json') {
    this.audio = audio;
    this.unsubscribe = subscribeAudioMix((mix) => this.setPreferences(mix));
    void this.loadRecorded(manifestUrl);
  }

  get disposed(): boolean {
    return this._disposed;
  }

  get isPlaying(): boolean {
    return Boolean(this.activeSource || this.timer);
  }

  get isMuted(): boolean {
    return Boolean(this.audio.muted);
  }

  toggleMute(): boolean {
    const nextMuted = !this.audio.muted;
    setAudioMix({ ...this.audio, muted: nextMuted });
    return nextMuted;
  }

  private get volume(): number {
    return channelVolume(this.audio, 'music');
  }

  setPreferences(audio: AudioMix) {
    this.audio = audio;
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.05);
  }

  private ensureContext(): AudioContext | null {
    if (this._disposed || typeof AudioContext === 'undefined') return null;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);

      this.visibilityGain = this.context.createGain();
      this.visibilityGain.gain.value = (typeof document !== 'undefined' && document.hidden) ? 0.0001 : 1.0;
      this.visibilityGain.connect(this.master);

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
      }
    }
    return this.context;
  }

  private handleVisibilityChange = () => {
    if (!this.context || !this.visibilityGain) return;
    const now = this.context.currentTime;
    const currentVal = Math.max(0.0001, this.visibilityGain.gain.value);
    this.visibilityGain.gain.cancelScheduledValues(now);
    this.visibilityGain.gain.setValueAtTime(currentVal, now);

    if (document.hidden) {
      // Fade out smoothly like Spotify when leaving tab
      this.visibilityGain.gain.linearRampToValueAtTime(0.0001, now + MusicPlayer.TAB_FADE_DURATION);
    } else {
      // Fade back in smoothly when returning to tab
      this.visibilityGain.gain.linearRampToValueAtTime(1.0, now + MusicPlayer.TAB_FADE_DURATION);
      if (this.context.state === 'suspended') {
        void this.context.resume();
      }
    }
  };

  private async loadRecorded(manifestUrl: string) {
    try {
      const manifest = (await (await fetch(manifestUrl)).json()) as { music?: Partial<Record<MusicTrack, string | null>> };
      const base = new URL(manifestUrl, window.location.href);
      if (manifest.music?.menu) this.paths.menu = new URL(manifest.music.menu, base).href;
      if (!this.paths.match && manifest.music?.match) this.paths.match = new URL(manifest.music.match, base).href;
    } catch { /* the equipped match track can load even if the manifest is unavailable */ }
    if (this._disposed) return;
    await Promise.all(['menu', 'match'].map((track) => this.loadTrack(track as MusicTrack)));
  }

  /** Cache by file, so a late download cannot overwrite a newer hangar selection. */
  private async loadTrack(track: MusicTrack) {
    const path = this.paths[track];
    if (!path || this._disposed || this.recorded.has(path)) return;
    if (this.pending.has(path)) return this.pending.get(path);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const request = (async () => {
      try {
        const response = await fetch(path);
        if (!response.ok || this._disposed) return;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (this._disposed) return;
        this.recorded.set(path, buffer);
        if (this.track && this.paths[this.track] === path) this.play(this.track, true);
      } catch { /* keep the generative fallback for unavailable or undecodable recordings */ }
      finally { this.pending.delete(path); }
    })();
    this.pending.set(path, request);
    await request;
  }

  /** Browsers only allow sound after a user gesture; call this from a click or key press. */
  resume() {
    const ctx = this.ensureContext();
    if (ctx?.state === 'suspended') void ctx.resume();
  }

  play(track: MusicTrack, force = false) {
    if (this._disposed) return;
    // The app keeps this player alive while visiting the hangar: reread on match entry.
    if (track === 'match') this.paths.match = equippedCosmetic('music').musicFile;
    const path = this.paths[track];
    void this.loadTrack(track);
    if (this.track === track && this.playingPath === path && !force && (this.activeSource || this.timer)) return;
    this.stopTrack(true);
    this.track = track;
    this.playingPath = path;
    const ctx = this.ensureContext();
    if (!ctx || !this.visibilityGain) return;

    const recorded = path ? this.recorded.get(path) : undefined;
    const now = ctx.currentTime;

    if (recorded) {
      const trackGain = ctx.createGain();
      trackGain.gain.setValueAtTime(0.0001, now);
      trackGain.gain.linearRampToValueAtTime(1.0, now + MusicPlayer.CROSSFADE_DURATION);
      trackGain.connect(this.visibilityGain);

      const source = ctx.createBufferSource();
      source.buffer = recorded;
      source.loop = true;
      source.connect(trackGain);
      source.start();

      this.activeSource = source;
      this.activeGain = trackGain;
      return;
    }

    const synthGain = ctx.createGain();
    synthGain.gain.setValueAtTime(0.0001, now);
    synthGain.gain.linearRampToValueAtTime(0.4, now + MusicPlayer.CROSSFADE_DURATION);
    synthGain.connect(this.visibilityGain);
    this.synthGain = synthGain;

    this.beat = 0;
    this.nextBeat = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  private stopTrack(fade = true) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    const ctx = this.context;
    const now = ctx?.currentTime ?? 0;

    const source = this.activeSource;
    const gain = this.activeGain;
    this.activeSource = null;
    this.activeGain = null;

    if (source && gain && ctx) {
      if (fade) {
        const cur = Math.max(0.0001, gain.gain.value);
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(cur, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + MusicPlayer.CROSSFADE_DURATION);
        setTimeout(() => {
          try {
            source.stop();
            source.disconnect();
            gain.disconnect();
          } catch { /* already stopped */ }
        }, (MusicPlayer.CROSSFADE_DURATION + 0.1) * 1000);
      } else {
        try {
          source.stop();
          source.disconnect();
          gain.disconnect();
        } catch { /* ignored */ }
      }
    }

    const synth = this.synthGain;
    this.synthGain = null;
    if (synth && ctx) {
      if (fade) {
        const cur = Math.max(0.0001, synth.gain.value);
        synth.gain.cancelScheduledValues(now);
        synth.gain.setValueAtTime(cur, now);
        synth.gain.linearRampToValueAtTime(0.0001, now + MusicPlayer.CROSSFADE_DURATION);
        setTimeout(() => {
          try { synth.disconnect(); } catch { /* ignored */ }
        }, (MusicPlayer.CROSSFADE_DURATION + 0.1) * 1000);
      } else {
        try { synth.disconnect(); } catch { /* ignored */ }
      }
    }
  }

  /** Deterministic pseudo-random so the melody varies without sounding chaotic. */
  private random() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private schedule() {
    const ctx = this.context;
    const track = this.track;
    if (!ctx || !track || ctx.state !== 'running') return;
    const secondsPerBeat = 60 / TEMPO[track];
    while (this.nextBeat < ctx.currentTime + LOOKAHEAD) {
      const chord = PROGRESSIONS[track][Math.floor(this.beat / 4) % 4]!;
      const at = this.nextBeat;
      if (this.beat % 4 === 0) {
        for (const note of chord) this.pad(hz(note), at, secondsPerBeat * 4);
        this.bass(hz(chord[0]! - 12), at, secondsPerBeat * (track === 'menu' ? 4 : 1));
      } else if (track === 'match') {
        this.bass(hz(chord[0]! - 12), at, secondsPerBeat);
      }
      if (track === 'match') this.tick(at + secondsPerBeat / 2);
      if (this.random() < (track === 'menu' ? 0.45 : 0.6)) {
        const note = SCALE[Math.floor(this.random() * SCALE.length)]!;
        this.bell(hz(note + 12), at + (this.random() < 0.5 ? 0 : secondsPerBeat / 2));
      }
      this.nextBeat += secondsPerBeat;
      this.beat += 1;
    }
  }

  private voice(type: OscillatorType, frequency: number, at: number, duration: number, peak: number, attack: number, cutoff?: number, detune = 0) {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.linearRampToValueAtTime(peak, at + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    let out: AudioNode = amp;
    osc.connect(amp);
    if (cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      amp.connect(filter);
      out = filter;
    }
    const dest = this.synthGain || this.visibilityGain || this.master!;
    out.connect(dest);
    osc.start(at);
    osc.stop(at + duration + 0.1);
  }

  private pad(frequency: number, at: number, duration: number) {
    this.voice('sawtooth', frequency, at, duration * 1.05, 0.05, duration * 0.35, 900, -7);
    this.voice('sawtooth', frequency, at, duration * 1.05, 0.05, duration * 0.35, 900, 7);
  }

  private bass(frequency: number, at: number, duration: number) {
    this.voice('triangle', frequency, at, duration * 0.95, 0.22, 0.02);
  }

  private bell(frequency: number, at: number) {
    this.voice('sine', frequency, at, 1.4, 0.07, 0.01);
    this.voice('sine', frequency * 2, at, 0.6, 0.02, 0.01);
  }

  private tick(at: number) {
    const ctx = this.context!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    amp.gain.value = 0.05;
    const dest = this.synthGain || this.visibilityGain || this.master!;
    source.connect(filter).connect(amp).connect(dest);
    source.start(at);
  }

  dispose() {
    this._disposed = true;
    this.unsubscribe();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.stopTrack(false);
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.visibilityGain = null;
  }
}

let sharedPlayer: MusicPlayer | null = null;

export function getMusicPlayer(audio?: AudioMix): MusicPlayer {
  if (!sharedPlayer || sharedPlayer.disposed) {
    sharedPlayer = new MusicPlayer(audio ?? getAudioMix());
  } else if (audio) {
    sharedPlayer.setPreferences(audio);
  }
  return sharedPlayer;
}

export function disposeSharedMusicPlayer() {
  if (sharedPlayer) {
    sharedPlayer.dispose();
    sharedPlayer = null;
  }
}
