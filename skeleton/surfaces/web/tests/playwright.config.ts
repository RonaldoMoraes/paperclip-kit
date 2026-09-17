import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { BASE_URL } from "./config/base-url";

dotenv.config({ path: resolve(__dirname, ".env") });

/**
 * Hermetic by default: the fixture answers every /api call from the contract handlers
 * (`shared/contracts/mocks.ts`), the same list the app runs in mock mode.
 * E2E_API_MODE=live skips fail-closed routing (local only — not CI).
 */
export default defineConfig({
  fullyParallel: true,
  // Default (undefined) is Playwright's 50% of cores. PW_WORKERS raises it for a full-suite
  // run on an otherwise idle machine; leave unset under concurrent load — more workers on a
  // saturated machine trade speed for flakes.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  outputDir: resolve(__dirname, ".artifacts"),
  reporter: [["list"], ["html", { open: "never", outputFolder: resolve(__dirname, "playwright-report") }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 430, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "Web - Contract",
      testDir: resolve(__dirname, "specs/web/contract"),
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Web - Smoke",
      testDir: resolve(__dirname, "specs/web/smoke"),
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Web - Regression",
      testDir: resolve(__dirname, "specs/web/regression"),
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // The web app WITHOUT mock mode, on the port BASE_URL names. The fixture answers every
    // `/api` call at the browser's edge (`page.route`); an in-page msw worker
    // (`VITE_API_MODE=mock`) would answer first and bypass it — `api.mock()` overrides and
    // the fail-closed check would silently stop working. No server is needed and none is
    // started: nothing reaches the `/api` proxy. `--port` follows BASE_URL so a machine
    // driving several checkouts gives each its own port through one variable.
    command: `yarn --cwd .. dev:client --port ${new URL(BASE_URL).port || "5173"}`,
    cwd: __dirname,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
