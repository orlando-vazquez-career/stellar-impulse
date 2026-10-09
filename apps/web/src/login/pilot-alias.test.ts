import { describe, expect, it } from 'vitest';
import { accountAlias } from './pilot-alias';

describe('commander alias of a signed-in account', () => {
  const account = { email: 'ana.vega@example.com', displayName: null };

  it('prefers the alias saved in the account over the one typed on this device', () => {
    expect(accountAlias({ ...account, displayName: 'Nova' }, 'Vega')).toBe('Nova');
  });

  it('uses the typed alias, trimmed, when the account has none', () => {
    expect(accountAlias(account, '  Vega ')).toBe('Vega');
  });

  it('falls back to the name of the email, cut to 24 characters', () => {
    expect(accountAlias(account, '   ')).toBe('ana.vega');
    expect(accountAlias({ email: `${'x'.repeat(30)}@example.com`, displayName: null }, '')).toBe('x'.repeat(24));
  });
});
