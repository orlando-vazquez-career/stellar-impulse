import { loadVisualPreferences, type VisualPreferences } from './settings/preferences';

export type AudioMix = VisualPreferences['audio'];
export type AudioChannel = 'music' | 'effects' | 'voice' | 'interface';
export const AUDIO_CHANNELS: readonly AudioChannel[] = ['music', 'effects', 'voice', 'interface'];

/** Linear gain 0–1 for one channel: master × channel, or silence while muted. */
export function channelVolume(mix: AudioMix, channel: AudioChannel): number {
  if (mix.muted || (channel === 'music' && mix.musicMuted)) return 0;
  return (clampPercent(mix.master) / 100) * (clampPercent(mix[channel]) / 100);
}

export function clampPercent(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
}

/**
 * The live mix every sound source reads. Settings and the in-match panel update it while the
 * player drags a slider, so a change is heard at once, before (or without) saving.
 */
let current: AudioMix = { ...loadVisualPreferences().audio };
const listeners = new Set<(mix: AudioMix) => void>();

export function getAudioMix(): AudioMix {
  return current;
}

export function setAudioMix(mix: AudioMix): void {
  current = { ...mix };
  listeners.forEach((listener) => listener(current));
}

export function subscribeAudioMix(listener: (mix: AudioMix) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One live gain per channel; sounds already playing follow sliders and mute too. */
export class AudioChannelBus {
  private readonly gains = new Map<AudioChannel, GainNode>();
  private readonly unsubscribe: () => void;
  constructor(private readonly context: AudioContext) {
    this.unsubscribe = subscribeAudioMix((mix) => {
      for (const [channel, gain] of this.gains) gain.gain.setValueAtTime(channelVolume(mix, channel), context.currentTime);
    });
  }
  channel(channel: AudioChannel): GainNode {
    let gain = this.gains.get(channel);
    if (!gain) {
      gain = this.context.createGain();
      gain.gain.value = channelVolume(getAudioMix(), channel);
      gain.connect(this.context.destination);
      this.gains.set(channel, gain);
    }
    return gain;
  }
  dispose(): void {
    this.unsubscribe();
    for (const gain of this.gains.values()) gain.disconnect();
    this.gains.clear();
  }
}
