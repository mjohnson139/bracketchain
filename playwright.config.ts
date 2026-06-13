import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Serve the built static output exactly as GitHub Pages would. The build
    // runs ahead of this (see the "e2e" npm script), so this only waits on
    // preview startup. Bind explicitly to 127.0.0.1: on some CI runners
    // `localhost` resolves to IPv6 ::1, which never matches an IPv4 probe.
    command: `npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
