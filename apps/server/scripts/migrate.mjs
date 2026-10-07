// Applies pending Prisma migrations before the server starts, only when a database is configured.
// Without DATABASE_URL the server keeps accounts in AUTH_DATA_FILE and there is nothing to migrate.
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) process.exit(0);
const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
