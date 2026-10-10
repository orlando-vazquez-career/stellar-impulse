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
  'base-under-attack', 'base-hull-critical', 'shields-down', 'sudden-death', 'satellite-warning', 'nebula-advancing',
  'belt-closing', 'core-guardian-down', 'core-contested', 'node-threatened', 'module-online', 'insufficient-metal',
  'fleet-full', 'order-denied', 'augment-offer', 'link-lost', 'ship-ready', 'station-captured', 'station-lost', 'link-restored',
] as const;
export type SfxSlot = typeof SFX_SLOTS[number];
export type VoiceSlot = typeof VOICE_SLOTS[number];
type Locale = 'es' | 'en';

/** A slot holds one recording, several takes to rotate through, or nothing yet. */
type Clip = string | readonly string[] | null;
type VoiceLines = Partial<Record<Locale, Partial<Record<VoiceSlot, Clip>>>>;

interface AudioManifest {
  sfx?: Partial<Record<SfxSlot, Clip>>;
  voice?: VoiceLines;
  /** Recordings of a hangar voice pack, by item id; any line a pack lacks comes from `voice`. */
  voicePacks?: Record<string, VoiceLines>;
}

/**
 * How much a line matters. A line only cuts one that matters less; otherwise it waits for the
 * current line to end, as long as it is still useful. The result line ends the announcer.
 */
const INFO = 0, OBJECTIVE = 1, CRITICAL = 2, RESULT = 3;
const VOICE_PRIORITY: Record<VoiceSlot, number> = {
  'ship-lost': INFO, 'node-captured': INFO, 'node-lost': INFO, 'module-online': INFO, 'insufficient-metal': INFO,
  'fleet-full': INFO, 'order-denied': INFO, 'ship-ready': INFO, 'station-captured': INFO, 'station-lost': INFO,
  start: OBJECTIVE, 'core-soon': OBJECTIVE, 'core-open': OBJECTIVE, 'core-own-capturing': OBJECTIVE, 'core-guardian-down': OBJECTIVE,
  'augment-offer': OBJECTIVE, 'nebula-advancing': OBJECTIVE, 'belt-closing': OBJECTIVE, 'link-restored': OBJECTIVE,
  'under-attack': CRITICAL, 'base-under-attack': CRITICAL, 'base-hull-critical': CRITICAL, 'core-rival-capturing': CRITICAL,
  'core-contested': CRITICAL, 'node-threatened': CRITICAL, 'satellite-warning': CRITICAL, 'shields-down': CRITICAL,
  'sudden-death': CRITICAL, 'link-lost': CRITICAL,
  victory: RESULT, defeat: RESULT,
};
/** How long a waiting line stays worth saying, by priority. */
const WAIT_MS = [1500, 3000, 5000, 5000];
/** Minimum gap before the same line is said again, so long fights do not turn into a chant. */
const VOICE_COOLDOWN_MS: Partial<Record<VoiceSlot, number>> = {
  'ship-lost': 8000, 'node-captured': 3000, 'node-lost': 3000, 'station-captured': 3000, 'station-lost': 3000,
  'module-online': 2000, 'insufficient-metal': 4000, 'fleet-full': 4000, 'order-denied': 3000, 'ship-ready': 10_000,
  'under-attack': 20_000, 'base-under-attack': 15_000, 'base-hull-critical': 30_000, 'node-threatened': 10_000,
  'core-own-capturing': 20_000, 'core-rival-capturing': 15_000, 'core-contested': 10_000,
};

