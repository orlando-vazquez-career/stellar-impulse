import { createGameMap, type AsteroidGate, type GameMap, type WormholeNetwork } from '../src/game-map';
import type { Terrain } from '../src/terrain';

const SYMBOLS: Readonly<Record<string, Terrain>> = {
  '.': 'empty', n: 'nebula', a: 'asteroid', '>': 'boost', s: 'slow', '#': 'blocked',
};

/** Construye un mapa a partir de filas de texto: . vacío, n nebulosa, a asteroide, > acelerador, s lento, # bloqueado. */
export function mapFromRows(
  rows: readonly string[],
  extras: { wormholes?: WormholeNetwork[]; gates?: AsteroidGate[] } = {},
): GameMap {
  const terrain = rows.flatMap((row) => [...row].map((symbol) => SYMBOLS[symbol] ?? 'empty'));
  return createGameMap({
    width: rows[0]?.length ?? 0,
    height: rows.length,
    terrain,
    wormholes: extras.wormholes ?? [],
    gates: extras.gates ?? [],
    markers: [],
  });
}

export const ALWAYS_OPEN = { periodTicks: 10, openTicks: 10, offsetTicks: 0 };
export const ALWAYS_CLOSED = { periodTicks: 10, openTicks: 0, offsetTicks: 0 };
