/** One explicit seed for every random decision. No ambient RNG or shared cursor. */
export function randomFor(seed: number, ...parts: (number | string)[]): () => number {
  let state = seed >>> 0;
  for (const part of parts) for (const char of String(part)) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    let value = state += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
