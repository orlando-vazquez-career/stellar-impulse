import { createGameServer } from './app';
import { openPostgresAuth, PostgresAccountStore } from './postgres-store';

const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
// With DATABASE_URL (Railway) accounts live in Postgres; without it, in AUTH_DATA_FILE as before.
const databaseUrl = process.env.DATABASE_URL;
const auth = databaseUrl
  ? await openPostgresAuth(new PostgresAccountStore(databaseUrl), process.env.AUTH_DATA_FILE)
  : undefined;
await createGameServer({ auth }).listen(port, host);
console.log(`Game server: http://${host}:${port} (accounts: ${databaseUrl ? 'postgres' : 'file'})`);
