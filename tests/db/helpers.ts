import { sql } from "drizzle-orm"
import { DrizzleQueryError, TransactionRollbackError } from "drizzle-orm/errors"

import type { Db } from "@/server/db/client"
import { transferLines } from "@/server/db/schema"

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

// Seperti pgErrorMessage, tapi di dalam savepoint: transaksi tes tetap bisa dipakai setelah query
// yang gagal, jadi beberapa pelanggaran bisa diuji berurutan di satu transaksi.
export async function pgErrorInSavepoint(
  tx: Transaction,
  fn: (savepoint: Transaction) => Promise<unknown>,
) {
  return pgErrorMessage(
    tx.transaction(async (savepoint) => {
      await fn(savepoint)
    }),
  )
}

// Izinkan tulisan langsung ke ledger di transaksi tes ini, seperti yang dilakukan
// validate_transfer(). Untuk menyiapkan data Selesai tanpa melewati validasi.
export async function enableLedgerWrite(tx: Transaction) {
  await tx.execute(sql`select set_config('app.ledger_write', 'on', true)`)
}

// Hapus data inventory milik produk uji yang sudah tersimpan (termasuk yang Selesai, yang
// biasanya dikunci trigger). Hanya untuk membersihkan tes: semua trigger dimatikan sementara
// (butuh user superuser, seperti di database tes Docker), jadi urutannya harus anak dulu.
export async function purgeInventory(db: Db, productIds: string[]) {
  if (!productIds.length) return
  const ids = sql.join(
    productIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`)
    await tx.execute(sql`delete from stock_balances where product_id in (${ids})`)
    await tx.execute(sql`
      create temporary table purged_transfers on commit drop as
      select transfer_id as id from stock_moves where product_id in (${ids})
      union
      select transfer_id from transfer_lines where product_id in (${ids})`)
    await tx.execute(
      sql`delete from stock_moves where transfer_id in (select id from purged_transfers)`,
    )
    await tx.execute(
      sql`delete from transfer_lines where transfer_id in (select id from purged_transfers)`,
    )
    // Permintaan retur (R-11) milik transfer yang dihapus. Mode replica mematikan FK cascade,
    // jadi barisnya dihapus sendiri.
    await tx.execute(sql`
      create temporary table purged_returns on commit drop as
      select id from return_requests where origin_id in (select id from purged_transfers)
      union
      select return_request_id from return_request_lines where product_id in (${ids})`)
    await tx.execute(sql`
      delete from return_request_lines
      where return_request_id in (select id from purged_returns)`)
    await tx.execute(sql`delete from return_requests where id in (select id from purged_returns)`)
    await tx.execute(sql`delete from transfers where id in (select id from purged_transfers)`)
    await tx.execute(sql`delete from lots where product_id in (${ids})`)
    await tx.execute(sql`
      delete from number_sequences
      where scope in (select 'lot:' || id from unnest(array[${ids}]) as id)`)
  })
}

// Baris pergerakan untuk tes yang menulis stock_moves langsung: buat dulu baris permintaannya
// (R-05) dengan produk, qty, dan satuan yang sama, lalu kembalikan nilai move beserta line_id.
export async function withLine<
  T extends {
    transferId: string
    productId: string
    inputQty: string
    inputUomId: string
    position?: number
  },
>(tx: Pick<Transaction, "insert">, move: T): Promise<T & { lineId: string }> {
  const [line] = await tx
    .insert(transferLines)
    .values({
      transferId: move.transferId,
      productId: move.productId,
      inputQty: move.inputQty,
      inputUomId: move.inputUomId,
      position: move.position ?? 0,
    })
    .returning({ id: transferLines.id })
  return { ...move, lineId: line.id }
}

// Permintaan retur Draft untuk transfer asal (R-11): transfer retur hanya bisa dibuat dengan
// return_request_id. Lokasinya sisi gudang transfer asal.
export async function returnRequestFor(tx: Pick<Transaction, "execute">, originId: string) {
  const result = await tx.execute<{ id: string }>(sql`
    insert into return_requests (type, origin_id, partner_id, location_id)
    select case o.type when 'receipt' then 'vendor' else 'customer' end::return_request_type,
      o.id, o.partner_id,
      case o.type when 'receipt' then o.destination_location_id else o.source_location_id end
    from transfers o where o.id = ${originId}
    returning id`)
  return result.rows[0].id
}
