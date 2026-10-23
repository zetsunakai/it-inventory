import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
    // Mengaktifkan forbidden() untuk halaman 403 saat peran tidak punya izin.
    authInterrupts: true,
    serverActions: {
      // Import master data (M1-07): file maksimal 5 MB (MAX_IMPORT_BYTES di
      // src/server/spreadsheet.ts) ditambah ruang untuk pembungkus multipart.
      bodySizeLimit: "6mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
