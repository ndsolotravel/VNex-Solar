import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.WEB_ADMIN_URL || 'http://127.0.0.1:3001',
    trace: 'on-first-retry',
  },
});
