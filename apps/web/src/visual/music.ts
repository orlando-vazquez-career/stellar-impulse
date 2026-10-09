import { loadVisualPreferences, type VisualPreferences } from './settings/preferences';

export type MusicTrack = 'menu' | 'match';

const DEFAULT_TRACK_PATHS: Record<MusicTrack, string> = {
  menu: '/audio/music/Gravity_s_Final_Path.mp3',
  match: '/audio/music/Iron_Vanguard.mp3',
};

/** Seconds of audio scheduled ahead of the clock for generative fallback */
const LOOKAHEAD = 0.4;
const A = 220;
const hz = (semitones: number) => A * 2 ** (semitones / 12);
const PROGRESSIONS: Record<MusicTrack, number[][]> = {
  menu: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
  match: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-2, 2, 5]],
};
const TEMPO: Record<MusicTrack, number> = { menu: 64, match: 104 };
const SCALE = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];

let sharedPlayer: MusicPlayer | null = null;

/**
 * Background music player: streams recorded MP3 tracks instantly using HTMLAudioElement
 * with smooth crossfades, automatic pause when leaving the screen/tab, and a Web Audio
 * generative synthesizer fallback.
 */
export class MusicPlayer {
  private static readonly CROSSFADE_DURATION = 1.2;
  private static readonly LEAVE_FADE_OUT_DURATION = 0.55;
  private static readonly RETURN_FADE_IN_DURATION = 0.65;

  private track: MusicTrack | null = null;
  private audioElements = new Map<MusicTrack, HTMLAudioElement>();
  private activeAudio: HTMLAudioElement | null = null;
  private activeFadeTimers = new Map<HTMLAudioElement, ReturnType<typeof setInterval>>();
  private isDisposed = false;
  private abortController = new AbortController();
  private isPausedDueToScreenLeave = false;

  // Generative synth fallback if audio elements fail
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private visibilityGain: GainNode | null = null;
  private synthGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private seed = 1;
  private isUsingSynth = false;

