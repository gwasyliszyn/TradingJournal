import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Tests read Supabase credentials from process.env (SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). Load them from .env.test —
// which is gitignored and holds test-project keys, never production secrets.
dotenv.config({ path: ".env.test" });

// Corporate Zscaler proxy re-signs all TLS traffic; Node's fetch rejects its
// certificate (UNABLE_TO_GET_ISSUER_CERT_LOCALLY). zscaler-ca.pem (gitignored,
// machine-specific) holds the proxy CA chain. Setting it here propagates to
// test workers and the webServer child process — both spawn after this config
// runs — so Supabase calls from tests and the dev server verify TLS correctly.
const zscalerCa = resolve(import.meta.dirname, "zscaler-ca.pem");
if (existsSync(zscalerCa)) {
  process.env.NODE_EXTRA_CA_CERTS ??= zscalerCa;
}

const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",

  // Existing specs share a single TEST_USER and clear "today's" rows in
  // beforeEach/afterEach. Parallel workers would race on the same DB rows, so
  // the suite runs serially until tests are isolated with unique per-test data.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [
    {
      // Signs in once via the UI and saves playwright/.auth/user.json;
      // chromium depends on it, so specs start already authenticated.
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "chromium",
      // Use the system-installed Google Chrome instead of Playwright's bundled
      // Chromium — the bundled download is blocked by the corporate TLS proxy
      // (UNABLE_TO_GET_ISSUER_CERT_LOCALLY). Swap back to devices["Desktop Chrome"]
      // without `channel` once `npx playwright install chromium` can run.
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // E2E=1 turns off the Astro dev toolbar (see astro.config.mjs) — it would
    // otherwise intercept the clicks tests aim at the page.
    env: { E2E: "1" },
  },
});
