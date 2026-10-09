import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // "server-only" melempar error bila diimpor di luar React Server Components.
      // Di tes, kode server dijalankan langsung oleh Node, jadi pakai versi kosongnya.
      "server-only": fileURLToPath(new URL("node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // Tes yang butuh Postgres: fungsi dan trigger SQL, serta kode server yang menulis data.
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          globalSetup: ["tests/db/global-setup.ts"],
          setupFiles: ["tests/db/setup-env.ts"],
          // Semua file memakai satu database, jadi dijalankan bergantian.
          fileParallelism: false,
        },
      },
    ],
  },
})
