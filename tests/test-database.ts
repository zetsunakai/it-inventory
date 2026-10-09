import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"

import { TEST_DATABASE_URL } from "./test-env"

// Siapkan database tes dari nol: buat database bila belum ada, kosongkan semua
// schema, lalu jalankan semua migrasi di drizzle/. Sekaligus membuktikan bahwa
// migrasi berhasil dari database kosong (Definisi Selesai di backlog).
//
// Schema yang dikosongkan, bukan database yang di-drop, supaya koneksi server
// e2e yang mungkin sudah terbuka tetap hidup.
export async function resetTestDatabase(url = TEST_DATABASE_URL) {
  const name = decodeURIComponent(new URL(url).pathname.slice(1))
  if (!name.endsWith("_test")) {
    throw new Error(`Database tes harus berakhiran _test, bukan "${name}". Cek TEST_DATABASE_URL.`)
  }

  const maintenanceUrl = new URL(url)
  maintenanceUrl.pathname = "/postgres"
  const maintenance = new Client({ connectionString: maintenanceUrl.toString() })
  await maintenance.connect()
  try {
    const existing = await maintenance.query("select 1 from pg_database where datname = $1", [name])
    if (!existing.rowCount) {
      await maintenance.query(`create database "${name.replaceAll('"', '""')}"`)
    }
  } finally {
    await maintenance.end()
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(
      "drop schema if exists drizzle cascade; drop schema public cascade; create schema public;",
    )
    await migrate(drizzle({ client }), { migrationsFolder: "drizzle" })
  } finally {
    await client.end()
  }
}
