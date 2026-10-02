import type { VisualPreferences } from './settings/preferences';

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
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private track: MusicTrack | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private recorded = new Map<MusicTrack, AudioBuffer>();
  private loop: AudioBufferSourceNode | null = null;
  private seed = 1;

  constructor(private audio: VisualPreferences['audio'], manifestUrl = '/audio/manifest.json') {
    void this.loadRecorded(manifestUrl);
  }

  private get volume(): number {
    return this.audio.muted ? 0 : (this.audio.master / 100) * (this.audio.music / 100) * 0.35;
  }

  setPreferences(audio: VisualPreferences['audio']) {
    this.audio = audio;
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.3);
  }

  private ensureContext(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  private async loadRecorded(manifestUrl: string) {
    try {
      const manifest = await (await fetch(manifestUrl)).json() as { music?: Partial<Record<MusicTrack, string | null>> };
      for (const track of ['menu', 'match'] as const) {
        const path = manifest.music?.[track];
        const ctx = path ? this.ensureContext() : null;
        if (!path || !ctx) continue;
        const response = await fetch(new URL(path, new URL(manifestUrl, window.location.href)));
        if (response.ok) this.recorded.set(track, await ctx.decodeAudioData(await response.arrayBuffer()));
      }
      if (this.track && this.recorded.has(this.track)) this.play(this.track, true);
    } catch { /* keep the generative music */ }
  }

  /** Browsers only allow sound after a user gesture; call this from a click or key press. */
  resume() {
    const ctx = this.ensureContext();
    if (ctx?.state === 'suspended') void ctx.resume();
  }

  play(track: MusicTrack, force = false) {
    if (this.track === track && !force) return;
    this.stopTrack();
    this.track = track;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const recorded = this.recorded.get(track);
    if (recorded) {
      this.loop = ctx.createBufferSource();
      this.loop.buffer = recorded;
      this.loop.loop = true;
      this.loop.connect(this.master);
      this.loop.start();
      return;
    }
    this.beat = 0;
    this.nextBeat = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  private stopTrack() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.loop?.stop();
    this.loop = null;
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
    out.connect(this.master!);
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
    source.connect(filter).connect(amp).connect(this.master!);
    source.start(at);
  }

  dispose() {
    this.stopTrack();
    void this.context?.close();
    this.context = null;
    this.master = null;
  }
}
