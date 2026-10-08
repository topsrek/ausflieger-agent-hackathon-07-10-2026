import { defineConfig, devices } from '@playwright/test';

const DEPLOYED = 'https://prod-main-web-c3f29b-00kqxs6r2dz.compute.instacloud-edge.com';
// `npm run test:deployed` targets InstaCloud without needing shell-specific env syntax.
const baseURL = process.env.E2E_BASE_URL || (process.env.npm_lifecycle_event === 'test:deployed' ? DEPLOYED : 'http://localhost:5174');

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: false,
        hasTouch: false, // mouse events so @dnd-kit's MouseSensor drives drag & drop
      },
    },
  ],
});
