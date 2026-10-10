import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { channelVolume, getAudioMix, subscribeAudioMix } from '../audio-mix';
import { getMusicPlayer } from '../music';
import type { Locale } from '../i18n';
import type { CosmeticItem } from './catalog';

/** The slice of public/audio/manifest.json a preview needs: the opening line of each voice. */
type Clip = string | readonly string[] | null | undefined;
type StartLines = Partial<Record<Locale, { start?: Clip }>>;
export interface PreviewManifest {
  voice?: StartLines;
  voicePacks?: Record<string, StartLines>;
}
export type PreviewChannel = 'voice' | 'music';

/** A preview never runs longer than this; the last second fades out. */
export const PREVIEW_MAX_MS = 20_000;
export const PREVIEW_FADE_MS = 1_000;
const FADE_STEPS = 10;
/** Manifest paths are relative to the manifest itself. */
const AUDIO_ROOT = '/audio/';

const firstTake = (clip: Clip): string | null => (typeof clip === 'string' ? clip : clip?.[0]) || null;
const fromAudioRoot = (path: string) => (/^(\/|https?:)/.test(path) ? path : `${AUDIO_ROOT}${path}`);

/**
 * What "Listen" plays for a piece: a voice pack's first opening line (the onboard AI uses the
 * shared voice), a track its own file. Visual pieces, locked pieces or a missing recording: null.
 */
export function previewClipFor(item: CosmeticItem, locale: Locale, manifest: PreviewManifest | null | undefined): string | null {
  if (!item.unlocked) return null;
  if (item.category === 'music') return item.musicFile ?? null;
  if (item.category !== 'voice' || !manifest) return null;
  // A paid pack must sound like itself: it never borrows the onboard AI's lines.
  const lines = manifest.voicePacks?.[item.id] ?? (item.chain ? undefined : manifest.voice);
  const path = firstTake(lines?.[locale]?.start);
  return path ? fromAudioRoot(path) : null;
}

/** The part of HTMLAudioElement the player uses, so tests can pass a double. */
export interface PreviewElement {
  src: string;
  volume: number;
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: 'ended', listener: () => void): void;
}

export interface PreviewDeps {
  createAudio(): PreviewElement;
  /** Lowers (true) or restores (false) the menu music under the preview. */
  duck(active: boolean): void;
  /** Linear 0–1 level of the channel in the live mix. */
  volume(channel: PreviewChannel): number;
  /** Called when the live mix changes, so a moving slider is heard at once. */
  subscribe(listener: () => void): () => void;
}

const browserDeps: PreviewDeps = {
  createAudio: () => new Audio(),
  duck: (active) => getMusicPlayer().duck(active),
  volume: (channel) => channelVolume(getAudioMix(), channel),
  subscribe: (listener) => subscribeAudioMix(listener),
};

/**
 * One audio element for every preview in the page: a new clip cuts the previous one, the music
 * ducks underneath, and nothing plays longer than twenty seconds.
 */
export class PreviewPlayer {
  private element: PreviewElement | null = null;
  private key: string | null = null;
  private channel: PreviewChannel = 'voice';
  private fade = 1;
  private ducked = false;
  /** Bumped on every start and stop, so timers and promises of an older clip do nothing. */
  private session = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private unsubscribeMix: (() => void) | null = null;
  private readonly listeners = new Set<(key: string | null) => void>();

  constructor(private readonly deps: PreviewDeps = browserDeps) {}

  /** The piece being previewed, or null. */
  get current(): string | null { return this.key; }

  subscribe(listener: (key: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  play(key: string, url: string, channel: PreviewChannel): void {
    this.halt();
    const session = ++this.session;
    const audio = this.element ??= this.createElement();
    this.key = key;
    this.channel = channel;
    this.fade = 1;
    audio.src = url;
    try { audio.currentTime = 0; } catch { /* nothing loaded yet: it starts at zero anyway */ }
    this.applyVolume();
    if (!this.ducked) { this.ducked = true; this.deps.duck(true); }
    this.unsubscribeMix = this.deps.subscribe(() => this.applyVolume());
    this.timers.push(setTimeout(() => this.fadeOut(session), PREVIEW_MAX_MS - PREVIEW_FADE_MS));
    this.notify();
    const refused = () => { if (this.session === session) this.stop(); };
    try {
      void Promise.resolve(audio.play()).catch(refused);
    } catch {
      refused();
    }
  }

  stop(): void {
    if (this.key === null) return;
    this.halt();
    this.key = null;
    if (this.ducked) { this.ducked = false; this.deps.duck(false); }
    this.notify();
  }

  private createElement(): PreviewElement {
    const audio = this.deps.createAudio();
    audio.addEventListener('ended', () => this.stop());
    return audio;
  }

  private halt(): void {
    this.session++;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.unsubscribeMix?.();
    this.unsubscribeMix = null;
    this.element?.pause();
  }

  private fadeOut(session: number): void {
    let step = 0;
    const tick = () => {
      if (session !== this.session) return;
      step += 1;
      this.fade = Math.max(0, 1 - step / FADE_STEPS);
      this.applyVolume();
      if (step >= FADE_STEPS) this.stop();
      else this.timers.push(setTimeout(tick, PREVIEW_FADE_MS / FADE_STEPS));
    };
    if (session === this.session) this.timers.push(setTimeout(tick, PREVIEW_FADE_MS / FADE_STEPS));
  }

  private applyVolume(): void {
    if (!this.element) return;
    this.element.volume = Math.min(1, Math.max(0, this.deps.volume(this.channel) * this.fade));
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.key));
  }
}

let shared: PreviewPlayer | null = null;
export function sharedPreviewPlayer(): PreviewPlayer {
  return (shared ??= new PreviewPlayer());
}

let manifestRequest: Promise<PreviewManifest | null> | null = null;
/** The audio manifest, fetched once; a failed request is tried again next time. */
export function loadPreviewManifest(): Promise<PreviewManifest | null> {
  manifestRequest ??= fetch('/audio/manifest.json')
    .then((response) => (response.ok ? response.json() as Promise<PreviewManifest> : null))
    .catch(() => null)
    .then((manifest) => { if (!manifest) manifestRequest = null; return manifest; });
  return manifestRequest;
}

/** Voices and tracks have something to listen to; visual pieces do not. */
export function canPreviewAudio(item: CosmeticItem): boolean {
  return item.unlocked && (item.category === 'voice' || item.category === 'music');
}

/**
 * "Listen" / "Stop" for one panel. Whatever this panel started stops when it unmounts, so closing
 * a detail or leaving the hangar never leaves a preview playing.
 */
export function usePreviewAudio(locale: Locale) {
  const player = sharedPreviewPlayer();
  const playing = useSyncExternalStore(
    useCallback((onChange: () => void) => player.subscribe(onChange), [player]),
    () => player.current,
    () => null,
  );
  const started = useRef<string | null>(null);

  useEffect(() => {
    void loadPreviewManifest();
    return () => {
      if (started.current !== null && player.current === started.current) player.stop();
    };
  }, [player]);

  const toggle = useCallback(async (item: CosmeticItem) => {
    if (player.current === item.id) { player.stop(); return; }
    const url = previewClipFor(item, locale, await loadPreviewManifest());
    if (!url) return;
    started.current = item.id;
    player.play(item.id, url, item.category === 'music' ? 'music' : 'voice');
  }, [player, locale]);

  const stop = useCallback(() => player.stop(), [player]);
  return { playing, toggle, stop };
}
