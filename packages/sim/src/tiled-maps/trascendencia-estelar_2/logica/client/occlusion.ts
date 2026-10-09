import type { WorldPoint } from './iso-projection';

export interface Occluder {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  /** Línea del suelo del objeto: lo que está por encima de ella en pantalla queda detrás. */
  readonly groundY: number;
}

export const OCCLUDING_ALPHA = 0.35;

/**
 * Un objeto alto se vuelve semitransparente si tapa a alguna nave que está detrás de él.
 * Así ningún jugador queda en desventaja por la orientación de la cámara isométrica.
 */
export function occluderAlpha(occluder: Occluder, unitPoints: readonly WorldPoint[]): number {
  const hidesSomeone = unitPoints.some((point) => point.x >= occluder.left && point.x <= occluder.right
    && point.y >= occluder.top && point.y < occluder.groundY);
  return hidesSomeone ? OCCLUDING_ALPHA : 1;
}
