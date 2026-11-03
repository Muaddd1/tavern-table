import { defineConfig } from "@playwright/test";

// Set E2E_BASE to test a deployed site instead of a local build.
const live = process.env.E2E_BASE;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 360_000,
  expect: { timeout: live ? 15_000 : 5_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: live ?? "http://localhost:3461", viewport: { width: 1400, height: 950 } },
  webServer: live ? undefined : { command: "npx next start -p 3461", url: "http://localhost:3461", reuseExistingServer: true, timeout: 120_000 },
});
