import "server-only"

import { sql, type SQL } from "drizzle-orm"

import type { InventoryCategory, MovementCode, TransferType, UsageType } from "@/lib/inventory"
import type { ListParams } from "@/lib/list-params"
import { db } from "@/server/db"
import { containsPattern } from "@/server/db/sql-helpers"

// Tampilan stok (backlog M2-11). Saldo sekarang dibaca dari stock_balances; saldo per tanggal
// dihitung dari ledger lewat stock_on_hand(). Hanya lokasi gudang (internal) yang boleh dilihat
// user; lokasi virtual (vendor, customer, dst.) bukan stok.

export type StockRow = {
  productId: string
  sku: string
  productName: string
  category: InventoryCategory
  uomCode: string
  warehouseId: string
  warehouseCode: string
  locationPath: string
  lotId: string | null
  lotName: string | null
  qty: string
  // Dipesan transfer yang sudah dikonfirmasi (R-07, R-14); kosong untuk saldo per tanggal.
  reservedQty: string | null
}

export async function listStock({
  userId,
  search,
  warehouseId,
  date,
  pageSize,
  offset,
}: ListParams & {
  userId: string
  warehouseId?: string
  // YYYY-MM-DD: saldo per akhir hari itu (WIB). Kosong = sekarang.
  date?: string
}) {
  const source = date
    ? sql`(select *, null::numeric as reserved_qty from stock_on_hand(end_of_day(${date}::date)))`
    : sql`(select product_id, location_id, lot_id, qty, reserved_qty
        from stock_balances where qty <> 0)`
  const conditions: SQL[] = [sql`can_access_warehouse(${userId}, w.id)`]
  if (warehouseId) conditions.push(sql`w.id = ${warehouseId}`)
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(sql`(p.sku ilike ${pattern} or p.name ilike ${pattern})`)
  }
  const where = sql.join(conditions, sql` and `)
  const from = sql`
    from ${source} s
    join products p on p.id = s.product_id
    join uoms u on u.id = p.uom_id
    join locations l on l.id = s.location_id
    join warehouses w on w.id = l.warehouse_id
    join location_paths lp on lp.id = l.id
    left join lots lot on lot.id = s.lot_id
    where ${where}`

  const [rows, totals] = await Promise.all([
    db.execute<{
      product_id: string
      sku: string
      product_name: string
      category: InventoryCategory
      uom_code: string
      warehouse_id: string
      warehouse_code: string
      location_path: string
      lot_id: string | null
      lot_name: string | null
      qty: string
      reserved_qty: string | null
    }>(sql`
      select p.id as product_id, p.sku, p.name as product_name, p.category, u.code as uom_code,
        w.id as warehouse_id, w.code as warehouse_code, lp.path as location_path,
        lot.id as lot_id, lot.name as lot_name, s.qty::numeric(18,4)::text as qty,
        s.reserved_qty::numeric(18,4)::text as reserved_qty
      ${from}
      order by p.sku, lp.path, lot.name nulls first
      limit ${pageSize} offset ${offset}`),
    db.execute<{ total: number }>(sql`select count(*)::int as total ${from}`),
  ])
  return {
    rows: rows.rows.map((row): StockRow => ({
      productId: row.product_id,
      sku: row.sku,
      productName: row.product_name,
      category: row.category,
      uomCode: row.uom_code,
      warehouseId: row.warehouse_id,
      warehouseCode: row.warehouse_code,
      locationPath: row.location_path,
      lotId: row.lot_id,
      lotName: row.lot_name,
      qty: row.qty,
      reservedQty: row.reserved_qty,
    })),
    total: totals.rows[0]?.total ?? 0,
  }
}

export type WarehouseChoice = { id: string; code: string; name: string }

// Gudang aktif yang boleh dilihat user, untuk filter.
export async function listAccessibleWarehouses(userId: string): Promise<WarehouseChoice[]> {
  const result = await db.execute<WarehouseChoice>(sql`
    select id, code, name from warehouses
    where active and can_access_warehouse(${userId}, id)
    order by code`)
  return result.rows
}

export type StockCardLine = {
  moveId: string
  transferId: string
  transferNumber: string
  transferType: TransferType
  movementCode: MovementCode
  usageType: UsageType | null
  doneAt: Date
  sourcePath: string
  destinationPath: string
  lotId: string | null
  lotName: string | null
  inQty: string
  outQty: string
  balance: string
}

