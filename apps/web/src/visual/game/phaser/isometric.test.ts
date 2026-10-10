import { afterEach, describe, expect, it } from 'vitest';
import { cellToIso, isoToPoint, playerViewZoom, projectCellOn, projectedBoundsOn, projectedWorldBounds, VIEW_YAW_RADIANS } from './isometric';
import { activeMapId, DEFAULT_PLAYABLE_MAP, sectorMap, sectorSurface, selectMap } from '../../map/sector-map';

describe('projection of a map that is not the active one', () => {
  afterEach(() => selectMap(DEFAULT_PLAYABLE_MAP));

  it.each(['espiral', 'trascendencia', 'sector-01'] as const)('matches cellToIso once %s is the active map', (id) => {
    selectMap(id);
    const { width, height } = sectorMap;
    for (const [x, y] of [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1], [12.5, 30.25], [width / 2, height / 3]] as const) {
      const expected = cellToIso(x, y);
      const projected = projectCellOn(width, height, x, y);
      expect(projected.x).toBeCloseTo(expected.x, 9);
      expect(projected.y).toBeCloseTo(expected.y, 9);
    }
    expect(projectedBoundsOn(width, height)).toEqual(projectedWorldBounds());
    // The picking inverse, which reads the live origin, still lands on the same grid point.
    const projected = projectCellOn(width, height, 12.5, 20.25);
    expect(isoToPoint(projected.x, projected.y)?.x).toBeCloseTo(12.5);
    expect(isoToPoint(projected.x, projected.y)?.y).toBeCloseTo(20.25);
  });

  it('does not depend on, nor change, the active map', () => {
    selectMap('espiral');
    const espiral = projectCellOn(96, 96, 40, 50);
    const trascendencia = projectedBoundsOn(115, 115);
    expect(activeMapId).toBe('espiral');
    selectMap('trascendencia');
    expect(projectCellOn(96, 96, 40, 50)).toEqual(espiral);
    expect(projectedBoundsOn(115, 115)).toEqual(trascendencia);
  });
});

describe('player battlefield view', () => {
  it('yaws the projection without cropping the map', () => {
    expect(VIEW_YAW_RADIANS).toBeCloseTo(-Math.PI / 6);
    const lastX = sectorMap.width - 1;
    const lastY = sectorMap.height - 1;
    const corners = [cellToIso(0, 0), cellToIso(lastX, 0), cellToIso(lastX, lastY), cellToIso(0, lastY)];
    const bounds = projectedWorldBounds();
    for (const corner of corners) {
      expect(corner.x).toBeGreaterThanOrEqual(bounds.x - 0.01);
      expect(corner.x).toBeLessThanOrEqual(bounds.x + bounds.width + 0.01);
      expect(corner.y).toBeGreaterThanOrEqual(bounds.y - 0.01);
      expect(corner.y).toBeLessThanOrEqual(bounds.y + bounds.height + 0.01);
    }
  });

  it('places the player base toward the top-left of the view and the rival toward the bottom-right', () => {
    const blue = cellToIso(sectorSurface.bases.p1.x, sectorSurface.bases.p1.y);
    const red = cellToIso(sectorSurface.bases.p2.x, sectorSurface.bases.p2.y);
    expect(blue.x).toBeLessThan(red.x);
    expect(blue.y).toBeLessThan(red.y);
  });

  it('opens close enough that a 16:9 window cannot show the full diamond height', () => {
    const bounds = projectedWorldBounds();
    const zoom = playerViewZoom(1920, 1080);
    expect(1080 / zoom).toBeLessThan(bounds.height);
  });
});

describe('isometric round-trip', () => {
  it('restores grid points after the view yaw', () => {
    const screen = cellToIso(14.25, 17.6);
    const restored = isoToPoint(screen.x, screen.y);
    expect(restored?.x).toBeCloseTo(14.25);
    expect(restored?.y).toBeCloseTo(17.6);
  });
});
