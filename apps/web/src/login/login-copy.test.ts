import { describe, expect, it } from 'vitest';
import { PASSWORD_RULES } from '@impulso/input';
import { LOGIN_COPY_KEYS, loginText, passwordRuleText } from './login-copy';

describe('login copy', () => {
  it('writes English without Spanish accents or inverted marks', () => {
    for (const key of LOGIN_COPY_KEYS) {
      expect(loginText('en', key), key).not.toMatch(/[áéíóúñ¿¡]/u);
      expect(loginText('en', key), key).not.toBe('');
    }
  });

  it('names the game in each language', () => {
    expect(loginText('es', 'brand')).toBe('IMPULSO STELLAR');
    expect(loginText('en', 'brand')).toBe('STELLAR IMPULSE');
  });

  it('lists the password rules in the order the server checks them', () => {
    expect(PASSWORD_RULES.map((rule) => passwordRuleText('es', rule))).toEqual([
      'De 8 a 128 caracteres', 'Una minúscula', 'Una mayúscula', 'Un símbolo, como ! # - _ o un espacio',
    ]);
    expect(PASSWORD_RULES.map((rule) => passwordRuleText('en', rule))).toEqual([
      '8 to 128 characters', 'A lowercase letter', 'An uppercase letter', 'A symbol, such as ! # - _ or a space',
    ]);
  });

  it('never calls a rule "Contraseña", which would clash with the password field label', () => {
    for (const rule of PASSWORD_RULES) expect(passwordRuleText('es', rule)).not.toMatch(/contraseña/i);
  });
});
