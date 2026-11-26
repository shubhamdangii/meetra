import { defineConfig, devices } from "@playwright/test";

// Browser: the Playwright build if installed, else the machine's Chrome/Edge (PW_CHANNEL=chrome|msedge to force one).
const channel = process.env.PW_CHANNEL ?? "chrome";

// UI tests run against the deployed site (or BASE_URL, e.g. a local `npm start` on :3000/meetra).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 1,
  reporter: [["list"]],
  use: { channel, baseURL: process.env.BASE_URL ?? "https://shubhamdangii.github.io/meetra/", trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
