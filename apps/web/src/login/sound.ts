// Interface sounds from Diego's original command atlas (PR #10), shared by the visual client.
import { useState } from 'react';

const SILENCE = 0.0001;
const FILTER_CUTOFF_HZ = 2400;

interface Tone {
  from: number;
  to: number;
  duration: number;
  wave: OscillatorType;
  volume: number;
}

export interface Pitched {
  pitch: number;
}

export class SpaceSound {
  #context: AudioContext | null = null;
  #enabled = true;

  get enabled() {
    return this.#enabled;
  }

  toggle() {
    this.#enabled = !this.#enabled;
    return this.#enabled;
  }

  playHover(mode: Pitched = { pitch: 523 }) {
    this.#sweep({ from: mode.pitch, to: mode.pitch * 1.5, duration: 0.22, wave: 'sine', volume: 0.07 });
    this.#sweep({ from: mode.pitch * 2, to: mode.pitch * 3, duration: 0.14, wave: 'triangle', volume: 0.02 });
  }

  playEnter(mode: Pitched = { pitch: 392 }) {
    this.#sweep({ from: 70, to: 38, duration: 0.9, wave: 'sine', volume: 0.16 });
    this.#sweep({ from: mode.pitch / 2, to: mode.pitch * 2, duration: 0.7, wave: 'sawtooth', volume: 0.03 });
  }

  playSelect() {
    this.#sweep({ from: 880, to: 1320, duration: 0.1, wave: 'triangle', volume: 0.04 });
  }

  #audioContext() {
    if (!this.#context) {
      const legacy = window as Window & { webkitAudioContext?: typeof AudioContext };
      const AudioContextClass = window.AudioContext || legacy.webkitAudioContext;
      if (!AudioContextClass) return null;
      this.#context = new AudioContextClass();
    }
    if (this.#context.state === 'suspended') void this.#context.resume();
    return this.#context;
  }

  #sweep({ from, to, duration, wave, volume }: Tone) {
    const context = this.#enabled ? this.#audioContext() : null;
    if (!context) return;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(FILTER_CUTOFF_HZ, now);

    gain.gain.setValueAtTime(SILENCE, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(SILENCE, now + duration);

    oscillator.connect(filter).connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.05);
  }
}

export function useSpaceSound() {
  const [sound] = useState(() => new SpaceSound());
  const [enabled, setEnabled] = useState(sound.enabled);
  function toggle() {
    setEnabled(sound.toggle());
  }
  return {
    enabled,
    toggle,
    playHover: sound.playHover.bind(sound),
    playEnter: sound.playEnter.bind(sound),
    playSelect: sound.playSelect.bind(sound),
  };
}
