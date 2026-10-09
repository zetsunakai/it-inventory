import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

// Path relatif (bukan alias @/) karena schema juga dibaca oleh drizzle-kit dan script CLI.
import { INVENTORY_CATEGORIES, LOCATION_TYPES } from "../../../lib/inventory"

import { timestamps } from "./_columns"
import { users } from "./auth"

const id = () =>
  uuid()
    .default(sql`gen_random_uuid()`)
    .primaryKey()

export const inventoryCategory = pgEnum("inventory_category", INVENTORY_CATEGORIES)
export const locationType = pgEnum("location_type", LOCATION_TYPES)

// Gudang (PRD bagian 5.1). is_bonded menentukan apakah pergerakan di gudang ini
// wajib punya dokumen BC (bagian 8). Tidak dihapus; yang tidak dipakai diarsipkan.
export const warehouses = pgTable("warehouses", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  address: text().notNull(),
  isBonded: boolean().notNull(),
  category: inventoryCategory().notNull(),
  active: boolean().notNull().default(true),
  ...timestamps,
})

// Lokasi: hierarki di dalam gudang, atau lokasi virtual (tanpa gudang) sebagai
// asal/tujuan pergerakan. Aturan tipe, induk, dan kolom yang tidak bisa diubah ada
// di migrasi locations_rules.
export const locations = pgTable(
  "locations",
  {
    id: id(),
    code: text().notNull().unique(),
    name: text().notNull(),
    type: locationType().notNull(),
    warehouseId: uuid().references(() => warehouses.id, { onDelete: "restrict" }),
    parentId: uuid().references((): AnyPgColumn => locations.id, { onDelete: "restrict" }),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("locations_warehouse_id_idx").on(table.warehouseId),
    index("locations_parent_id_idx").on(table.parentId),
  ],
)

// Akses gudang per user (PRD bagian 3). Peran di ALL_WAREHOUSE_ROLES tidak perlu baris di sini.
export const userWarehouses = pgTable(
  "user_warehouses",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.warehouseId] })],
)

// Jalur lengkap tiap lokasi, misalnya "GB1/RAK-A/BIN-01". View rekursif, dibuat di migrasi.
export const locationPaths = pgView("location_paths", {
  id: uuid().notNull(),
  path: text().notNull(),
  depth: integer().notNull(),
}).existing()