  constructor(private audio: VisualPreferences['audio'], manifestUrl = '/audio/manifest.json') {
    // Pre-initialize audio elements immediately so there's zero buffering lag on login
    if (typeof Audio !== 'undefined') {
      for (const track of ['menu', 'match'] as const) {
        this.getOrCreateAudio(track, DEFAULT_TRACK_PATHS[track]);
      }
    }
    void this.loadManifest(manifestUrl);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.handleBlur);
      window.addEventListener('focus', this.handleFocus);
      window.addEventListener('pagehide', this.handleBlur);
      window.addEventListener('pageshow', this.handleFocus);
    }
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  get isPlaying(): boolean {
    return Boolean(this.activeAudio && !this.activeAudio.paused);
  }

  get isMuted(): boolean {
    return this.audio.muted;
  }

  toggleMute(): boolean {
    this.audio.muted = !this.audio.muted;
    if (this.activeAudio) {
      this.activeAudio.volume = this.volume;
      if (!this.audio.muted && this.activeAudio.paused) {
        void this.activeAudio.play().catch(() => {});
      }
    }
    return this.audio.muted;
  }

  private get volume(): number {
    return this.audio.muted ? 0 : (this.audio.master / 100) * (this.audio.music / 100);
  }

  private getOrCreateAudio(track: MusicTrack, src: string): HTMLAudioElement {
    let el = this.audioElements.get(track);
    if (!el) {
      el = new Audio(src);
      el.loop = true;
      el.preload = 'auto';
      el.volume = this.volume;
      this.audioElements.set(track, el);
    } else if (typeof window !== 'undefined') {
      try {
        const targetUrl = new URL(src, window.location.href).href;
        if (el.src !== targetUrl) {
          el.src = src;
        }
      } catch {
        /* keep current src */
      }
    }
    return el;
  }

  setPreferences(audio: VisualPreferences['audio']) {
    this.audio = audio;
    if (this.activeAudio && !this.isUsingSynth) {
      this.activeAudio.volume = this.volume;
    }
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.1);
    }
  }

  private handleVisibilityChange = () => {
    if (this.isDisposed) return;
    if (typeof document !== 'undefined' && document.hidden) {
      this.pauseOnLeave();
    } else {
      this.resumeOnReturn();
    }
  };

  private handleBlur = () => {
    if (this.isDisposed) return;
    this.pauseOnLeave();
  };

  private handleFocus = () => {
    if (this.isDisposed) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.resumeOnReturn();
  };

  private pauseOnLeave() {
    if (this.isDisposed) return;
    if (this.activeAudio && !this.activeAudio.paused) {
      this.isPausedDueToScreenLeave = true;
      const target = this.activeAudio;
      // Spotify-style smooth fade out before pausing
      this.fadeAudioVolume(target, 0, MusicPlayer.LEAVE_FADE_OUT_DURATION, () => {
        if (this.isPausedDueToScreenLeave && target === this.activeAudio) {
          target.pause();
        }
      });
    }
    if (this.context && this.context.state === 'running') {
      this.isPausedDueToScreenLeave = true;
      if (this.master && this.context) {
        this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.15);
        setTimeout(() => {
          if (this.isPausedDueToScreenLeave && this.context?.state === 'running') {
            void this.context.suspend().catch(() => {});
          }
        }, 550);
      } else {
        void this.context.suspend().catch(() => {});
      }
    }
  }

  private resumeOnReturn() {
    if (this.isDisposed) return;
    if (this.isPausedDueToScreenLeave) {
      this.isPausedDueToScreenLeave = false;
      if (this.activeAudio && !this.audio.muted) {
        const target = this.activeAudio;
        if (target.paused) {
          target.volume = 0;
          void target.play().then(() => {
            // Spotify-style smooth fade in back to normal volume
            this.fadeAudioVolume(target, this.volume, MusicPlayer.RETURN_FADE_IN_DURATION);
          }).catch(() => {});
        } else {
          // If it was still fading out when returning, smoothly ramp back up to normal volume
          this.fadeAudioVolume(target, this.volume, MusicPlayer.RETURN_FADE_IN_DURATION);
        }
      }
      if (this.context) {
        if (this.context.state === 'suspended') {
          void this.context.resume().catch(() => {});
        }
        if (this.master) {
          this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.2);
        }
      }
    }
  }

  private fadeAudioVolume(
    audio: HTMLAudioElement,
    targetVolume: number,
    durationSec: number,
    onComplete?: () => void,
  ) {
    const existing = this.activeFadeTimers.get(audio);
    if (existing) {
      clearInterval(existing);
      this.activeFadeTimers.delete(audio);
    }

    const startVolume = audio.volume;
    const diff = targetVolume - startVolume;
    if (Math.abs(diff) < 0.005 || durationSec <= 0) {
      audio.volume = Math.max(0, Math.min(1, targetVolume));
      onComplete?.();
      return;
    }

    const startTime = performance.now();
    const durationMs = durationSec * 1000;

    const timer = setInterval(() => {
      if (this.isDisposed) {
        clearInterval(timer);
        this.activeFadeTimers.delete(audio);
        onComplete?.();
        return;
      }

      const elapsed = performance.now() - startTime;
      const linearProgress = Math.min(1, elapsed / durationMs);

      // Spotify-style Hann/Cosine S-curve easing: smooth start and soft landing
      const easedProgress = 0.5 - 0.5 * Math.cos(Math.PI * linearProgress);
      audio.volume = Math.max(0, Math.min(1, startVolume + diff * easedProgress));

      if (linearProgress >= 1) {
        clearInterval(timer);
        this.activeFadeTimers.delete(audio);
        audio.volume = Math.max(0, Math.min(1, targetVolume));
        onComplete?.();
      }
    }, 20);

    this.activeFadeTimers.set(audio, timer);
  }

  private async loadManifest(manifestUrl: string) {
    try {
      const response = await fetch(manifestUrl, { signal: this.abortController.signal });
      if (!response.ok || this.isDisposed) return;
      const manifest = (await response.json()) as {
        music?: Partial<Record<MusicTrack, string | null>>;
      };
      if (this.isDisposed) return;

      for (const track of ['menu', 'match'] as const) {
        const path = manifest.music?.[track];
        if (path) {
          const resolved = new URL(path, new URL(manifestUrl, window.location.href)).href;
          this.getOrCreateAudio(track, resolved);
        }
      }

      // If a track was requested, ensure it is active
      if (this.track) {
        this.play(this.track);
      }
    } catch {
      // Manifest load failed; keep default pre-initialized tracks
    }
  }

  /**
   * Resumes audio playback immediately. Called on load and on any user gesture.
   */
  resume() {
    if (this.isDisposed) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this.isPausedDueToScreenLeave) {
      this.resumeOnReturn();
      return;
    }
    if (!this.activeAudio && this.track) {
      this.play(this.track);
      return;
    }
    if (this.activeAudio) {
      if (this.activeAudio.paused && this.track && !this.audio.muted) {
        this.activeAudio.volume = this.volume;
        void this.activeAudio.play().catch(() => {});
      }
    }
    if (this.context && this.context.state === 'suspended') {
      void this.context.resume().catch(() => {});
    }
  }

  play(track: MusicTrack, force = false) {
    if (this.isDisposed) return;

    // If requested track is already active and playing, do not restart
    if (this.track === track && !force && this.activeAudio && !this.activeAudio.paused) {
      return;
    }

    const previousAudio = this.activeAudio;
    this.track = track;

    const targetAudio = this.audioElements.get(track) || this.getOrCreateAudio(track, DEFAULT_TRACK_PATHS[track]);
    if (targetAudio) {
      if (this.isUsingSynth) {
        this.stopSynth(true);
        this.isUsingSynth = false;
      }

      if (previousAudio && previousAudio !== targetAudio) {
        // Crossfade out previous track
        this.fadeAudioVolume(previousAudio, 0, MusicPlayer.CROSSFADE_DURATION, () => {
          previousAudio.pause();
          previousAudio.currentTime = 0;
        });
        targetAudio.volume = 0;
        this.fadeAudioVolume(targetAudio, this.volume, MusicPlayer.CROSSFADE_DURATION);
      } else {
        targetAudio.volume = this.volume;
      }

      this.activeAudio = targetAudio;

      // Only attempt playback if the screen is currently active / visible
      if (typeof document === 'undefined' || !document.hidden) {
        const playPromise = targetAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Autoplay blocked by browser policy until interaction
          });
        }
      } else {
        this.isPausedDueToScreenLeave = true;
      }
      return;
    }

    // Fallback: generative synth if audio element is not available
    this.isUsingSynth = true;
    this.startSynth();
  }

  private ensureContext(): AudioContext | null {
    if (this.isDisposed || typeof AudioContext === 'undefined') return null;
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);

      this.visibilityGain = this.context.createGain();
      this.visibilityGain.gain.value = (typeof document !== 'undefined' && document.hidden) ? 0.0001 : 1.0;
      this.visibilityGain.connect(this.master);
    }
    return this.context;
  }

  private startSynth() {
    if (this.isDisposed) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.visibilityGain) return;

    const now = ctx.currentTime;
    const synthGain = ctx.createGain();
    synthGain.gain.setValueAtTime(0.0001, now);
    synthGain.gain.linearRampToValueAtTime(0.4, now + MusicPlayer.CROSSFADE_DURATION);
    synthGain.connect(this.visibilityGain);
    this.synthGain = synthGain;

    this.beat = 0;
    this.nextBeat = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  private stopSynth(fade = true) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = this.context;
    const synth = this.synthGain;
    this.synthGain = null;
    if (synth && ctx) {
      if (fade && ctx.state === 'running') {
        const cur = Math.max(0.0001, synth.gain.value);
        const now = ctx.currentTime;
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
    this.isDisposed = true;
    for (const timer of this.activeFadeTimers.values()) {
      clearInterval(timer);
    }
    this.activeFadeTimers.clear();
    this.abortController.abort();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.handleBlur);
      window.removeEventListener('focus', this.handleFocus);
      window.removeEventListener('pagehide', this.handleBlur);
      window.removeEventListener('pageshow', this.handleFocus);
    }
    for (const audio of this.audioElements.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.audioElements.clear();
    this.activeAudio = null;
    this.stopSynth(false);
    if (this.context && this.context.state !== 'closed') {
      void this.context.close().catch(() => {});
    }
    this.context = null;
    this.master = null;
    this.visibilityGain = null;
  }
}

/**
 * Returns a shared singleton music player for the application lifecycle,
 * ensuring seamless playback across login and menu navigation.
 */
export function getMusicPlayer(audio?: VisualPreferences['audio']): MusicPlayer {
  if (!sharedPlayer || sharedPlayer.disposed) {
    sharedPlayer = new MusicPlayer(audio ?? loadVisualPreferences().audio);
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
