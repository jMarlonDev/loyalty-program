import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const useHttps = process.env.LOYALTY_BROWSER_HTTPS === '1';
const origin = useHttps ? 'https://127.0.0.1:3102' : 'http://127.0.0.1:3100';
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'list',
  outputDir: '../../test-results',
  use: {
    channel: 'chromium',
    baseURL: origin,
    ignoreHTTPSErrors: useHttps,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    command: 'node --import tsx tests/browser/server.ts',
    url: origin,
    ignoreHTTPSErrors: useHttps,
    reuseExistingServer: false,
    timeout: 120000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
  },
});
