import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import prettier from "eslint-config-prettier/flat"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Batas modul (backlog S-01): satu app, tiga modul. src/app merakit semuanya. Base (komponen,
  // lib, hooks, server) tidak boleh bergantung pada modul domain; inventory tidak boleh bergantung
  // pada IT Inventory (seperti core_inventory tidak mengenal core_it_inventory di hmx). Skema
  // database adalah lapisan data bersama (satu database) dan boleh membaca konstanta modul.
  {
    files: ["src/components/**", "src/lib/**", "src/hooks/**", "src/server/**"],
    ignores: ["src/server/db/schema/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*", "@/app/*", "**/modules/*"],
              message:
                "Base tidak boleh mengimpor modul domain atau rute (S-01). Pindahkan kodenya ke modul, atau rakit di src/app.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/inventory/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/it-inventory/*", "@/app/*", "**/it-inventory/*"],
              message:
                "Modul inventory tidak boleh mengimpor IT Inventory atau rute (S-01). Rakit di src/app, atau pindahkan kodenya ke IT Inventory.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/it-inventory/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*"],
              message: "Modul IT Inventory tidak boleh mengimpor rute (S-01).",
            },
          ],
        },
      ],
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
