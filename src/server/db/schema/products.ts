import { sql } from "drizzle-orm"
import { boolean, index, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core"

import { timestamps } from "./_columns"
import { uoms } from "./uoms"
import { inventoryCategory } from "./warehouses"

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
  ],
)
