import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 360_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3461", viewport: { width: 1400, height: 950 } },
  webServer: { command: "npx next start -p 3461", url: "http://localhost:3461", reuseExistingServer: true, timeout: 120_000 },
});
