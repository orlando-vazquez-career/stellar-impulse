import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import { createGameServer } from './app.js';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { AuthService } from './auth.js';
import type { AccountStore, StoredUser } from './account-store.js';

const PORT = 34_000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}`;
// More password checks than the default budget of 20; auth-limit.test.ts covers the budget itself.
const server = createGameServer({ authDataFile: null, campaign: { countdownMs: 100 }, authLimit: { burst: 100, refillPerSecond: 10 } });

beforeAll(async () => { await server.listen(PORT, '127.0.0.1'); });
afterAll(async () => { await server.gracefullyShutdown(false); });

async function register(email: string, password = 'Secret-1234', extra: Record<string, unknown> = {}) {
  const response = await fetch(`${URL}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, ...extra }),
  });
  const body = response.status === 201
    ? await response.json() as { token: string; user: { id: string; email: string; displayName: string | null } }
    : null;
  return { response, body };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const putProfile = (token: string | null, body: unknown) => fetch(`${URL}/auth/profile`, {
  method: 'PUT', headers: { 'content-type': 'application/json', ...(token ? bearer(token) : {}) },
  body: JSON.stringify(body),
});

describe('account and multiplayer admission', () => {
  it('rejects a new account that does not meet the password policy', async () => {
    const weak = await register('weak-policy@example.com', 'secret-1234');
    expect(weak.response.status).toBe(400);
    const missingSpecial = await register('no-special@example.com', 'Secret1234');
    expect(missingSpecial.response.status).toBe(400);
    const tooLong = await register('long-policy@example.com', `Secret-${'x'.repeat(122)}`);
    expect(tooLong.response.status).toBe(400);
    const accepted = await register('strong-policy@example.com', 'Secret-1234');
    expect(accepted.response.status).toBe(201);
  });

  it('signs in again with a long passphrase, past the old 20-character limit', async () => {
    const passphrase = 'Una-frase-de-paso-bastante-larga';
    expect((await register('passphrase@example.com', passphrase)).response.status).toBe(201);
    const login = await fetch(`${URL}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'passphrase@example.com', password: passphrase }),
    });
    expect(login.status).toBe(200);
  });

  it('keeps password hashes on disk and accepts the account after a restart', async () => {
    const file = join(process.cwd(), '.local', `auth-test-${randomUUID()}.json`);
    try {
      const initial = new AuthService(file);
      const account = await initial.register('persist@example.com', 'Secret-1234');
      const stored = readFileSync(file, 'utf8');
      expect(stored).not.toContain('Secret-1234');
      expect(stored).not.toContain(account.token);
      const restarted = new AuthService(file);
      expect(restarted.login('persist@example.com', 'Secret-1234').user).toEqual(account.user);
      expect(restarted.getUser(account.token)).toBeNull();
    } finally {
      unlinkSync(file);
    }
  });

  it('registers, logs in and revokes a session without exposing passwords', async () => {
    const { response, body } = await register('Ana@Example.com');
    expect(response.status).toBe(201);
    expect(body?.user.email).toBe('ana@example.com');
    expect(body?.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(JSON.stringify(body)).not.toContain('Secret-1234');

    const duplicate = await register('ana@example.com');
    expect(duplicate.response.status).toBe(409);
    const wrong = await fetch(`${URL}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.com', password: 'wrong-password' }),
    });
    expect(wrong.status).toBe(401);
    const login = await fetch(`${URL}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.com', password: 'Secret-1234' }),
    });
    expect(login.status).toBe(200);
    const loggedIn = await login.json() as { token: string };
    const me = await fetch(`${URL}/auth/me`, { headers: { authorization: `Bearer ${loggedIn.token}` } });
    expect(await me.json()).toMatchObject({ user: body?.user });
    const logout = await fetch(`${URL}/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${loggedIn.token}` } });
    expect(logout.status).toBe(204);
    expect((await fetch(`${URL}/auth/me`, { headers: { authorization: `Bearer ${loggedIn.token}` } })).status).toBe(401);
  });

  it('issues guest sessions with valid tokens and profile access', async () => {
    const response = await fetch(`${URL}/auth/guest`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alias: 'Vega' }),
    });
    expect(response.status).toBe(201);
    const body = await response.json() as { token: string; user: { id: string; email: string } };
    expect(body.user.email).toMatch(/^vega-[a-f0-9-]+@guest\.local$/);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const me = await fetch(`${URL}/auth/me`, { headers: { authorization: `Bearer ${body.token}` } });
    expect(me.status).toBe(200);
  });

  it('registers with a commander alias and returns it on login, /auth/me and /auth/profile', async () => {
    const { response, body } = await register('alias@example.com', 'Secret-1234', { displayName: '  Ñandú 07 ' });
    expect(response.status).toBe(201);
    expect(body?.user.displayName).toBe('Ñandú 07');
    const login = await fetch(`${URL}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alias@example.com', password: 'Secret-1234' }),
    });
    const session = await login.json() as { token: string; user: unknown };
    expect(session.user).toEqual(body?.user);
    expect(await (await fetch(`${URL}/auth/me`, { headers: bearer(session.token) })).json()).toEqual({ user: body?.user });
    expect(await (await fetch(`${URL}/auth/profile`, { headers: bearer(session.token) })).json())
      .toMatchObject({ displayName: 'Ñandú 07', xp: 0, level: 1 });
  });

  it('refuses an invalid alias at registration and creates no account', async () => {
    for (const displayName of ['<script>', '   ', 'x'.repeat(25), 7, null]) {
      const { response } = await register('bad-alias@example.com', 'Secret-1234', { displayName });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_display_name' });
    }
    const { response, body } = await register('bad-alias@example.com');
    expect(response.status).toBe(201);
    expect(body?.user.displayName).toBeNull();
  });

  it('refuses a weak password at registration and creates the account once it is strong', async () => {
    const weak = await register('weak@example.com', 'secret-1234');
    expect(weak.response.status).toBe(400);
    expect(await weak.response.json()).toEqual({ error: 'weak_password' });
    const strong = await register('weak@example.com', 'Secret-1234');
    expect(strong.response.status).toBe(201);
  });

  it('checks the password before telling whether the email is taken', async () => {
    expect((await register('taken-weak@example.com')).response.status).toBe(201);
    const again = await register('taken-weak@example.com', 'secret-1234');
    expect(again.response.status).toBe(400);
    expect(await again.response.json()).toEqual({ error: 'weak_password' });
  });

  it('still names an invalid email before looking at the password', async () => {
    const { response } = await register('sin-arroba', 'Secret-1234');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('calls a short or non-text password weak', async () => {
    for (const password of ['Se-1', 7]) {
      const { response } = await register('short-weak@example.com', password as string);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'weak_password' });
    }
  });

  it('keeps signing in an account created before the rule', async () => {
    const salt = randomBytes(16).toString('hex');
    const legacyUser: StoredUser = {
      id: randomUUID(), email: 'legacy@example.com', salt, passwordHash: scryptSync('secret-1234', salt, 64).toString('hex'),
    };
    const store: AccountStore = {
      kind: 'memory',
      createAccount: async () => {}, saveAward: async () => {}, saveProfile: async () => {}, saveWallet: async () => {},
    };
    const legacy = new AuthService(store, [legacyUser]);
    expect(legacy.login('legacy@example.com', 'secret-1234').user.email).toBe('legacy@example.com');
  });

  it('changes the alias with PUT /auth/profile only for a valid alias and a live session', async () => {
    const { body } = await register('rename@example.com');
    const token = body!.token;
    const renamed = await putProfile(token, { displayName: ' Vega ' });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toEqual({ user: { ...body!.user, displayName: 'Vega' } });

    const invalid = await putProfile(token, { displayName: '<b>Nova</b>' });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'invalid_display_name' });
    expect((await putProfile(token, {})).status).toBe(400);
    const anonymous = await putProfile(null, { displayName: 'Nova' });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: 'authentication_required' });
    expect((await putProfile('x'.repeat(43), { displayName: 'Nova' })).status).toBe(401);

    expect(await (await fetch(`${URL}/auth/me`, { headers: bearer(token) })).json())
      .toEqual({ user: { ...body!.user, displayName: 'Vega' } });
  });

  it('requires an account and lets two different users play via a shareable code', async () => {
    const ana = await register('ana-room@example.com');
    const beto = await register('beto-room@example.com');
    await expect(new Client(URL).create('campaign', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Sin cuenta' }))
      .rejects.toThrow(/authentication_required/);
    const host = await new Client(URL).create('campaign', {
      protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Ana', token: ana.body?.token,
    });
    expect(host.roomId).toMatch(/^[A-F0-9]{12}$/);
    await expect(new Client(URL).joinById(host.roomId, {
      protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Ana otra vez', token: ana.body?.token,
    })).rejects.toThrow(/already_in_room/);
    const guest = await new Client(URL).joinById(host.roomId, {
      protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Beto', token: beto.body?.token,
    });
    expect(guest.roomId).toBe(host.roomId);
    const sector = new Promise<void>((resolve) => host.onMessage('phase', (phase: { phase: string }) => {
      if (phase.phase === 'sector') resolve();
    }));
    host.send('ready', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body: {} });
    guest.send('ready', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body: {} });
    await sector;
    await host.leave();
    await guest.leave();
  });
});
