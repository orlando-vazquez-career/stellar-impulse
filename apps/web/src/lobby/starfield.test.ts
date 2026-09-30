import { describe, expect, it } from 'vitest';
import { STARFIELD_IMAGES, randomOtherStarfield } from './starfield';

describe('starfield cycle', () => {
  it('steps to another layer', () => {
    const count = STARFIELD_IMAGES.length;
    expect(randomOtherStarfield(0, count, () => 0)).toBe(1);
    expect(randomOtherStarfield(0, count, () => 0.99)).toBe(count - 1);
    expect(randomOtherStarfield(count - 1, count, () => 0)).toBe(0);
  });

  it('stays put when there is only one layer', () => {
    expect(randomOtherStarfield(0, 1, () => 0.4)).toBe(0);
  });
});
