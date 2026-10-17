import "server-only"

import { localStorage } from "./local"
import { s3Storage } from "./s3"
import type { Storage } from "./types"

// Modul penyimpanan file (PRD bagian 7.6 dan 12.4, backlog M3-10). Semua file aplikasi (lampiran
// dokumen BC, nanti juga yang lain) lewat sini: folder lokal saat development, object storage
// S3-compatible di staging/production. Pemilihnya STORAGE_DRIVER (local | s3).

export type { Storage, StoredFile } from "./types"
export { assertSafeKey } from "./types"

let instance: Storage | undefined

export function getStorage(): Storage {
  if (instance) return instance
  const driver = process.env.STORAGE_DRIVER ?? "local"
  if (driver === "s3") {
    const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]
    const missing = required.filter((name) => !process.env[name])
    if (missing.length) throw new Error(`Storage S3 belum diatur: ${missing.join(", ")}.`)
    instance = s3Storage({
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION ?? "us-east-1",
      bucket: process.env.S3_BUCKET!,
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    })
  } else if (driver === "local") {
    instance = localStorage(process.env.STORAGE_DIR ?? ".storage")
  } else {
    throw new Error(`STORAGE_DRIVER tidak dikenal: ${driver}.`)
  }
  return instance
}
