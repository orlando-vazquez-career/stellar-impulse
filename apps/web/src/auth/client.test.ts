import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGameServer } from '../../../server/src/app';

const port = 36_000 + Math.floor(Math.random() * 900);
const url = `http://127.0.0.1:${port}`;
const server = createGameServer({ authDataFile: null });

class StorageMemory {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

// The client reads the server address once, when the module loads.
vi.stubEnv('VITE_SERVER_URL', url);
vi.stubGlobal('sessionStorage', new StorageMemory());
const {
  AuthRequestError, accountErrorKey, loginAccount, logoutAccount, registerAccount, restoreAccount, updateDisplayName,
} = await import('./client');

beforeAll(async () => { await server.listen(port, '127.0.0.1'); });
afterAll(async () => {
  await server.gracefullyShutdown(false);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const failure = (request: Promise<unknown>) => request.then(
  () => { throw new Error('the request should have failed'); },
  (error: unknown) => error,
);

describe('account client', () => {
  it('creates an account with its alias and gets the alias back on restore and login', async () => {
    const created = await registerAccount('vega-client@example.com', 'secret-1234', '  Vega  ');
    expect(created).toMatchObject({ email: 'vega-client@example.com', displayName: 'Vega' });
    expect(await restoreAccount()).toEqual(created);
    await logoutAccount();
    expect(await restoreAccount()).toBeNull();
    expect(await loginAccount('vega-client@example.com', 'secret-1234')).toEqual(created);
  });

  it('saves an alias for an account that had none', async () => {
    const created = await registerAccount('nova-client@example.com', 'secret-1234');
    expect(created.displayName).toBeNull();
    expect(await updateDisplayName('Nova')).toEqual({ ...created, displayName: 'Nova' });
    expect((await restoreAccount())?.displayName).toBe('Nova');
  });

  it('tells a taken email, an invalid alias and invalid credentials apart', async () => {
    await registerAccount('taken-client@example.com', 'secret-1234', 'Taken');
    const taken = await failure(registerAccount('taken-client@example.com', 'secret-1234', 'Otra'));
    expect(taken).toMatchObject({ status: 409, code: 'email_in_use' });
    expect(accountErrorKey(taken, 'register')).toBe('accountEmailInUse');
    const alias = await failure(registerAccount('alias-client@example.com', 'secret-1234', '<Vega>'));
    expect(alias).toMatchObject({ status: 400, code: 'invalid_display_name' });
    expect(accountErrorKey(alias, 'register')).toBe('accountAliasInvalid');
    // A blank alias is refused too, instead of creating the account without one.
    expect(await failure(registerAccount('blank-client@example.com', 'secret-1234', '   ')))
      .toMatchObject({ status: 400, code: 'invalid_display_name' });
    expect(accountErrorKey(await failure(updateDisplayName('<Vega>')), 'register')).toBe('accountAliasInvalid');
    const short = await failure(registerAccount('short-client@example.com', 'short', 'Vega'));
    expect(accountErrorKey(short, 'register')).toBe('accountRegisterInvalid');
    const wrong = await failure(loginAccount('taken-client@example.com', 'wrong-password'));
    expect(accountErrorKey(wrong, 'login')).toBe('accountInvalid');
    expect(accountErrorKey(new AuthRequestError(429, 'rate_limited'), 'register')).toBe('accountUnavailable');
    expect(accountErrorKey(new TypeError('Failed to fetch'), 'login')).toBe('accountUnavailable');
  });

  it('needs a session to change the alias', async () => {
    await logoutAccount();
    expect(await failure(updateDisplayName('Nova'))).toMatchObject({ status: 401 });
  });
});