/** Fallback lines spoken by the browser when a voice slot has no recording. */
const VOICE_TEXT: Record<Locale, Record<VoiceSlot, string>> = {
  es: {
    start: 'Enlace establecido. Captura Metal antes de que se abra el Núcleo.', 'ship-lost': 'Nave perdida.',
    'node-captured': 'Nodo de Metal capturado.', 'node-lost': 'Nodo de Metal perdido.', 'under-attack': 'Flota bajo ataque.',
    'core-soon': 'El Núcleo se abre en treinta segundos.', 'core-open': 'Núcleo abierto. Destruye al guardián.',
    'core-own-capturing': 'Capturando el Núcleo.', 'core-rival-capturing': 'El rival captura el Núcleo.',
    victory: 'Victoria. Sector asegurado.', defeat: 'Derrota. Sector perdido.', 'base-under-attack': 'Base bajo ataque.',
    'base-hull-critical': 'Casco crítico en la base.', 'shields-down': 'Escudos de base caídos. Bases expuestas.',
    'sudden-death': 'Muerte súbita. Captura instantánea del Núcleo.', 'satellite-warning': 'Satélite en caída. Despeja la zona.',
    'nebula-advancing': 'La niebla avanza. Visión reducida.', 'belt-closing': 'El cinturón se cierra. Despeja el paso.',
    'core-guardian-down': 'Guardián destruido. Captura el Núcleo.', 'core-contested': 'Núcleo disputado.',
    'node-threatened': 'Nodo de Metal amenazado.', 'module-online': 'Módulo operativo.', 'insufficient-metal': 'Metal insuficiente.',
    'fleet-full': 'Flota completa.', 'order-denied': 'No puedo hacer eso.', 'augment-offer': 'Señal de mejora. Elige un aumento.',
    'link-lost': 'Enlace perdido.', 'ship-ready': 'Nave lista.', 'station-captured': 'Estación capturada.',
    'station-lost': 'Estación perdida.', 'link-restored': 'Enlace restablecido.',
  },
  en: {
    start: 'Link established. Secure Metal before the Core opens.', 'ship-lost': 'Ship lost.',
    'node-captured': 'Metal node captured.', 'node-lost': 'Metal node lost.', 'under-attack': 'Fleet under attack.',
    'core-soon': 'The Core opens in thirty seconds.', 'core-open': 'Core open. Destroy the guardian.',
    'core-own-capturing': 'Capturing the Core.', 'core-rival-capturing': 'Rival capturing the Core.',
    victory: 'Victory. Sector secured.', defeat: 'Defeat. Sector lost.', 'base-under-attack': 'Base under attack.',
    'base-hull-critical': 'Base integrity critical.', 'shields-down': 'Base shields down. Bases exposed.',
    'sudden-death': 'Sudden death. Core capture is instant.', 'satellite-warning': 'Satellite falling. Clear the zone.',
    'nebula-advancing': 'Fog advancing. Sight reduced.', 'belt-closing': 'Belt closing. Clear the passage.',
    'core-guardian-down': 'Guardian destroyed. Capture the Core.', 'core-contested': 'Core contested.',
    'node-threatened': 'Metal node under threat.', 'module-online': 'Module online.', 'insufficient-metal': 'Not enough Metal.',
    'fleet-full': 'Fleet at capacity.', 'order-denied': "I can't do that.", 'augment-offer': 'Upgrade signal. Choose an augment.',
    'link-lost': 'Link lost.', 'ship-ready': 'Ship ready.', 'station-captured': 'Station captured.',
    'station-lost': 'Station lost.', 'link-restored': 'Link restored.',
  },
};

/** Decoded files shared by every player, so a new match or a settings sample does not decode them again. */
const decoded = new Map<string, Promise<AudioBuffer | null>>();

const takesOf = (clip: Clip | undefined): readonly string[] => (clip ? (typeof clip === 'string' ? [clip] : clip) : []);

interface Line { slot: VoiceSlot; source: AudioBufferSourceNode; amp: GainNode }

export class MatchAudio {
  private context: AudioContext | null = null;
  private lastPlayed = new Map<string, number>();
  private sfx = new Map<SfxSlot, AudioBuffer[]>();
  private voice = new Map<VoiceSlot, AudioBuffer[]>();
  /** Lines the manifest records: a recorded line never falls back to browser speech, even while loading or broken. */
  private recorded = new Set<VoiceSlot>();
  private lastTake = new Map<string, number>();
  private ready = false;
  private current: Line | null = null;
  private waiting: { slot: VoiceSlot; delay: number; at: number } | null = null;
  private lastSpoken = new Map<VoiceSlot, number>();
  private closed = false;
  private disposed = false;
  private bus: AudioChannelBus | null = null;
  private speech: { slot: VoiceSlot; line: SpeechSynthesisUtterance } | null = null;
  private static speechOwner: MatchAudio | null = null;
  private readonly unsubscribe: () => void;
  private readonly pack = equippedCosmetic('voice');
  /** Settles once the manifest and every recording it names are decoded (or failed). */
  readonly loaded: Promise<void>;

