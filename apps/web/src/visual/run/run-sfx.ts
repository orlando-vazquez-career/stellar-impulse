export type RunSound = 'blip' | 'win' | 'defeat' | 'whoosh' | 'impact';

interface Tone { from: number; to: number; duration: number; type?: OscillatorType; volume?: number; delay?: number }
interface Sweep { from: number; to: number; duration: number; volume: number; delay?: number }

/** Synthesized effects for the run's screens: nothing to load, and silent when the volume is zero. */
export class RunSfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** `volume` goes from 0 to 1. */
  constructor(private readonly volume: number) {}

  play(name: RunSound): void {
    if (this.volume <= 0 || !this.ready()) return;
    switch (name) {
      case 'blip': this.tone({ from: 880, to: 660, duration: 0.07 }); break;
      case 'win':
        [523, 659, 784, 1047].forEach((frequency, index) => this.tone({ from: frequency, to: frequency, duration: 0.5, type: 'triangle', volume: 0.09, delay: index * 0.09 }));
        this.impact();
        break;
      case 'defeat':
        [392, 311, 233, 175].forEach((frequency, index) => this.tone({ from: frequency, to: frequency * 0.97, duration: 0.45, type: 'sawtooth', volume: 0.06, delay: index * 0.16 }));
        break;
      case 'whoosh':
        this.sweep({ from: 180, to: 4200, duration: 1.4, volume: 0.32 });
        this.sweep({ from: 3000, to: 160, duration: 1.6, volume: 0.22, delay: 1.3 });
        this.tone({ from: 60, to: 220, duration: 1.3, type: 'sawtooth', volume: 0.05 });
        break;
      case 'impact': this.impact(); break;
    }
  }

  dispose(): void {
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
    this.noise = null;
  }

  private ready(): boolean {
    try {
      if (!this.context) {
        const legacy = window as Window & { webkitAudioContext?: typeof AudioContext };
        const AudioContextClass = window.AudioContext || legacy.webkitAudioContext;
        if (!AudioContextClass) return false;
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.master.gain.value = 0.45 * this.volume;
        this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
      }
      if (this.context.state === 'suspended') void this.context.resume();
      return true;
    } catch {
      // No audio device or the browser refused: the run stays silent.
      return false;
    }
  }

  private impact(): void {
    this.tone({ from: 130, to: 34, duration: 0.8, type: 'sine', volume: 0.4 });
    this.sweep({ from: 2200, to: 80, duration: 0.6, volume: 0.25 });
  }

  private tone({ from, to, duration, type = 'square', volume = 0.07, delay = 0 }: Tone): void {
    const context = this.context!, start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
    this.envelope(gain, start, duration, volume);
    oscillator.connect(gain).connect(this.master!);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  private sweep({ from, to, duration, volume, delay = 0 }: Sweep): void {
    const context = this.context!, start = context.currentTime + delay;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noise;
    source.loop = true;
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    this.envelope(gain, start, duration, volume, duration * 0.4);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(start);
    source.stop(start + duration + 0.05);
  }

  private envelope(gain: GainNode, start: number, duration: number, volume: number, attack = 0.01): void {
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  }
}
