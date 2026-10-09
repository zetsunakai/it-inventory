import { sql } from "drizzle-orm"
import { boolean, index, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { timestamps } from "./_columns"

const id = () =>
  uuid()
    .default(sql`gen_random_uuid()`)
    .primaryKey()

// Kategori satuan (PRD bagian 5.1): konversi hanya boleh antar satuan dalam kategori yang sama.
export const uomCategories = pgTable("uom_categories", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  active: boolean().notNull().default(true),
  ...timestamps,
})

// Satuan. factor = berapa satuan acuan dalam 1 satuan ini (acuan selalu 1), misalnya
// kategori Berat dengan acuan KG: G = 0,001 dan TON = 1000. Konversi lewat fungsi database
// convert_qty(); aturan lain di migrasi uoms_rules.
export const uoms = pgTable(
  "uoms",
  {
    id: id(),
    code: text().notNull().unique(),
    name: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => uomCategories.id, { onDelete: "restrict" }),
    factor: numeric({ precision: 24, scale: 10 }).notNull(),
    isReference: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("uoms_category_id_idx").on(table.categoryId),
    // Tepat satu satuan acuan per kategori.
    uniqueIndex("uoms_one_reference_per_category")
      .on(table.categoryId)
      .where(sql`${table.isReference}`),
  ],
)
