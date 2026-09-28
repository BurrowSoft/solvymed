import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Our users and schedules are in Brazil. Pin the zone so the timezone and
// day-boundary tests behave the same locally and in CI (runners are UTC).
process.env.TZ = 'America/Sao_Paulo';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    // e2e/ holds Playwright specs (run with `npx playwright test`); vitest
    // must not collect them.
    include: ['src/**/*.test.{ts,tsx}'],
    // next-intl's middleware imports "next/server" without an extension,
    // which Node's ESM loader can't resolve; let Vite resolve it (the
    // middleware tests).
    server: { deps: { inline: ['next-intl'] } },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
