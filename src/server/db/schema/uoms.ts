import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { timestamps } from "./_columns"
import { products } from "./products"

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
// convert_qty(); aturan lain di migrasi uoms_rules dan product_uoms_rules.
//
// Satuan umum (product_id kosong) berlaku untuk semua produk; satuan khusus produk (backlog R-03,
// mis. 1 BOX = 24 PCS hanya untuk produk A) hanya bisa dipakai produk itu. Kode unik per lingkup.
export const uoms = pgTable(
  "uoms",
  {
    id: id(),
    code: text().notNull(),
    name: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => uomCategories.id, { onDelete: "restrict" }),
    factor: numeric({ precision: 24, scale: 10 }).notNull(),
    isReference: boolean().notNull().default(false),
    productId: uuid().references((): AnyPgColumn => products.id, { onDelete: "restrict" }),
    // Hasil konversi ke satuan ini dibulatkan ke kelipatan nilai ini (convert_qty).
    rounding: numeric({ precision: 18, scale: 4 }).notNull().default("0.0001"),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("uoms_category_id_idx").on(table.categoryId),
    uniqueIndex("uoms_code_global_unique")
      .on(table.code)
      .where(sql`${table.productId} is null`),
    uniqueIndex("uoms_code_product_unique")
      .on(table.productId, table.code)
      .where(sql`${table.productId} is not null`),
    // Tepat satu satuan acuan per kategori.
    uniqueIndex("uoms_one_reference_per_category")
      .on(table.categoryId)
      .where(sql`${table.isReference}`),
  ],
)
