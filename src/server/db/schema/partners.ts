import { sql } from "drizzle-orm"
import { boolean, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"

// Path relatif (bukan alias @/) karena schema juga dibaca oleh drizzle-kit dan script CLI.
import { IDENTITY_TYPES } from "../../../lib/partner"

import { timestamps } from "./_columns"

export const identityType = pgEnum("identity_type", IDENTITY_TYPES)

// Partner (PRD bagian 5.1): bisa dipakai sebagai vendor maupun customer (peran dihapus di RM-03).
// NITKU hanya untuk identitas NPWP (22 digit, diawali NPWP 16 digit). Aturan format di migrasi
// partners_rules. Kode partner dibuat database (PRT-000001) dan tidak ditampilkan.
export const partners = pgTable(
  "partners",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    code: text()
      .notNull()
      .unique()
      .default(sql`'PRT-' || lpad(nextval('partners_code_seq')::text, 6, '0')`),
    name: text().notNull(),
    address: text().notNull(),
    // Kode ref_codes jenis country.
    countryCode: text().notNull(),
    identityType: identityType().notNull(),
    identityNumber: text().notNull(),
    nitku: text(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("partners_name_idx").on(table.name),
    index("partners_identity_number_idx").on(table.identityNumber),
    // Satu NITKU satu partner (cabang berbeda punya NITKU berbeda).
    uniqueIndex("partners_nitku_unique")
      .on(table.nitku)
      .where(sql`${table.nitku} is not null`),
  ],
)
