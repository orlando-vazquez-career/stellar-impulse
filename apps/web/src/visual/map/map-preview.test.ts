import { describe, expect, it, vi } from 'vitest';
import { PRACTICE_MAPS } from '@impulso/input';
import { SECTOR_RULES, TRAINING_MAPS } from '@impulso/sim';
import { buildMapPreview, fitMapPreview, type PreviewPoint } from './map-preview';

const inside = (point: PreviewPoint, size: { width: number; height: number }) =>
  point.x >= 0 && point.x <= size.width && point.y >= 0 && point.y <= size.height;

describe('map preview', () => {
  it.each(PRACTICE_MAPS.map((map) => map.id))('keeps the bases and the Core of %s inside its projected size', (id) => {
    const preview = buildMapPreview(id);
    expect(preview.id).toBe(id);
    expect(preview.width).toBeGreaterThan(0);
    expect(preview.height).toBeGreaterThan(0);
    for (const point of [preview.bases.p1, preview.bases.p2, preview.core, ...preview.walkable]) expect(inside(point, preview)).toBe(true);
    expect(preview.bases.p1).not.toEqual(preview.bases.p2);
  });

  it.each(PRACTICE_MAPS.map((map) => map.id))('carries every objective of %s with the radius the map gives it', (id) => {
    const map = TRAINING_MAPS[id];
    const preview = buildMapPreview(id);
    const radius = (area: { radius?: number }) => area.radius ?? SECTOR_RULES.captureRadius;
    expect(preview.core.radius).toBe(radius(map.core));
    expect(preview.metals.map((metal) => metal.radius)).toEqual(map.metals.map(radius));
    expect(preview.captures.map((capture) => capture.radius)).toEqual(map.captures.map(radius));
    expect(preview.stations.map((station) => station.radius)).toEqual((map.stations ?? []).map(radius));
    expect(preview.walkable).toHaveLength(map.walkable.filter(Boolean).length);
  });

  it('brings the two stations of Trascendencia Estelar', () => {
    expect(buildMapPreview('trascendencia').stations).toHaveLength(2);
    expect(buildMapPreview('espiral').stations).toHaveLength(0);
  });

  it('tells Espiral Estelar and Caos Estelar apart', () => {
    const espiral = buildMapPreview('espiral');
    const caos = buildMapPreview('espiral-2');
    expect(espiral.walkable).toHaveLength(3265);
    expect(caos.walkable).toHaveLength(3440);
    expect(espiral.bases).not.toEqual(caos.bases);
  });

  it('reads every map without selecting it, and builds each one once', async () => {
    // A fresh module graph: the cache is empty and the default map is active, so every first call below really builds.
    vi.resetModules();
    const sector = await import('./sector-map');
    const { buildMapPreview: build } = await import('./map-preview');
    const before = { id: sector.activeMapId, map: sector.sectorMap, surface: sector.sectorSurface };
    expect(PRACTICE_MAPS.some((map) => map.id !== before.id)).toBe(true);
    for (const { id } of PRACTICE_MAPS) {
      const first = build(id);
      expect(sector.activeMapId).toBe(before.id);
      expect(sector.sectorMap).toBe(before.map);
      expect(sector.sectorSurface).toBe(before.surface);
      expect(build(id)).toBe(first);
    }
  });

  it('fits the whole map in a canvas, centred and with a margin', () => {
    const preview = buildMapPreview('trascendencia');
    const fit = fitMapPreview(preview, 320, 120, 8);
    const placed = [preview.bases.p1, preview.bases.p2, preview.core, ...preview.stations, ...preview.walkable].map(fit.place);
    for (const point of placed) {
      expect(point.x).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(point.x).toBeLessThanOrEqual(320 - 8 + 1e-9);
      expect(point.y).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(point.y).toBeLessThanOrEqual(120 - 8 + 1e-9);
    }
    expect(fit.scale).toBeCloseTo(Math.min(304 / preview.width, 104 / preview.height));
    expect(fitMapPreview(preview, 0, 120, 8).scale).toBe(0);
  });
});
