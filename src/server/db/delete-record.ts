import "server-only"

import { eq } from "drizzle-orm"
import { DrizzleQueryError } from "drizzle-orm/errors"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

import { AppError } from "@/server/actions/app-error"

import type { Transaction } from "./audit"

// Hapus data master (backlog M1-08, PRD bagian 5): hanya data yang belum dipakai. Yang menolak
// adalah database sendiri: setiap foreign key ke tabel master memakai ON DELETE RESTRICT, jadi
// tabel transaksi (M2 dan seterusnya) otomatis ikut melindungi data yang sudah dipakainya.

// Nama tabel yang merujuk data master, untuk pesan "masih dipakai di data ...". Tambahkan tabel
// baru di sini saat dibuat; yang belum terdaftar tampil sebagai "data lain".
const REFERENCING_TABLES: Record<string, string> = {
  products: "produk",
  product_categories: "kategori produk",
  uoms: "satuan",
  locations: "lokasi",
}

export async function deleteUnlessUsed(
  tx: Transaction,
  table: PgTable,
  idColumn: PgColumn,
  id: string,
  // Kata benda dengan huruf besar di awal, mis. "Produk".
  noun: string,
) {
  try {
    const deleted = await tx.delete(table).where(eq(idColumn, id)).returning({ id: idColumn })
    if (!deleted.length) throw new AppError(`${noun} tidak ditemukan.`)
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : error
    const pgError = cause as { code?: string; table?: string } | undefined
    if (pgError?.code !== "23503") throw error
    const usedIn = REFERENCING_TABLES[pgError.table ?? ""] ?? "lain"
    throw new AppError(
      `${noun} ini masih dipakai di data ${usedIn}, jadi tidak bisa dihapus. Arsipkan saja supaya tidak muncul di pilihan baru.`,
    )
  }
}
