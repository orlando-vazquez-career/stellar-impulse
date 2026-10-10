import { describe, expect, it } from 'vitest';
import { mapName } from './map-name';

describe('mapName', () => {
  it.each([
    ['espiral', 'Espiral Estelar', 'Stellar Spiral'],
    ['espiral-2', 'Caos Estelar', 'Stellar Chaos'],
    ['trascendencia', 'Trascendencia Estelar', 'Stellar Transcendence'],
    ['sector-01', 'Sector 01 · Umbral Helios', 'Sector 01 · Helios Threshold'],
  ] as const)('names %s in both languages', (id, es, en) => {
    expect(mapName(id, 'es')).toBe(es);
    expect(mapName(id, 'en')).toBe(en);
  });
});
