import { sql } from "drizzle-orm"
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

// Path relatif (bukan alias @/) karena schema juga dibaca oleh drizzle-kit dan script CLI.
import { STOCK_MOVE_STATUSES, TRANSFER_STATUSES, TRANSFER_TYPES } from "../../../lib/inventory"

import { timestamps } from "./_columns"
import { partners } from "./partners"
import { products } from "./products"
import { uoms } from "./uoms"
import { inventoryCategory, locations, warehouses } from "./warehouses"

// Inventory inti (PRD bagian 6 dan 13). Semua stok dihitung dari stock_moves (ledger) berstatus
// done. stock_balances hanya ringkasan yang di-update di transaksi yang sama oleh fungsi
// validate_transfer() (M2-02), bukan oleh kode aplikasi. Aturan lain ada di migrasi
// inventory_rules.

const id = () =>
  uuid()
    .default(sql`gen_random_uuid()`)
    .primaryKey()

// Qty selalu numeric(18,4) dalam satuan stok produk (PRD bagian 13.1).
const qty = () => numeric({ precision: 18, scale: 4 })

export const transferType = pgEnum("transfer_type", TRANSFER_TYPES)
export const transferStatus = pgEnum("transfer_status", TRANSFER_STATUSES)
export const stockMoveStatus = pgEnum("stock_move_status", STOCK_MOVE_STATUSES)

// Penghitung nomor per lingkup dan periode, mis. ("transfer:receipt", "2026"). Dipakai fungsi
// next_number() supaya nomor unik walaupun dibuat bersamaan; nanti juga untuk nomor aju (M3).
export const numberSequences = pgTable(
  "number_sequences",
  {
    scope: text().notNull(),
    period: text().notNull(),
    lastValue: integer().notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.scope, table.period] })],
)

