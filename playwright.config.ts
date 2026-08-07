import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.APP_URL ?? `http://localhost:${PORT}`;

/**
 * Some sandboxes and CI images ship a prebuilt Chromium that does not match the
 * revision this Playwright version would download. Pointing
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at that binary lets the suite run there
 * without pinning an environment-specific path into the repository. Left unset,
 * Playwright resolves its own managed browser as usual.
 */
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",

  use: {
    baseURL,
    trace: "on-first-retry",
    ...(chromiumExecutable
      ? { launchOptions: { executablePath: chromiumExecutable } }
      : {}),
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // A production build in CI so the smoke test exercises what actually ships;
    // the dev server locally so the suite does not pay for a full build.
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { APP_URL: baseURL },
  },
});
