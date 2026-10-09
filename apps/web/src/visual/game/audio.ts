import { AudioChannelBus, channelVolume, getAudioMix, subscribeAudioMix, type AudioChannel } from '../audio-mix';
import type { GameplayEvent } from './model';
import { equippedCosmetic } from '../hangar/loadout';

/**
 * Match sound effects and announcer.
 * Each sound has a fixed slot name. Drop a recorded file in apps/web/public/audio and point the slot
 * to it in apps/web/public/audio/manifest.json; empty slots fall back to a synthesised effect
 * (or the browser's speech voice for announcer lines), so the match is never silent.
 */
export const SFX_SLOTS = [
  'explosion-small', 'explosion-large', 'capture-own', 'capture-rival',
  'launch', 'alarm', 'horn', 'victory', 'defeat',
] as const;
export const VOICE_SLOTS = [
  'start', 'ship-lost', 'node-captured', 'node-lost', 'under-attack',
  'core-soon', 'core-open', 'core-own-capturing', 'core-rival-capturing', 'victory', 'defeat',
] as const;
export type SfxSlot = typeof SFX_SLOTS[number];
export type VoiceSlot = typeof VOICE_SLOTS[number];

interface AudioManifest {
  sfx?: Partial<Record<SfxSlot, string | null>>;
  voice?: Partial<Record<'es' | 'en', Partial<Record<VoiceSlot, string | null>>>>;
}

/** Fallback lines spoken by the browser when a voice slot has no recording. */
const VOICE_TEXT: Record<'es' | 'en', Record<VoiceSlot, string>> = {
  es: {
    start: 'Sector uno. Captura Metal antes de que se abra el Núcleo.', 'ship-lost': 'Nave perdida',
    'node-captured': 'Nodo capturado', 'node-lost': 'Perdimos un nodo', 'under-attack': 'Nuestra flota está bajo ataque',
    'core-soon': 'El Núcleo se abre en treinta segundos', 'core-open': 'El Núcleo está abierto. Derroten al guardián.',
    'core-own-capturing': 'Estamos capturando el Núcleo', 'core-rival-capturing': 'El rival está capturando el Núcleo',
    victory: 'Victoria', defeat: 'Derrota',
  },
  en: {
    start: 'Sector one. Secure Metal before the Core opens.', 'ship-lost': 'Ship lost',
    'node-captured': 'Node captured', 'node-lost': 'Node lost', 'under-attack': 'Our fleet is under attack',
    'core-soon': 'The Core opens in thirty seconds', 'core-open': 'The Core is open. Defeat its guardian.',
    'core-own-capturing': 'We are capturing the Core', 'core-rival-capturing': 'The rival is capturing the Core',
    victory: 'Victory', defeat: 'Defeat',
  },
};

export class MatchAudio {
  private context: AudioContext | null = null;
  private lastPlayed = new Map<string, number>();
  private sfx = new Map<SfxSlot, AudioBuffer>();
  private voice = new Map<VoiceSlot, AudioBuffer>();
  private speaking: AudioBufferSourceNode | null = null;
  private disposed = false;
  private bus: AudioChannelBus | null = null;
  private speech: { slot: VoiceSlot; line: SpeechSynthesisUtterance } | null = null;
  private static speechOwner: MatchAudio | null = null;
  private readonly unsubscribe: () => void;
  private readonly announcer = equippedCosmetic('voice').announcer;

  /** Volumes are read from the live mix on every sound, so slider changes apply mid-match. */
  constructor(private locale: 'es' | 'en', manifestUrl = '/audio/manifest.json') {
    let previousVolume = this.voiceVolume;
    this.unsubscribe = subscribeAudioMix(() => {
      const volume = this.voiceVolume;
      const slot = this.speech?.slot;
      if (slot && MatchAudio.speechOwner === this && volume !== previousVolume) {
        this.stopSpeech();
        if (volume > 0) this.announce(slot);
      }
      previousVolume = volume;
    });
    void this.load(manifestUrl);
  }

  private get volume(): number {
    return channelVolume(getAudioMix(), 'effects');
  }

  private get voiceVolume(): number {
    return channelVolume(getAudioMix(), 'voice');
  }

