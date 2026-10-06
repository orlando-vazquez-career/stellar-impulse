import { describe, expect, it } from 'vitest';
import { rotateAround, VIEW_ROTATION_DEGREES, VIEW_ROTATION_RADIANS } from './isometric';

describe('battlefield view rotation', () => {
  it('tilts the whole map 30 degrees clockwise of screen-up so bases sit toward the corners', () => {
    expect(VIEW_ROTATION_DEGREES).toBe(-30);
    expect(VIEW_ROTATION_RADIANS).toBeCloseTo(-Math.PI / 6);
  });

  it('round-trips a point through the view tilt', () => {
    const origin = { x: 90, y: 90 };
    const point = { x: 120, y: 70 };
    const tilted = rotateAround({ point, origin, radians: VIEW_ROTATION_RADIANS });
    const restored = rotateAround({ point: tilted, origin, radians: -VIEW_ROTATION_RADIANS });
    expect(restored.x).toBeCloseTo(point.x);
    expect(restored.y).toBeCloseTo(point.y);
  });
});
