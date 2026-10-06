import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3000";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Both patterns are anchored on e2e/smoke: they see the absolute path, so
    // a checkout under a folder named "…smoke" matched every spec (53).
    { name: "chromium", testIgnore: /e2e[\\/]smoke[\\/]/, use: { ...devices["Desktop Chrome"] } },
    // The smoke suite (e2e/smoke, e7): run against a Preview or www with
    // E2E_BASE_URL=<url> npx playwright test --project=smoke
    // No trace: it records every fill() value, the test password included
    // (screenshots stay; a password field renders masked).
    { name: "smoke", testMatch: /e2e[\\/]smoke[\\/].*\.spec\.ts$/, use: { ...devices["Desktop Chrome"], trace: "off" } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