// Kartu stok satu produk di satu gudang (PRD bagian 6.1): saldo awal sebelum `from`, lalu setiap
// pergerakan Selesai yang masuk ke atau keluar dari gudang itu sampai akhir `to`, dengan saldo
// berjalan. Perpindahan antar lokasi di dalam gudang yang sama tidak mengubah saldo gudang, tapi
// tetap tampil supaya jejak lokasi terlihat.
export async function stockCard({
  productId,
  warehouseId,
  from,
  to,
}: {
  productId: string
  warehouseId: string
  from: string
  to: string
}) {
  const result = await db.execute<{
    opening: string
    move_id: string | null
    transfer_id: string
    transfer_number: string
    transfer_type: TransferType
    movement_code: MovementCode
    usage_type: UsageType | null
    done_at: string
    source_path: string
    destination_path: string
    lot_id: string | null
    lot_name: string | null
    in_qty: string
    out_qty: string
    balance: string
  }>(sql`
    with scoped as (
      select m.id, m.transfer_id, m.done_at, m.lot_id, m.movement_code, m.source_location_id,
        m.destination_location_id,
        case when m.destination_warehouse_id = ${warehouseId} then m.qty else 0 end as in_qty,
        case when m.source_warehouse_id = ${warehouseId} then m.qty else 0 end as out_qty
      from stock_moves m
      where m.product_id = ${productId} and m.status = 'done'
        and (m.source_warehouse_id = ${warehouseId} or m.destination_warehouse_id = ${warehouseId})
    ),
    opening as (
      select coalesce(sum(in_qty - out_qty), 0) as qty
      from scoped where done_at < end_of_day(${from}::date - 1) + interval '1 microsecond'
    ),
    period as (
      select * from scoped
      where done_at >= end_of_day(${from}::date - 1) + interval '1 microsecond'
        and done_at <= end_of_day(${to}::date)
    )
    select o.qty::numeric(18,4)::text as opening, x.id as move_id, x.transfer_id,
      t.number as transfer_number, t.type as transfer_type, x.movement_code,
      t.usage_type, x.done_at, sp.path as source_path, dp.path as destination_path,
      x.lot_id, lot.name as lot_name,
      x.in_qty::numeric(18,4)::text as in_qty, x.out_qty::numeric(18,4)::text as out_qty,
      (o.qty + sum(x.in_qty - x.out_qty) over (order by x.done_at, t.number, x.id))
        ::numeric(18,4)::text as balance
    from opening o
    left join period x on true
    left join transfers t on t.id = x.transfer_id
    left join location_paths sp on sp.id = x.source_location_id
    left join location_paths dp on dp.id = x.destination_location_id
    left join lots lot on lot.id = x.lot_id
    order by x.done_at, t.number, x.id`)

  const opening = result.rows[0]?.opening ?? "0.0000"
  const lines = result.rows
    .filter((row) => row.move_id)
    .map((row): StockCardLine => ({
      moveId: row.move_id!,
      transferId: row.transfer_id,
      transferNumber: row.transfer_number,
      transferType: row.transfer_type,
      movementCode: row.movement_code,
      usageType: row.usage_type,
      doneAt: new Date(row.done_at),
      sourcePath: row.source_path,
      destinationPath: row.destination_path,
      lotId: row.lot_id,
      lotName: row.lot_name,
      inQty: row.in_qty,
      outQty: row.out_qty,
      balance: row.balance,
    }))
  const sum = (key: "inQty" | "outQty") =>
    lines.reduce((total, line) => total + Number(line[key]), 0)
  return {
    opening,
    inQty: sum("inQty"),
    outQty: sum("outQty"),
    closing: lines.at(-1)?.balance ?? opening,
    lines,
  }
}

export async function getStockProduct(productId: string) {
  const result = await db.execute<{
    id: string
    sku: string
    name: string
    uom_code: string
    category: InventoryCategory
  }>(sql`
    select p.id, p.sku, p.name, u.code as uom_code, p.category
    from products p join uoms u on u.id = p.uom_id where p.id = ${productId}`)
  const row = result.rows[0]
  return row
    ? { id: row.id, sku: row.sku, name: row.name, uomCode: row.uom_code, category: row.category }
    : undefined
}
