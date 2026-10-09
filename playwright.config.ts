import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Test accounts go to a throwaway file, never to the developer's apps/server/data/users.json.
// Workers inherit the runner's environment, so every process agrees on the same file.
process.env.IMPULSO_E2E_USERS ??= join(tmpdir(), `impulso-e2e-users-${Date.now()}.json`);
function testPort(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid port`);
  return value;
}
const serverPort = testPort('IMPULSO_E2E_SERVER_PORT', 2567);
const webPort = testPort('IMPULSO_E2E_WEB_PORT', 5173);
const serverUrl = `http://127.0.0.1:${serverPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
process.env.IMPULSO_E2E_SERVER_URL = serverUrl;

export default defineConfig({
  testDir: './tests/e2e', timeout: 60000, workers: 1,
  use: { baseURL: webUrl, headless: true, viewport: { width: 1440, height: 1000 } },
  webServer: [
    { command: 'pnpm --filter @impulso/server start', env: { PORT: String(serverPort), WEB_ORIGIN: webUrl, GAME_TEST_MODE: '1', AUTH_DATA_FILE: process.env.IMPULSO_E2E_USERS }, url: `${serverUrl}/health`, reuseExistingServer: !process.env.CI, timeout: 30000 },
    { command: `pnpm --filter @impulso/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`, env: { VITE_SERVER_URL: serverUrl }, url: webUrl, reuseExistingServer: !process.env.CI, timeout: 30000 }
  ]
});