  /** Volumes are read from the live mix on every sound, so slider changes apply mid-match. */
  constructor(private locale: Locale, manifestUrl = '/audio/manifest.json') {
    let previousVolume = this.voiceVolume;
    this.unsubscribe = subscribeAudioMix(() => {
      const volume = this.voiceVolume;
      const slot = this.speech?.slot;
      if (slot && MatchAudio.speechOwner === this && volume !== previousVolume) {
        this.stopSpeech();
        if (volume > 0) this.say(slot);
      }
      previousVolume = volume;
    });
    this.loaded = this.load(manifestUrl).finally(() => {
      this.ready = true;
      this.flush();
    });
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

  /** Fetch and decode every filled slot, voices first. A missing or broken file just keeps its fallback. */
  private async load(manifestUrl: string) {
    let manifest: AudioManifest;
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) return;
      manifest = await response.json() as AudioManifest;
    } catch { return; }
    const base = new URL(manifestUrl, typeof window === 'undefined' ? 'http://localhost/' : window.location.href);
    const decode = (path: string): Promise<AudioBuffer | null> => {
      const url = new URL(path, base).href;
      let pending = decoded.get(url);
      if (!pending) {
        const ctx = this.ctx();
        if (!ctx) return Promise.resolve(null);
        pending = fetch(url)
          .then(async (response) => (response.ok ? await ctx.decodeAudioData(await response.arrayBuffer()) : null))
          .catch(() => null);
        decoded.set(url, pending);
        // A failed download may succeed in the next match.
        void pending.then((buffer) => { if (!buffer) decoded.delete(url); });
      }
      return pending;
    };
    const fill = async <Slot extends string>(target: Map<Slot, AudioBuffer[]>, slot: Slot, paths: readonly string[]) => {
      const buffers = (await Promise.all(paths.map(decode))).filter((buffer): buffer is AudioBuffer => buffer !== null);
      if (buffers.length) target.set(slot, buffers);
    };
    const own = manifest.voicePacks?.[this.pack.id]?.[this.locale] ?? {};
    const shared = manifest.voice?.[this.locale] ?? {};
    await Promise.all(VOICE_SLOTS.map((slot) => {
      const paths = takesOf(own[slot]).length ? takesOf(own[slot]) : takesOf(shared[slot]);
      if (paths.length) this.recorded.add(slot);
      return fill(this.voice, slot, paths);
    }));
    await Promise.all(SFX_SLOTS.map((slot) => fill(this.sfx, slot, takesOf(manifest.sfx?.[slot]))));
  }

  /** One take of a slot, never the same take twice in a row when there are several. */
  private pick(key: string, takes: readonly AudioBuffer[]): AudioBuffer {
    if (takes.length === 1) return takes[0]!;
    const last = this.lastTake.get(key) ?? -1;
    let index = Math.floor(Math.random() * (takes.length - 1));
    if (index >= last && last >= 0) index += 1;
    this.lastTake.set(key, index);
    return takes[index]!;
  }

  private playBuffer(buffer: AudioBuffer, channel: AudioChannel, delay = 0): { source: AudioBufferSourceNode; amp: GainNode } | null {
    const ctx = this.ctx();
    if (!ctx || channelVolume(getAudioMix(), channel) <= 0) return null;
    const source = ctx.createBufferSource();
    const amp = ctx.createGain();
    source.buffer = buffer;
    amp.gain.value = 1;
    source.connect(amp).connect(this.bus!.channel(channel));
    source.start(ctx.currentTime + delay);
    return { source, amp };
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
    if (recorded) { this.playBuffer(this.pick(`sfx:${slot}`, recorded), 'effects'); return; }
    this.synth(slot);
  }

  /**
   * Announcer line, `delay` seconds from now so it can follow its sound effect. A recorded line
   * waits behind a line that matters as much or more; browser speech is only for unrecorded lines.
   */
  announce(slot: VoiceSlot, delay = 0) {
    if (this.disposed || this.voiceVolume <= 0) return;
    const priority = VOICE_PRIORITY[slot];
    if (this.closed && priority < RESULT) return;
    const now = performance.now();
    if (now - (this.lastSpoken.get(slot) ?? -Infinity) < (VOICE_COOLDOWN_MS[slot] ?? 0)) return;
    this.lastSpoken.set(slot, now);
    if (priority === RESULT) { this.closed = true; this.waiting = null; }
    if (!this.ready || (this.current && priority <= VOICE_PRIORITY[this.current.slot] && priority < RESULT)) {
      // A line asked for while the recordings load only starts ageing once they are ready.
      if (!this.waiting || priority >= VOICE_PRIORITY[this.waiting.slot]) this.waiting = { slot, delay, at: this.ready ? now : Infinity };
      return;
    }
    this.speak(slot, delay);
  }

  private speak(slot: VoiceSlot, delay: number) {
    if (!this.recorded.has(slot)) { this.say(slot); return; }
    const takes = this.voice.get(slot);
    // A recording that failed to load stays silent rather than switching voices mid-match.
    if (!takes) return;
    this.cut();
    const playing = this.playBuffer(this.pick(`voice:${slot}`, takes), 'voice', delay);
    if (!playing) return;
    const line: Line = { slot, ...playing };
    playing.source.onended = () => {
      if (this.current !== line) return;
      this.current = null;
      this.flush();
    };
    this.current = line;
  }

  /** A new sector world: the previous result no longer silences the announcer. */
  reopen() {
    this.closed = false;
    this.waiting = null;
    this.lastSpoken.clear();
  }

  /** Say the waiting line once nothing is playing, unless it has gone stale. */
  private flush() {
    if (this.disposed || !this.ready || this.current || !this.waiting) return;
    const { slot, delay, at } = this.waiting;
    this.waiting = null;
    if (performance.now() - at > WAIT_MS[VOICE_PRIORITY[slot]]!) return;
    this.speak(slot, delay);
  }

  /** Stop the current line with a short fade instead of a click. */
  private cut() {
    const line = this.current;
    this.current = null;
    if (!line || !this.context) return;
    const at = this.context.currentTime;
    line.amp.gain.setTargetAtTime(0, at, 0.015);
    line.source.stop(at + 0.08);
  }

  /** Browser speech for a line that has no recording. */
  private say(slot: VoiceSlot) {
    if (typeof speechSynthesis === 'undefined') return;
    MatchAudio.speechOwner?.stopSpeech();
    const line = new SpeechSynthesisUtterance(VOICE_TEXT[this.locale][slot]);
    line.lang = this.locale === 'es' ? 'es-ES' : 'en-US';
    line.rate = this.pack.announcer?.rate ?? 1.08;
    line.pitch = this.pack.announcer?.pitch ?? 1;
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
    this.waiting = null;
    this.current?.source.stop();
    this.current = null;
    this.bus?.dispose();
    this.bus = null;
    void this.context?.close();
    this.context = null;
  }
}

