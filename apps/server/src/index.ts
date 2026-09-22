import { defineServer, defineRoom, createRouter, createEndpoint } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { TrainingRoom } from './training-room';

const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const transport = new WebSocketTransport({
  maxPayload: 4096,
  verifyClient: (info, done) => {
    const expected = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173';
    // Node smoke clients have no Origin. Public deployment needs authenticated admission.
    done(!info.origin || info.origin === expected || (expected === 'http://127.0.0.1:5173' && info.origin === 'http://localhost:5173'));
  },
});
const server = defineServer({
  transport,
  greet: false,
  rooms: { training: defineRoom(TrainingRoom) },
  routes: createRouter({
    health: createEndpoint('/health', { method: 'GET' }, async () => ({
      status: 'ok', mode: 'training', persistent: false,
    })),
  }),
});
await server.listen(port, host);
console.log(`Training server: http://${host}:${port}`);
