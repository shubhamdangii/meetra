import { defineConfig, devices } from "@playwright/test";

// Service worker tests: run with  npx playwright test -c playwright.sw.config.ts
// They need a built site in web/out (npm run build). They start their own fake GitHub Pages server, so nothing else has to run.
export default defineConfig({
  testDir: "tests/sw",
  outputDir: "test-results/sw",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "iphone-13", use: { ...devices["iPhone 13"] } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
});