export interface Announcement { text: string; tone: 'info' | 'good' | 'bad' }

/** Rejections worth saying out loud; the rest only show their written notice. */
const SPOKEN_REJECTION: Record<string, VoiceSlot> = {
  insufficient_metal: 'insufficient-metal',
  fleet_full: 'fleet-full',
  cannot_attack: 'order-denied',
  target_not_visible: 'order-denied',
  target_unavailable: 'order-denied',
};

/**
 * Sound, announcer line and banner for each match event. Returns the banner to show, if any.
 * The line starts a moment after its sound effect, so the two do not mask each other.
 */
export function playEvent(audio: MatchAudio, event: GameplayEvent, locale: Locale): Announcement | null {
  const es = locale === 'es';
  const banner = (text: string, english: string, tone: Announcement['tone']): Announcement => ({ text: es ? text : english, tone });
  switch (event.kind) {
    case 'match-start':
      audio.reopen();
      return null;
    case 'battle-start':
      audio.play('horn'); audio.announce('start', 0.3);
      return banner('Captura Metal antes de que se abra el Núcleo', 'Secure Metal before the Core opens', 'info');
    case 'augment-offer':
      audio.announce('augment-offer', 0.3);
      return null;
    case 'ship-destroyed':
      audio.play('explosion-small');
      if (event.own) audio.announce('ship-lost', 0.2);
      return null;
    case 'guardian-down':
      audio.play('explosion-large');
      return banner('Guardián destruido', 'Guardian destroyed', 'good');
    case 'core-guardian-down':
      audio.play('explosion-large'); audio.announce('core-guardian-down', 0.4);
      return banner('Guardián destruido · Captura el Núcleo', 'Guardian destroyed · Capture the Core', 'good');
    case 'ship-launched':
      audio.play('launch'); audio.announce('ship-ready', 0.2);
      return null;
    case 'node-captured':
      if (event.own) {
        audio.play('capture-own'); audio.announce('node-captured', 0.2);
        return banner('Nodo de Metal capturado', 'Metal node captured', 'good');
      }
      audio.play('capture-rival');
      return banner('El rival tomó un nodo', 'Rival took a node', 'bad');
    case 'node-lost':
      audio.play('capture-rival'); audio.announce('node-lost', 0.2);
      return banner('Nodo de Metal perdido', 'Metal node lost', 'bad');
    case 'node-threatened':
      audio.announce('node-threatened');
      return banner('El rival está tomando un nodo de Metal', 'The rival is taking a Metal node', 'bad');
    case 'under-attack':
      audio.play('alarm'); audio.announce('under-attack', 0.35);
      return banner('Flota bajo ataque', 'Fleet under attack', 'bad');
    case 'base-under-attack':
      audio.play('alarm'); audio.announce('base-under-attack', 0.35);
      return banner('Base bajo ataque', 'Base under attack', 'bad');
    case 'base-hull-critical':
      audio.announce('base-hull-critical', 0.35);
      return banner('Casco crítico en la base', 'Base integrity critical', 'bad');
    case 'shields-down':
      audio.play('horn'); audio.announce('shields-down', 0.3);
      return banner('Escudos caídos: las bases ya se pueden destruir', 'Shields down: bases can now be destroyed', 'info');
    case 'sudden-death':
      audio.play('horn'); audio.announce('sudden-death', 0.5);
      return banner('Muerte súbita: capturar el Núcleo gana al instante', 'Sudden death: capturing the Core wins at once', 'info');
    case 'module-online':
      audio.announce('module-online', 0.1);
      return banner('Módulo operativo', 'Module online', 'good');
    case 'satellite-warning':
      audio.play('alarm'); audio.announce('satellite-warning', 0.35);
      return banner('¡Satélite en caída! Despeja la zona marcada', 'Satellite falling! Clear the marked zone', 'bad');
    case 'satellite-impact':
      audio.play('explosion-large');
      return null;
    case 'nebula-warning':
      audio.play('alarm'); audio.announce('nebula-advancing', 0.35);
      return banner('¡La niebla morada avanza! Ralentiza y tapa la visión', 'Purple fog advancing! It slows ships and blocks sight', 'bad');
    case 'belt-warning':
      audio.announce('belt-closing');
      return banner('El cinturón de asteroides va a cerrar el paso', 'The asteroid belt is about to close the passage', 'info');
    case 'barrier-down':
      audio.play('explosion-large');
      return banner('Barrera destruida: el camino de ronda queda abierto', 'Barrier destroyed: the ring road is open', 'info');
    case 'station-captured':
      audio.play('capture-own'); audio.announce('station-captured', 0.2);
      return banner('Estación capturada: compra naves al instante en el hangar', 'Station captured: buy ships at once from the hangar', 'good');
    case 'station-lost':
      audio.play('capture-rival'); audio.announce('station-lost', 0.2);
      return banner('Estación perdida', 'Station lost', 'bad');
    case 'turret-down':
      audio.play('explosion-large');
      return banner('Torreta destruida', 'Turret destroyed', 'good');
    case 'core-soon':
      audio.announce('core-soon');
      return banner('El Núcleo se abre en 30 s', 'Core opens in 30 s', 'info');
    case 'core-open':
      audio.play('horn'); audio.announce('core-open', 0.5);
      return banner('Núcleo abierto', 'Core open', 'info');
    case 'core-own-capturing':
      audio.play('capture-own'); audio.announce('core-own-capturing', 0.2);
      return banner('Capturando el Núcleo · Mantén la posición', 'Capturing the Core · Hold position', 'good');
    case 'core-rival-capturing':
      audio.play('alarm'); audio.announce('core-rival-capturing', 0.35);
      return banner('¡El rival captura el Núcleo!', 'Rival is capturing the Core!', 'bad');
    case 'core-contested':
      audio.announce('core-contested');
      return banner('Núcleo disputado', 'Core contested', 'bad');
    case 'victory':
      audio.play('victory'); audio.announce('victory', 0.9);
      return null;
    case 'defeat':
      audio.play('defeat'); audio.announce('defeat', 0.9);
      return null;
    case 'link-lost':
      audio.announce('link-lost');
      return null;
    case 'link-restored':
      audio.announce('link-restored');
      return null;
    case 'order-rejected': {
      const line = SPOKEN_REJECTION[event.reason];
      if (line) audio.announce(line);
      return null;
    }
    default:
      return null;
  }
}
