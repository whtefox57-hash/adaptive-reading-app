import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
const database =
  process.env.READING_TEST_DATABASE || resolve(`.runtime/browser-tests-${Date.now()}.sqlite`);
process.env.READING_TEST_DATABASE = database;
export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run start',
      url: 'http://127.0.0.1:3100/api/health',
      env: { PORT: '3100', DATABASE_PATH: database, COOKIE_SECURE: 'false', MODEL_API_KEY: '' },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm run worker',
      env: { DATABASE_PATH: database },
      wait: { stdout: /independent server worker/ },
      timeout: 30000,
    },
  ],
});
