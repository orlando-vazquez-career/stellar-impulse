import { expect, it } from 'vitest';
import { formatStat } from './format-stat';

it('formats modified speed without binary decimal noise and preserves useful precision', () => {
  expect(formatStat(0.8 - 0.2)).toBe('0.6');
  expect(formatStat(1.25)).toBe('1.25');
  expect(formatStat(6)).toBe('6');
  expect(formatStat(undefined)).toBe('—');
});
