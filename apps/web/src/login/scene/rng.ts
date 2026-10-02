export type Rng = () => number;

/**
 * RNG determinista (mulberry32). La escena del login se siembra con una
 * constante para que cada visita arranque con la misma composición y los
 * screenshots de prueba sean reproducibles.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function int(rng: Rng, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1));
}
