export const STARFIELD_IMAGES = [
  'assets/starfields/starfield-1.png',
  'assets/starfields/starfield-2.png',
  'assets/starfields/starfield-3.png',
  'assets/starfields/starfield-4.png',
] as const;

export function randomOtherStarfield(current: number, count: number, random: () => number): number {
  const offset = 1 + Math.floor(random() * (count - 1));
  return (current + offset) % count;
}
