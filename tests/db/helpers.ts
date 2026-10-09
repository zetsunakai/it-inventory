import { sql } from "drizzle-orm"
import { DrizzleQueryError, TransactionRollbackError } from "drizzle-orm/errors"

import type { Db } from "@/server/db/client"

type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

// Jalankan fn di dalam transaksi yang selalu di-rollback, supaya setiap tes
// mulai dari database yang sama dan tidak meninggalkan data.
export async function inRollback(db: Db, fn: (tx: Transaction) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx)
      tx.rollback()
    })
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error
  }
}

// Isi app.user_id seperti yang dilakukan withAuditUser() di aplikasi.
export async function setAuditUser(tx: Transaction, userId: string) {
  await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
}

// Pesan asli dari Postgres untuk query yang diharapkan gagal.
export async function pgErrorMessage(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : error
    return cause instanceof Error ? cause.message : String(cause)
  }
  throw new Error("Query seharusnya gagal, tapi berhasil.")
}
