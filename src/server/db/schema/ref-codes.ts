import { sql } from "drizzle-orm"
import { boolean, index, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core"

// Path relatif (bukan alias @/) karena schema juga dibaca oleh drizzle-kit dan script CLI.
import { REF_CODE_TYPES } from "../../../lib/ref-codes"

import { timestamps } from "./_columns"

export const refCodeType = pgEnum("ref_code_type", REF_CODE_TYPES)

// Referensi kepabeanan (PRD bagian 5.2): pasangan kode + nama per jenis.
// Diisi dari CSV saat seed, hanya Administrator yang boleh menambah atau mengubah.
// Tidak pernah dihapus; yang tidak dipakai lagi diarsipkan (active = false).
export const refCodes = pgTable(
  "ref_codes",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    type: refCodeType().notNull(),
    code: text().notNull(),
    name: text().notNull(),
    // Kode induk untuk jenis yang kodenya hanya unik per induk
    // (lihat REF_CODE_PARENT_TYPES), kosong untuk jenis lain.
    parentCode: text(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    // NULLS NOT DISTINCT: jenis tanpa induk tetap unik per (type, code).
    unique("ref_codes_type_parent_code_code_key")
      .on(table.type, table.parentCode, table.code)
      .nullsNotDistinct(),
    index("ref_codes_type_code_idx").on(table.type, table.code),
  ],
)