// Lot/batch per produk. Nomornya unik per produk.
export const lots = pgTable(
  "lots",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [
    unique("lots_product_name_unique").on(table.productId, table.name),
    check("lots_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
)

// Transfer: dokumen operasional (penerimaan, pengiriman, dst.) berisi satu atau lebih baris
// barang. Nomor dibuat database saat insert. Kolom *_by diisi trigger dari app.user_id dan sengaja
// tanpa foreign key, sama seperti audit_logs.
export const transfers = pgTable(
  "transfers",
  {
    id: id(),
    // Diisi trigger saat insert (kosong = buat nomor baru).
    number: text().notNull().unique().default(""),
    type: transferType().notNull(),
    status: transferStatus().notNull().default("draft"),
    sourceLocationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    destinationLocationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    // Vendor (penerimaan) atau customer (pengiriman); retur mengikuti transfer asalnya.
    partnerId: uuid().references(() => partners.id, { onDelete: "restrict" }),
    // Tanggal rencana; tanggal efektif stok adalah done_at (PRD bagian 6.4).
    scheduledDate: date(),
    // Referensi PO/SO atau dokumen lain (PRD bagian 2: tanpa modul pembelian/penjualan).
    reference: text(),
    notes: text(),
    // Alasan scrap dan penyesuaian (wajib untuk keduanya, dicek saat validasi).
    reason: text(),
    returnOfId: uuid().references((): AnyPgColumn => transfers.id, { onDelete: "restrict" }),
    backorderOfId: uuid().references((): AnyPgColumn => transfers.id, { onDelete: "restrict" }),
    doneAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    approvedAt: timestamp({ withTimezone: true }),
    createdBy: uuid(),
    approvedBy: uuid(),
    doneBy: uuid(),
    ...timestamps,
  },
  (table) => [
    index("transfers_type_status_idx").on(table.type, table.status),
    index("transfers_source_location_idx").on(table.sourceLocationId),
    index("transfers_destination_location_idx").on(table.destinationLocationId),
    index("transfers_partner_idx").on(table.partnerId),
    index("transfers_return_of_idx").on(table.returnOfId),
    index("transfers_backorder_of_idx").on(table.backorderOfId),
    index("transfers_done_at_idx").on(table.doneAt),
    check(
      "transfers_locations_differ",
      sql`${table.sourceLocationId} <> ${table.destinationLocationId}`,
    ),
    check(
      "transfers_done_has_date",
      sql`(${table.status} = 'done') = (${table.doneAt} is not null)`,
    ),
    check(
      "transfers_cancelled_has_date",
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} is not null)`,
    ),
    check(
      "transfers_partner_required",
      sql`${table.type} not in ('receipt', 'delivery', 'return') or ${table.partnerId} is not null`,
    ),
    check(
      "transfers_return_has_origin",
      sql`(${table.type} = 'return') = (${table.returnOfId} is not null)`,
    ),
  ],
)

// Ledger pergerakan stok: satu baris = satu produk/lot dari satu lokasi ke lokasi lain.
// qty dalam satuan stok produk, dihitung database dari input_qty + input_uom_id (convert_qty).
// Kategori produk dan gudang disalin saat validasi supaya laporan periode lama tidak berubah
// (PRD bagian 9.2) dan laporan per gudang tidak perlu join lokasi.
export const stockMoves = pgTable(
  "stock_moves",
  {
    id: id(),
    transferId: uuid()
      .notNull()
      .references(() => transfers.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    lotId: uuid().references(() => lots.id, { onDelete: "restrict" }),
    status: stockMoveStatus().notNull().default("draft"),
    inputQty: qty().notNull(),
    inputUomId: uuid()
      .notNull()
      .references(() => uoms.id, { onDelete: "restrict" }),
    // Diisi trigger dari input_qty dan input_uom_id.
    qty: qty().notNull().default("0"),
    sourceLocationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    destinationLocationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    sourceWarehouseId: uuid().references(() => warehouses.id, { onDelete: "restrict" }),
    destinationWarehouseId: uuid().references(() => warehouses.id, { onDelete: "restrict" }),
    category: inventoryCategory(),
    doneAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("stock_moves_transfer_idx").on(table.transferId),
    index("stock_moves_product_done_at_idx").on(table.productId, table.doneAt),
    index("stock_moves_lot_idx").on(table.lotId),
    index("stock_moves_source_location_idx").on(table.sourceLocationId),
    index("stock_moves_destination_location_idx").on(table.destinationLocationId),
    // Laporan mutasi per gudang dan periode (PRD bagian 9).
    index("stock_moves_source_warehouse_done_at_idx").on(table.sourceWarehouseId, table.doneAt),
    index("stock_moves_destination_warehouse_done_at_idx").on(
      table.destinationWarehouseId,
      table.doneAt,
    ),
    check("stock_moves_qty_positive", sql`${table.inputQty} > 0 and ${table.qty} > 0`),
    check(
      "stock_moves_locations_differ",
      sql`${table.sourceLocationId} <> ${table.destinationLocationId}`,
    ),
    check(
      "stock_moves_done_complete",
      sql`${table.status} <> 'done' or (${table.doneAt} is not null and ${table.category} is not null)`,
    ),
  ],
)

// Saldo terkini per produk × lokasi × lot. Lot kosong dihitung sebagai satu nilai (NULLS NOT
// DISTINCT). Sumber kebenaran tetap stock_moves; tabel ini hanya ditulis validate_transfer().
export const stockBalances = pgTable(
  "stock_balances",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    locationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    lotId: uuid().references(() => lots.id, { onDelete: "restrict" }),
    warehouseId: uuid().references(() => warehouses.id, { onDelete: "restrict" }),
    qty: qty().notNull().default("0"),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("stock_balances_product_location_lot_unique")
      .on(table.productId, table.locationId, table.lotId)
      .nullsNotDistinct(),
    index("stock_balances_location_idx").on(table.locationId),
    index("stock_balances_warehouse_idx").on(table.warehouseId),
  ],
)
