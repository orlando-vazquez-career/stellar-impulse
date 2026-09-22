import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true, viewport: { width: 1440, height: 1000 } },
  webServer: [
    { command: 'pnpm --filter @impulso/server start', url: 'http://127.0.0.1:2567/health', reuseExistingServer: !process.env.CI, timeout: 30000 },
    { command: 'pnpm --filter @impulso/web dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30000 }
  ]
});
