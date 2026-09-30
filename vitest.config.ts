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
    // The full suite runs ~110 files in parallel; under that load a test that
    // takes under a second alone (app-map, pix-qr) sometimes passed the 5 s
    // default and failed. 15 s keeps those green without hiding a real hang.
    testTimeout: 15_000,
    // next-intl's middleware imports "next/server" without an extension,
    // which Node's ESM loader can't resolve; let Vite resolve it (the
    // middleware tests).
    server: { deps: { inline: ['next-intl'] } },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Next resolves "server-only" itself; tests use its empty module.
      'server-only': resolve(__dirname, './node_modules/next/dist/compiled/server-only/empty.js'),
    },
  },
});
