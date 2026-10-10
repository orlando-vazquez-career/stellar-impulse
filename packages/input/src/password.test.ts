import { describe, expect, it } from 'vitest';
import { passwordMeetsPolicy, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.js';

describe('passwordMeetsPolicy', () => {
  it('accepts a classic mixed password', () => {
    expect(passwordMeetsPolicy('Secret-12')).toBe(true);
    expect(passwordMeetsPolicy('Secret-1234567890123')).toBe(true);
  });

  it('accepts long passphrases and accented letters', () => {
    expect(passwordMeetsPolicy(`Secret-${'x'.repeat(PASSWORD_MAX_LENGTH - 7)}`)).toBe(true);
    expect(passwordMeetsPolicy('Ñandú-clave')).toBe(true);
  });

  it('rejects short, too long, single-case or letter-only passwords', () => {
    expect(passwordMeetsPolicy('Sec-1')).toBe(false);
    expect(passwordMeetsPolicy(`Secret-${'x'.repeat(PASSWORD_MAX_LENGTH - 6)}`)).toBe(false);
    expect(passwordMeetsPolicy('secret-1234')).toBe(false);
    expect(passwordMeetsPolicy('SECRET-1234')).toBe(false);
    expect(passwordMeetsPolicy('Secret1234')).toBe(false);
  });

  it('keeps the limits the registration form shows', () => {
    expect([PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH]).toEqual([8, 128]);
  });
});
