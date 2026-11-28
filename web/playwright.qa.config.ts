import { defineConfig, devices } from "@playwright/test";

// QA suite: runs against a LOCAL build of the site that talks to the live project with QA_ data (see tests/qa/build-test-site.mjs).
// Override the site with QA_BASE_URL only to point at another copy of the site.
const baseURL = (process.env.QA_BASE_URL ?? "http://localhost:3100/meetra/").replace(/\/?$/, "/");
const dev = { iphone: devices["iPhone 13"], pixel: devices["Pixel 7"], desktop: devices["Desktop Chrome"] };

export default defineConfig({
  testDir: "tests/qa",
  testMatch: /.*\.spec\.ts/,
  outputDir: "test-results/qa",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 2,
  reporter: [["list"], ["json", { outputFile: "test-results/qa/report.json" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: process.env.QA_BASE_URL ? undefined : { command: "node tests/qa/serve.mjs", url: baseURL, reuseExistingServer: true, timeout: 30_000 },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...dev.desktop } },
    { name: "iphone-13", use: { ...dev.iphone }, dependencies: ["setup"], testIgnore: /auth\.setup\.ts/ },
    { name: "pixel-7", use: { ...dev.pixel }, dependencies: ["setup"], testIgnore: /auth\.setup\.ts/ },
    { name: "desktop-chrome", use: { ...dev.desktop }, dependencies: ["setup"], testIgnore: /auth\.setup\.ts/ },
  ],
});
