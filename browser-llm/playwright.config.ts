import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'playwright',
  workers: 1,
  fullyParallel: false,

  reporter: [
    ['dot'],
    ['html', { outputFolder: 'target/report', open: 'never' }],
  ],

  outputDir: 'target/test-results',

  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:8091',
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
