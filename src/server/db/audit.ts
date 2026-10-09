import "server-only"

import { sql } from "drizzle-orm"

import { db } from "."

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Jalankan perubahan data dalam satu transaksi dan catat pelakunya di audit log.
// app.user_id hanya berlaku sampai transaksi ini selesai (set_config ... true),
// jadi tidak bocor ke request lain yang memakai koneksi yang sama dari pool.
export async function withAuditUser<T>(
  userId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
    return fn(tx)
  })
}

export type { Transaction }
