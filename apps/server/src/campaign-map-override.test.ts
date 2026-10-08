import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { createBattlefieldWorld } from '@impulso/sim';
import { createGameServer } from './app.js';
import { AuthService } from './auth.js';

const PORT = 30_000 + Math.floor(Math.random() * 800);
const URL = `http://127.0.0.1:${PORT}`;
const auth = new AuthService();
const options = async (name: string) => ({ protocolVersion: 2, name,
  token: (await auth.register(`${name}@override.example.com`, 'secret-1234')).token });
const server = createGameServer({ auth, campaign: { countdownMs: 0,
  createSector: () => createBattlefieldWorld() } });

beforeAll(async () => { await server.listen(PORT, '127.0.0.1'); });
afterAll(async () => { await server.gracefullyShutdown(false); });

function next(room: Room, type: string, accept: (value: any) => boolean = () => true): Promise<any> {
  return new Promise((resolve, reject) => {
    const off = room.onMessage(type, (value: any) => {
      if (!accept(value)) return;
      clearTimeout(timer); off(); resolve(value);
    });
    const timer = setTimeout(() => { off(); reject(new Error(`timeout waiting for ${type}`)); }, 5_000);
  });
}

it('keeps a server-owned sector override ahead of the creator catalog choice', async () => {
  const a = await new Client(URL).create('campaign', { ...(await options('Ana')), map: 'sector-01' });
  const b = await new Client(URL).joinById(a.roomId, await options('Beto'));
  for (const room of [a, b]) room.reconnection.enabled = false;
  try {
    const phase = next(a, 'phase', (view) => view.phase === 'sector');
    const map = next(a, 'map');
    const envelope = { protocolVersion: 2, body: {} };
    a.send('ready', envelope); b.send('ready', envelope);
    expect(await map).toMatchObject({ mapId: 'battlefield', width: 72, height: 72 });
    expect(await phase).not.toHaveProperty('renderMap');
  } finally {
    await a.leave(); await b.leave();
  }
});
