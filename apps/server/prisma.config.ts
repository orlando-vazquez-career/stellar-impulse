import { defineConfig } from 'prisma/config';

// `prisma generate` needs no database; migrations read DATABASE_URL (Railway injects it).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
