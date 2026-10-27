import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import prettier from "eslint-config-prettier/flat"
import { moduleBoundaries } from "./scripts/eslint-boundaries.mjs"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Batas modul (backlog S-01): satu app, tiga modul. src/app merakit semuanya. Base (komponen,
  // lib, hooks, server) tidak boleh bergantung pada modul domain; inventory tidak boleh bergantung
  // pada IT Inventory (seperti core_inventory tidak mengenal core_it_inventory di hmx). Skema
  // database adalah lapisan data bersama (satu database) dan boleh membaca konstanta modul.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      architecture: { rules: { "module-boundaries": moduleBoundaries } },
    },
    rules: {
      "architecture/module-boundaries": "error",
    },
  },
  // Matikan aturan format yang bentrok dengan Prettier. Harus paling akhir.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Hasil Playwright.
    "test-results/**",
    "playwright-report/**",
  ]),
])

export default eslintConfig
