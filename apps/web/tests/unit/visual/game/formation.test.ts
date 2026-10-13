import { describe, expect, it } from 'vitest';
import { canUseFormation } from '../../../../src/visual/game/formation';

describe('formation eligibility', () => {
  it('allows only groups with at least two ships of the same type', () => {
    expect(canUseFormation([])).toBe(false);
    expect(canUseFormation(['interceptor'])).toBe(false);
    expect(canUseFormation(['interceptor', 'interceptor'])).toBe(true);
    expect(canUseFormation(['interceptor', 'bomber'])).toBe(false);
  });
});
