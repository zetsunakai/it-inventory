import { defineConfig, devices } from "@playwright/test"

import { TEST_DATABASE_URL } from "./tests/test-env"

// Port terpisah dari `npm run dev` (3000), jadi e2e bisa jalan walaupun server
// development sedang menyala.
const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build production, sesuai saran dokumentasi Next.js untuk e2e.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      // Hanya untuk server tes, bukan rahasia.
      BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
    },
  },
})
