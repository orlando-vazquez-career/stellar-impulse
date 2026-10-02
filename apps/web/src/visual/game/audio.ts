import type { VisualPreferences } from '../settings/preferences';
import type { GameplayEvent } from './model';

/**
 * Procedural sound effects and a spoken announcer for the match.
 * Everything is synthesised with Web Audio and the browser's speech engine: no audio files,
 * so there is nothing to license. Volumes follow the player's settings (master × effects).
 */
export class MatchAudio {
  private context: AudioContext | null = null;
  private lastPlayed = new Map<string, number>();

  constructor(private audio: VisualPreferences['audio'], private locale: 'es' | 'en') {}

  private get volume(): number {
    return this.audio.muted ? 0 : (this.audio.master / 100) * (this.audio.effects / 100);
  }

  private ctx(): AudioContext | null {
    if (this.volume <= 0 || typeof AudioContext === 'undefined') return null;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  /** Avoid machine-gun repeats when many ships die or fire in the same instant. */
  private throttled(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < ms) return true;
    this.lastPlayed.set(key, now);
    return false;
  }

  private tone(frequency: number, start: number, duration: number, type: OscillatorType, gain: number, slideTo?: number) {
    const ctx = this.ctx();
    if (!ctx) return;
    const at = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + duration);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain * this.volume, at + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  private noise(duration: number, gain: number, cutoff: number) {
    const ctx = this.ctx();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + duration);
    amp.gain.value = gain * this.volume;
    source.connect(filter).connect(amp).connect(ctx.destination);
    source.start();
  }

  explosion(big: boolean) {
    if (this.throttled('explosion', 90)) return;
    this.noise(big ? 0.9 : 0.55, big ? 0.9 : 0.6, big ? 1800 : 2600);
    this.tone(big ? 90 : 140, 0, big ? 0.6 : 0.35, 'sine', 0.5, 40);
  }

  capture(own: boolean) {
    const notes = own ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((note, index) => this.tone(note, index * 0.09, 0.22, 'triangle', 0.35));
  }

  launch() {
    this.tone(330, 0, 0.18, 'square', 0.12, 660);
    this.tone(660, 0.12, 0.14, 'triangle', 0.2);
  }

  alarm() {
    if (this.throttled('alarm', 6000)) return;
    this.tone(880, 0, 0.16, 'square', 0.15);
    this.tone(660, 0.2, 0.16, 'square', 0.15);
  }

  horn() {
    [196, 247, 294].forEach((note) => this.tone(note, 0, 1.1, 'sawtooth', 0.12));
  }

  jingle(victory: boolean) {
    const notes = victory ? [523, 659, 784, 1047] : [440, 392, 330, 262];
    notes.forEach((note, index) => this.tone(note, index * 0.18, 0.4, 'triangle', 0.35));
  }

  /** Short spoken line; newer announcements replace queued ones so the voice never lags behind. */
  announce(text: string) {
    if (this.volume <= 0 || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const line = new SpeechSynthesisUtterance(text);
    line.lang = this.locale === 'es' ? 'es-ES' : 'en-US';
    line.rate = 1.08;
    line.volume = Math.min(1, this.volume * 1.2);
    speechSynthesis.speak(line);
  }

  dispose() {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    void this.context?.close();
    this.context = null;
  }
}

export interface Announcement { text: string; tone: 'info' | 'good' | 'bad' }

/** Sound and banner for each match event. Returns the banner to show, if any. */
export function playEvent(audio: MatchAudio, event: GameplayEvent, locale: 'es' | 'en'): Announcement | null {
  const es = locale === 'es';
  switch (event.kind) {
    case 'match-start':
      audio.horn();
      audio.announce(es ? 'Sector uno. Captura Metal antes de que se abra el Núcleo.' : 'Sector one. Secure Metal before the Core opens.');
      return { text: es ? 'Sector 01 · Captura Metal' : 'Sector 01 · Secure Metal', tone: 'info' };
    case 'ship-destroyed':
      audio.explosion(false);
      if (event.own) audio.announce(es ? 'Nave perdida' : 'Ship lost');
      return null;
    case 'guardian-down':
      audio.explosion(true);
      return { text: es ? 'Guardián destruido' : 'Guardian destroyed', tone: 'good' };
    case 'ship-launched':
      audio.launch();
      return null;
    case 'node-captured':
      audio.capture(!!event.own);
      if (event.own) {
        audio.announce(es ? 'Nodo capturado' : 'Node captured');
        return { text: es ? 'Nodo de Metal capturado' : 'Metal node captured', tone: 'good' };
      }
      return { text: es ? 'El rival tomó un nodo' : 'Rival took a node', tone: 'bad' };
    case 'node-lost':
      audio.capture(false);
      audio.announce(es ? 'Perdimos un nodo' : 'Node lost');
      return { text: es ? 'Nodo perdido' : 'Node lost', tone: 'bad' };
    case 'under-attack':
      audio.alarm();
      audio.announce(es ? 'Nuestra flota está bajo ataque' : 'Our fleet is under attack');
      return null;
    case 'core-soon':
      audio.announce(es ? 'El Núcleo se abre en treinta segundos' : 'The Core opens in thirty seconds');
      return { text: es ? 'El Núcleo se abre en 30 s' : 'Core opens in 30 s', tone: 'info' };
    case 'core-open':
      audio.horn();
      audio.announce(es ? 'El Núcleo está abierto. Derroten al guardián.' : 'The Core is open. Defeat its guardian.');
      return { text: es ? 'Núcleo abierto' : 'Core open', tone: 'info' };
    case 'core-own-capturing':
      audio.capture(true);
      audio.announce(es ? 'Estamos capturando el Núcleo' : 'We are capturing the Core');
      return { text: es ? 'Capturando el Núcleo' : 'Capturing the Core', tone: 'good' };
    case 'core-rival-capturing':
      audio.alarm();
      audio.announce(es ? 'El rival está capturando el Núcleo' : 'The rival is capturing the Core');
      return { text: es ? '¡El rival captura el Núcleo!' : 'Rival is capturing the Core!', tone: 'bad' };
    case 'victory':
      audio.jingle(true);
      audio.announce(es ? 'Victoria' : 'Victory');
      return null;
    case 'defeat':
      audio.jingle(false);
      audio.announce(es ? 'Derrota' : 'Defeat');
      return null;
    default:
      return null;
  }
}
