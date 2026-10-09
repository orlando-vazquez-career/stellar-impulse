import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import { createGameServer } from './app.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { AuthService } from './auth.js';

const PORT = 34_000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}`;
const server = createGameServer({ authDataFile: null, campaign: { countdownMs: 100 } });

beforeAll(async () => { await server.listen(PORT, '127.0.0.1'); });
afterAll(async () => { await server.gracefullyShutdown(false); });

async function register(email: string, password = 'secret-1234') {
  const response = await fetch(`${URL}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = response.status === 201
    ? await response.json() as { token: string; user: { id: string; email: string } }
    : null;
  return { response, body };
}

describe('account and multiplayer admission', () => {
  it('keeps password hashes on disk and accepts the account after a restart', () => {
    const file = join(process.cwd(), '.local', `auth-test-${randomUUID()}.json`);
    try {
      const initial = new AuthService(file);
      const account = initial.register('persist@example.com', 'secret-1234');
      const stored = readFileSync(file, 'utf8');
      expect(stored).not.toContain('secret-1234');
      expect(stored).not.toContain(account.token);
      const restarted = new AuthService(file);
      expect(restarted.login('persist@example.com', 'secret-1234').user).toEqual(account.user);
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
    expect(JSON.stringify(body)).not.toContain('secret-1234');

    const duplicate = await register('ana@example.com');
    expect(duplicate.response.status).toBe(409);
    const wrong = await fetch(`${URL}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.com', password: 'wrong-password' }),
    });
    expect(wrong.status).toBe(401);
    const login = await fetch(`${URL}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.com', password: 'secret-1234' }),
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
