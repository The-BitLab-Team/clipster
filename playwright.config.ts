import { defineConfig } from '@playwright/test';

/**
 * E2E do app Electron (SPEC §29.3). Roda o build em `out/` com dados isolados
 * (CLIPSTER_E2E=1 + diretório temporário). No Linux sem desktop: `xvfb-run -a npm run test:e2e`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure'
  }
});