  private ctx(): AudioContext | null {
    if (this.disposed || typeof AudioContext === 'undefined') return null;
    if (!this.context) {
      this.context = new AudioContext();
      this.bus = new AudioChannelBus(this.context);
    }
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  /** Fetch and decode every filled slot. A missing or broken file just keeps its fallback. */
  private async load(manifestUrl: string) {
    let manifest: AudioManifest;
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) return;
      manifest = await response.json() as AudioManifest;
    } catch { return; }
    const decode = async (path: string): Promise<AudioBuffer | null> => {
      const ctx = this.ctx();
      if (!ctx) return null;
      try {
        const response = await fetch(new URL(path, new URL(manifestUrl, window.location.href)));
        return response.ok ? await ctx.decodeAudioData(await response.arrayBuffer()) : null;
      } catch { return null; }
    };
    for (const slot of SFX_SLOTS) {
      const path = manifest.sfx?.[slot];
      const buffer = path ? await decode(path) : null;
      if (buffer) this.sfx.set(slot, buffer);
    }
    for (const slot of VOICE_SLOTS) {
      const path = manifest.voice?.[this.locale]?.[slot];
      const buffer = path ? await decode(path) : null;
      if (buffer) this.voice.set(slot, buffer);
    }
  }

  private playBuffer(buffer: AudioBuffer, channel: AudioChannel): AudioBufferSourceNode | null {
    const ctx = this.ctx();
    if (!ctx || channelVolume(getAudioMix(), channel) <= 0) return null;
    const source = ctx.createBufferSource();
    const amp = ctx.createGain();
    source.buffer = buffer;
    amp.gain.value = 1;
    source.connect(amp).connect(this.bus!.channel(channel));
    source.start();
    return source;
  }

  /** Avoid machine-gun repeats when many ships die in the same instant. */
  private throttled(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < ms) return true;
    this.lastPlayed.set(key, now);
    return false;
  }

  /** Play a sound slot: the recorded file if there is one, otherwise the synthesised placeholder. */
  play(slot: SfxSlot) {
    if (this.volume <= 0) return;
    if ((slot === 'explosion-small' || slot === 'explosion-large') && this.throttled('explosion', 90)) return;
    if (slot === 'alarm' && this.throttled('alarm', 6000)) return;
    const recorded = this.sfx.get(slot);
    if (recorded) { this.playBuffer(recorded, 'effects'); return; }
    this.synth(slot);
  }

  /** Announcer line: the recorded voice if there is one, otherwise the browser's speech engine. */
  announce(slot: VoiceSlot) {
    if (this.disposed || this.voiceVolume <= 0) return;
    const recorded = this.voice.get(slot);
    if (recorded) {
      this.speaking?.stop();
      this.speaking = this.playBuffer(recorded, 'voice');
      return;
    }
    if (typeof speechSynthesis === 'undefined') return;
    MatchAudio.speechOwner?.stopSpeech();
    const line = new SpeechSynthesisUtterance(VOICE_TEXT[this.locale][slot]);
    line.lang = this.locale === 'es' ? 'es-ES' : 'en-US';
    line.rate = this.announcer?.rate ?? 1.08;
    line.pitch = this.announcer?.pitch ?? 1;
    line.volume = Math.min(1, this.voiceVolume * 1.2);
    this.speech = { slot, line };
    MatchAudio.speechOwner = this;
    const finish = () => {
      if (this.speech?.line === line) {
        this.speech = null;
        if (MatchAudio.speechOwner === this) MatchAudio.speechOwner = null;
      }
    };
    line.onend = finish;
    line.onerror = finish;
    speechSynthesis.speak(line);
  }

  private stopSpeech() {
    this.speech = null;
    if (MatchAudio.speechOwner === this) {
      MatchAudio.speechOwner = null;
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    }
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
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(amp).connect(this.bus!.channel('effects'));
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
    amp.gain.value = gain;
    source.connect(filter).connect(amp).connect(this.bus!.channel('effects'));
    source.start();
  }

  /** Placeholder sounds used until a recording fills the slot. */
  private synth(slot: SfxSlot) {
    const sequence = (notes: number[], step: number, length: number) =>
      notes.forEach((note, index) => this.tone(note, index * step, length, 'triangle', 0.35));
    switch (slot) {
      case 'explosion-small': this.noise(0.55, 0.6, 2600); this.tone(140, 0, 0.35, 'sine', 0.5, 40); break;
      case 'explosion-large': this.noise(0.9, 0.9, 1800); this.tone(90, 0, 0.6, 'sine', 0.5, 40); break;
      case 'capture-own': sequence([523, 659, 784], 0.09, 0.22); break;
      case 'capture-rival': sequence([392, 330, 262], 0.09, 0.22); break;
      case 'launch': this.tone(330, 0, 0.18, 'square', 0.12, 660); this.tone(660, 0.12, 0.14, 'triangle', 0.2); break;
      case 'alarm': this.tone(880, 0, 0.16, 'square', 0.15); this.tone(660, 0.2, 0.16, 'square', 0.15); break;
      case 'horn': [196, 247, 294].forEach((note) => this.tone(note, 0, 1.1, 'sawtooth', 0.12)); break;
      case 'victory': sequence([523, 659, 784, 1047], 0.18, 0.4); break;
      case 'defeat': sequence([440, 392, 330, 262], 0.18, 0.4); break;
    }
  }

  dispose() {
    this.disposed = true;
    this.unsubscribe();
    this.stopSpeech();
    this.bus?.dispose();
    this.bus = null;
    this.speaking?.stop();
    void this.context?.close();
    this.context = null;
  }
}

