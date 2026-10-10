import { afterAll, beforeAll, expect, it } from 'vitest';
import { createGameServer } from './app.js';

const PORT = 33_000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}`;
// No refill: the third password check inside the window must be refused.
const server = createGameServer({ authDataFile: null, authLimit: { burst: 2, refillPerSecond: 0 } });
beforeAll(async () => { await server.listen(PORT, '127.0.0.1'); });
afterAll(async () => { await server.gracefullyShutdown(false); });

const post = (path: string, email: string) => fetch(`${URL}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: 'Secret-1234' }),
});

it('refuses password checks beyond the shared budget without hashing them', async () => {
  expect((await post('/auth/login', 'ana@example.com')).status).toBe(401);
  const registered = await post('/auth/register', 'ana@example.com');
  expect(registered.status).toBe(201);
  const { token } = await registered.json() as { token: string };
  const limited = await post('/auth/login', 'beto@example.com');
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('1');
  expect(await limited.json()).toEqual({ error: 'rate_limited' });
  expect((await post('/auth/register', 'caro@example.com')).status).toBe(429);
  expect((await fetch(`${URL}/health`)).status).toBe(200);
  // Changing the alias checks no password, so it does not draw from that budget.
  const renamed = await fetch(`${URL}/auth/profile`, {
    method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'Ana' }),
  });
  expect(renamed.status).toBe(200);
});
