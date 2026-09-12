import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:9998', viewport: { width: 1280, height: 800 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'go run ./tests/browser/server.go',
    url: 'http://127.0.0.1:9998/test-config',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
