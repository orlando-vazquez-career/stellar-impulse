import type { AiUnit, Vec2 } from './types.js';

/** Grid distance. Combat and vision in this match are Manhattan, not Euclidean. */
export function distance(left: Vec2, right: Vec2): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

export function nearestWithin(origin: Vec2, candidates: readonly AiUnit[], range: number): AiUnit | null {
  const inRange = candidates.filter((candidate) => distance(origin, candidate.position) <= range);
  return inRange.reduce<AiUnit | null>((best, candidate) => isCloser(origin, candidate, best) ? candidate : best, null);
}

function isCloser(origin: Vec2, candidate: AiUnit, best: AiUnit | null): boolean {
  if (!best) return true;
  const candidateDistance = distance(origin, candidate.position);
  const bestDistance = distance(origin, best.position);
  if (candidateDistance !== bestDistance) return candidateDistance < bestDistance;
  return candidate.id < best.id;
}
