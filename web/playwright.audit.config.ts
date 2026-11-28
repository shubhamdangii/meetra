import { defineConfig, devices } from "@playwright/test";

// Human audit of the LIVE site with QA_ accounts only: headed, slow motion, video for every step.
// Run: npx playwright test -c playwright.audit.config.ts   (seed QA data first; clean it up after)
const baseURL = (process.env.AUDIT_BASE_URL ?? "https://shubhamdangii.github.io/meetra/").replace(/\/?$/, "/");

export default defineConfig({
  testDir: "tests/audit",
  outputDir: "test-results/videos",
  timeout: 30 * 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL, headless: false, launchOptions: { slowMo: 150 }, video: "on", screenshot: "off", trace: "off", actionTimeout: 15_000, navigationTimeout: 45_000 },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1366, height: 860 } } },
  ],
});
