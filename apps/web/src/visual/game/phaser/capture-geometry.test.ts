import { describe, expect, it } from 'vitest';
import { captureEllipse, ellipseSweep } from './capture-geometry';
import { TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from './isometric';

describe('captureEllipse', () => {
  it('turns a capture radius in cells into the ground ellipse drawn around the node', () => {
    const one = captureEllipse(1);
    expect(one.width).toBeCloseTo(135.76, 1);
    expect(one.height).toBeCloseTo(67.88, 1);
    const two = captureEllipse(2);
    expect(two.width).toBeCloseTo(226.27, 1);
    expect(two.height).toBeCloseTo(113.14, 1);
    const three = captureEllipse(3);
    expect(three.width).toBeCloseTo(316.78, 1);
    expect(three.height).toBeCloseTo(158.39, 1);
  });

  it('follows the isometric tile: twice as wide as tall, reaching the corners of the outer cells', () => {
    const reach = (2 + 0.5) * Math.SQRT2;
    expect(captureEllipse(2)).toEqual({ width: reach * 2 * TILE_HALF_WIDTH, height: reach * 2 * TILE_HALF_HEIGHT });
    expect(captureEllipse(2).width / captureEllipse(2).height).toBeCloseTo(TILE_HALF_WIDTH / TILE_HALF_HEIGHT);
  });
});

describe('ellipseSweep', () => {
  const center = { x: 400, y: 300 };
  const { width, height } = captureEllipse(2);

  it('lies on the ellipse', () => {
    const a = width / 2, b = height / 2;
    for (const point of ellipseSweep(center, width, height, 0.73, 40)) {
      expect(((point.x - center.x) / a) ** 2 + ((point.y - center.y) / b) ** 2).toBeCloseTo(1, 9);
    }
  });

  it('starts at the top and returns steps + 1 points', () => {
    const points = ellipseSweep(center, width, height, 0.25, 16);
    expect(points).toHaveLength(17);
    expect(points[0]!.x).toBeCloseTo(center.x);
    expect(points[0]!.y).toBeCloseTo(center.y - height / 2);
  });

  it('runs clockwise on screen: a quarter ends on the right, a half at the bottom, a whole back at the top', () => {
    const quarter = ellipseSweep(center, width, height, 0.25, 8).at(-1)!;
    expect(quarter.x).toBeCloseTo(center.x + width / 2);
    expect(quarter.y).toBeCloseTo(center.y);
    const half = ellipseSweep(center, width, height, 0.5, 32).at(-1)!;
    expect(half.x).toBeCloseTo(center.x);
    expect(half.y).toBeCloseTo(center.y + height / 2);
    const whole = ellipseSweep(center, width, height, 1, 64).at(-1)!;
    expect(whole.x).toBeCloseTo(center.x);
    expect(whole.y).toBeCloseTo(center.y - height / 2);
  });

  it('matches the arc the pronexo capture progress is stroked with', () => {
    const fraction = 0.4;
    const steps = Math.max(2, Math.ceil(64 * fraction));
    const sweep = Math.PI * 2 * fraction;
    const expected = Array.from({ length: steps + 1 }, (_, step) => {
      const angle = -Math.PI / 2 + sweep * step / steps;
      return { x: center.x + Math.cos(angle) * width / 2, y: center.y + Math.sin(angle) * height / 2 };
    });
    expect(ellipseSweep(center, width, height, fraction, steps)).toEqual(expected);
  });
});
