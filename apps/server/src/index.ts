import { createGameServer } from './app';

const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
await createGameServer().listen(port, host);
console.log(`Game server: http://${host}:${port}`);
