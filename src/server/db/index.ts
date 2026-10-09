import "server-only"

import { createDb } from "./client"

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error("DATABASE_URL belum diatur. Salin .env.example ke .env.local.")
}

// Simpan koneksi di globalThis supaya hot reload di development
// tidak membuka pool baru setiap kali file berubah.
const globalForDb = globalThis as unknown as { appDb?: ReturnType<typeof createDb> }
const connection = globalForDb.appDb ?? createDb(url)
if (process.env.NODE_ENV !== "production") globalForDb.appDb = connection

export const db = connection.db
export type { Db } from "./client"
