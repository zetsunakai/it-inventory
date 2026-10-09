import { execFileSync } from "node:child_process"

import { resetTestDatabase } from "../test-database"
import { TEST_DATABASE_URL } from "../test-env"
import { SEED_ENV } from "./accounts"

// Database tes dibuat ulang dari migrasi, lalu diisi lewat script seed yang sama
// dengan development, supaya alur instalasi pertama ikut teruji.
export default async function globalSetup() {
  await resetTestDatabase()
  execFileSync("npx", ["tsx", "src/server/db/seed.ts"], {
    env: { ...process.env, ...SEED_ENV, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  })
}
