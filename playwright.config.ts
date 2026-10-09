import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Test accounts go to a throwaway file, never to the developer's apps/server/data/users.json.
// Workers inherit the runner's environment, so every process agrees on the same file.
process.env.IMPULSO_E2E_USERS ??= join(tmpdir(), `impulso-e2e-users-${Date.now()}.json`);
export default defineConfig({
  testDir: './tests/e2e', timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true, viewport: { width: 1440, height: 1000 } },
  webServer: [
    { command: 'pnpm --filter @impulso/server start', env: { GAME_TEST_MODE: '1', AUTH_DATA_FILE: process.env.IMPULSO_E2E_USERS }, url: 'http://127.0.0.1:2567/health', reuseExistingServer: !process.env.CI, timeout: 30000 },
    { command: 'pnpm --filter @impulso/web dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30000 }
  ]
});
