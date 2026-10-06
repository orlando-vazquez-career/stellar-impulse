import { describe, expect, it } from 'vitest';
import { cellToIso, isoToPoint, playerViewZoom, projectedWorldBounds, VIEW_YAW_RADIANS } from './isometric';
import { sectorMap, sectorSurface } from '../../map/sector-map';

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
