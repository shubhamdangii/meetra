import { defineConfig, devices } from "@playwright/test";

// BASE_URL examples:
//   http://localhost:3000/meetra/                 (local)
//   https://shubhamdangii.github.io/meetra/       (deployed, default)
const baseURL = (process.env.BASE_URL ?? "https://shubhamdangii.github.io/meetra/").replace(/\/?$/, "/");

export default defineConfig({
  testDir: "tests/smoke",
  outputDir: "test-results/smoke",
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "iphone-13", use: { ...devices["iPhone 13"] } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
});