export interface Announcement { text: string; tone: 'info' | 'good' | 'bad' }

/** Sound, announcer line and banner for each match event. Returns the banner to show, if any. */
export function playEvent(audio: MatchAudio, event: GameplayEvent, locale: 'es' | 'en'): Announcement | null {
  const es = locale === 'es';
  switch (event.kind) {
    case 'match-start':
      audio.play('horn'); audio.announce('start');
      return { text: es ? 'Sector 01 · Captura Metal' : 'Sector 01 · Secure Metal', tone: 'info' };
    case 'ship-destroyed':
      audio.play('explosion-small');
      if (event.own) audio.announce('ship-lost');
      return null;
    case 'guardian-down':
      audio.play('explosion-large');
      return { text: es ? 'Guardián destruido' : 'Guardian destroyed', tone: 'good' };
    case 'ship-launched':
      audio.play('launch');
      return null;
    case 'node-captured':
      if (event.own) {
        audio.play('capture-own'); audio.announce('node-captured');
        return { text: es ? 'Nodo de Metal capturado' : 'Metal node captured', tone: 'good' };
      }
      audio.play('capture-rival');
      return { text: es ? 'El rival tomó un nodo' : 'Rival took a node', tone: 'bad' };
    case 'node-lost':
      audio.play('capture-rival'); audio.announce('node-lost');
      return { text: es ? 'Nodo perdido' : 'Node lost', tone: 'bad' };
    case 'under-attack':
      audio.play('alarm'); audio.announce('under-attack');
      return null;
    case 'satellite-warning':
      audio.play('alarm');
      return { text: es ? '¡Satélite en caída! Despeja la zona marcada' : 'Satellite falling! Clear the marked zone', tone: 'bad' };
    case 'satellite-impact':
      audio.play('explosion-large');
      return null;
    case 'nebula-warning':
      audio.play('alarm');
      return { text: es ? '¡La niebla morada avanza! Ralentiza y tapa la visión' : 'Purple fog advancing! It slows ships and blocks sight', tone: 'bad' };
    case 'belt-warning':
      return { text: es ? 'El cinturón de asteroides va a cerrar el paso' : 'The asteroid belt is about to close the passage', tone: 'info' };
    case 'barrier-down':
      audio.play('explosion-large');
      return { text: es ? 'Barrera destruida: el camino de ronda queda abierto' : 'Barrier destroyed: the ring road is open', tone: 'info' };
    case 'station-captured':
      audio.play('capture-own');
      return { text: es ? 'Estación capturada: compra naves al instante en el hangar' : 'Station captured: buy ships at once from the hangar', tone: 'good' };
    case 'station-lost':
      audio.play('capture-rival');
      return { text: es ? 'Estación perdida' : 'Station lost', tone: 'bad' };
    case 'turret-down':
      audio.play('explosion-large');
      return { text: es ? 'Torreta destruida' : 'Turret destroyed', tone: 'good' };
    case 'core-soon':
      audio.announce('core-soon');
      return { text: es ? 'El Núcleo se abre en 30 s' : 'Core opens in 30 s', tone: 'info' };
    case 'core-open':
      audio.play('horn'); audio.announce('core-open');
      return { text: es ? 'Núcleo abierto' : 'Core open', tone: 'info' };
    case 'core-own-capturing':
      audio.play('capture-own'); audio.announce('core-own-capturing');
      return { text: es ? 'Capturando el Núcleo' : 'Capturing the Core', tone: 'good' };
    case 'core-rival-capturing':
      audio.play('alarm'); audio.announce('core-rival-capturing');
      return { text: es ? '¡El rival captura el Núcleo!' : 'Rival is capturing the Core!', tone: 'bad' };
    case 'victory':
      audio.play('victory'); audio.announce('victory');
      return null;
    case 'defeat':
      audio.play('defeat'); audio.announce('defeat');
      return null;
    default:
      return null;
  }
}
