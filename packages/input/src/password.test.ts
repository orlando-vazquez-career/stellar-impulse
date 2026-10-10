import { describe, expect, it } from 'vitest';
import { passwordMeetsPolicy } from './password.js';

describe('passwordMeetsPolicy', () => {
  it('accepts a classic mixed password', () => {
    expect(passwordMeetsPolicy('Secret-12')).toBe(true);
    expect(passwordMeetsPolicy('Secret-1234567890123')).toBe(true);
  });

  it('rejects short, too long, single-case or letter-only passwords', () => {
    expect(passwordMeetsPolicy('Sec-1')).toBe(false);
    expect(passwordMeetsPolicy('Secret-12345678901234')).toBe(false);
    expect(passwordMeetsPolicy('secret-1234')).toBe(false);
    expect(passwordMeetsPolicy('SECRET-1234')).toBe(false);
    expect(passwordMeetsPolicy('Secret1234')).toBe(false);
  });
});
