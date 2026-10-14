import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { timestamps } from "./_columns"
import { uoms } from "./uoms"
import { inventoryCategory } from "./warehouses"

// Kategori produk bertingkat (PRD bagian 5.1, backlog R-01), terpisah dari kategori IT Inventory
// di produk. Bila punya prefix kode, SKU produk baru yang dikosongkan dibuat database dari prefix
// + nomor urut kategori (trigger products_before_write). Aturan lain di migrasi
// product_categories_rules.
export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    name: text().notNull(),
    parentId: uuid().references((): AnyPgColumn => productCategories.id, {
      onDelete: "restrict",
    }),
    // Huruf besar, angka, "-" atau "/"; unik (tanpa membedakan huruf besar/kecil).
    codePrefix: text(),
    codeDigits: smallint().notNull().default(6),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [index("product_categories_parent_idx").on(table.parentId)],
)

// Produk (PRD bagian 5.1). Qty selalu disimpan dalam satuan stok (uom_id). Untuk dokumen BC
// produk butuh kode HS dan satuan CEISA beserta faktornya: 1 satuan stok = ceisa_factor
// satuan CEISA. customs_ready dihitung database dari ketiganya (PRD bagian 5.3).
export const products = pgTable(
  "products",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    sku: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    // Kategori produk (boleh kosong); kategori IT Inventory di kolom category.
    categoryId: uuid().references(() => productCategories.id, { onDelete: "restrict" }),
    category: inventoryCategory().notNull(),
    uomId: uuid()
      .notNull()
      .references(() => uoms.id, { onDelete: "restrict" }),
    // Kode ref_codes jenis hs_code dan ceisa_unit.
    hsCode: text(),
    ceisaUnitCode: text(),
    ceisaFactor: numeric({ precision: 24, scale: 10 }),
    // Kilogram per satuan stok.
    netWeight: numeric({ precision: 18, scale: 6 }),
    brand: text(),
    model: text(),
    size: text(),
    lotRequired: boolean().notNull().default(false),
    customsReady: boolean()
      .notNull()
      .generatedAlwaysAs(
        sql`hs_code is not null and ceisa_unit_code is not null and ceisa_factor is not null`,
      ),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("products_name_idx").on(table.name),
    index("products_category_idx").on(table.category),
    index("products_category_id_idx").on(table.categoryId),
  ],
)
