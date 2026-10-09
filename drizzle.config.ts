import { loadEnvConfig } from "@next/env"
import { defineConfig } from "drizzle-kit"

// Muat .env* dengan aturan yang sama seperti Next.js.
loadEnvConfig(process.cwd())

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error("DATABASE_URL belum diatur. Salin .env.example ke .env.local.")
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
