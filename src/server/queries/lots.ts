import "server-only"

import { sql, type SQL } from "drizzle-orm"

import type { MovementCode, ProductTracking, TransferType, UsageType } from "@/lib/inventory"
import type { ListParams } from "@/lib/list-params"
import { db } from "@/server/db"
import { containsPattern } from "@/server/db/sql-helpers"

// Penelusuran lot dan nomor seri (backlog R-14): saldo per lokasi dan riwayat masuk-keluar satu
// lot di semua gudang yang boleh dilihat user. Pergerakan dihitung dari ledger (stock_moves Selesai)
// yang salah satu sisinya gudang yang boleh diakses.

export type LotRow = {
  id: string
  name: string
  productId: string
  sku: string
  productName: string
  tracking: ProductTracking
  uomCode: string
  qty: string
  lastMovedAt: Date | null
}

const visibleMove = (userId: string) => sql`(
  (m.source_warehouse_id is not null and can_access_warehouse(${userId}, m.source_warehouse_id))
  or (m.destination_warehouse_id is not null
    and can_access_warehouse(${userId}, m.destination_warehouse_id))
)`

export async function listLots({
  userId,
  search,
  pageSize,
  offset,
}: ListParams & { userId: string }) {
  const conditions: SQL[] = [
    sql`exists (
      select 1 from stock_moves m
      where m.lot_id = lot.id and m.status = 'done' and ${visibleMove(userId)}
    )`,
  ]
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(
      sql`(lot.name ilike ${pattern} or p.sku ilike ${pattern} or p.name ilike ${pattern})`,
    )
  }
  const from = sql`
    from lots lot
    join products p on p.id = lot.product_id
    join uoms u on u.id = p.uom_id
    where ${sql.join(conditions, sql` and `)}`
  const [rows, totals] = await Promise.all([
    db.execute<{
      id: string
      name: string
      product_id: string
      sku: string
      product_name: string
      tracking: ProductTracking
      uom_code: string
      qty: string
      last_moved_at: string | null
    }>(sql`
      select lot.id, lot.name, p.id as product_id, p.sku, p.name as product_name, p.tracking,
        u.code as uom_code,
        coalesce((
          select sum(b.qty) from stock_balances b
          where b.lot_id = lot.id and b.warehouse_id is not null
            and can_access_warehouse(${userId}, b.warehouse_id)
        ), 0)::numeric(18,4)::text as qty,
        (select max(m.done_at) from stock_moves m
          where m.lot_id = lot.id and m.status = 'done') as last_moved_at
      ${from}
      order by last_moved_at desc nulls last, p.sku, lot.name
      limit ${pageSize} offset ${offset}`),
    db.execute<{ total: number }>(sql`select count(*)::int as total ${from}`),
  ])
  return {
    rows: rows.rows.map((row): LotRow => ({
      id: row.id,
      name: row.name,
      productId: row.product_id,
      sku: row.sku,
      productName: row.product_name,
      tracking: row.tracking,
      uomCode: row.uom_code,
      qty: row.qty,
      lastMovedAt: row.last_moved_at ? new Date(row.last_moved_at) : null,
    })),
    total: totals.rows[0]?.total ?? 0,
  }
}

export type LotMove = {
  id: string
  transferId: string
  transferNumber: string
  transferType: TransferType
  movementCode: MovementCode
  usageType: UsageType | null
  partnerName: string | null
  doneAt: Date
  sourcePath: string
  sourceWarehouse: string | null
  destinationPath: string
  destinationWarehouse: string | null
  qty: string
}

export async function getLotTrace(userId: string, lotId: string) {
  const [lot] = (
    await db.execute<{
      id: string
      name: string
      product_id: string
      sku: string
      product_name: string
      tracking: ProductTracking
      uom_code: string
      created_at: string
    }>(sql`
      select lot.id, lot.name, p.id as product_id, p.sku, p.name as product_name, p.tracking,
        u.code as uom_code, lot.created_at
      from lots lot join products p on p.id = lot.product_id join uoms u on u.id = p.uom_id
      where lot.id = ${lotId}`)
  ).rows
  if (!lot) return undefined
  const [balances, moves] = await Promise.all([
    db.execute<{
      location_id: string
      warehouse_id: string
      warehouse_code: string
      location_path: string
      qty: string
      reserved_qty: string
    }>(sql`
      select b.location_id, w.id as warehouse_id, w.code as warehouse_code,
        lp.path as location_path, b.qty::numeric(18,4)::text as qty,
        b.reserved_qty::numeric(18,4)::text as reserved_qty
      from stock_balances b
      join warehouses w on w.id = b.warehouse_id
      join location_paths lp on lp.id = b.location_id
      where b.lot_id = ${lotId} and b.qty <> 0 and can_access_warehouse(${userId}, w.id)
      order by w.code, lp.path`),
    db.execute<{
      id: string
      transfer_id: string
      transfer_number: string
      transfer_type: TransferType
      movement_code: MovementCode
      usage_type: UsageType | null
      partner_name: string | null
      done_at: string
      source_path: string
      source_warehouse: string | null
      destination_path: string
      destination_warehouse: string | null
      qty: string
    }>(sql`
      select m.id, t.id as transfer_id, t.number as transfer_number, t.type as transfer_type,
        m.movement_code, t.usage_type, pa.name as partner_name, m.done_at,
        sp.path as source_path, sw.code as source_warehouse,
        dp.path as destination_path, dw.code as destination_warehouse,
        m.qty::numeric(18,4)::text as qty
      from stock_moves m
      join transfers t on t.id = m.transfer_id
      left join partners pa on pa.id = t.partner_id
      join location_paths sp on sp.id = m.source_location_id
      join location_paths dp on dp.id = m.destination_location_id
      left join warehouses sw on sw.id = m.source_warehouse_id
      left join warehouses dw on dw.id = m.destination_warehouse_id
      where m.lot_id = ${lotId} and m.status = 'done' and ${visibleMove(userId)}
      order by m.done_at, t.number, m.id`),
  ])
  if (!moves.rows.length && !balances.rows.length) return undefined
  return {
    id: lot.id,
    name: lot.name,
    productId: lot.product_id,
    sku: lot.sku,
    productName: lot.product_name,
    tracking: lot.tracking,
    uomCode: lot.uom_code,
    createdAt: new Date(lot.created_at),
    balances: balances.rows.map((row) => ({
      locationId: row.location_id,
      warehouseId: row.warehouse_id,
      warehouseCode: row.warehouse_code,
      locationPath: row.location_path,
      qty: row.qty,
      reservedQty: row.reserved_qty,
    })),
    moves: moves.rows.map((row): LotMove => ({
      id: row.id,
      transferId: row.transfer_id,
      transferNumber: row.transfer_number,
      transferType: row.transfer_type,
      movementCode: row.movement_code,
      usageType: row.usage_type,
      partnerName: row.partner_name,
      doneAt: new Date(row.done_at),
      sourcePath: row.source_path,
      sourceWarehouse: row.source_warehouse,
      destinationPath: row.destination_path,
      destinationWarehouse: row.destination_warehouse,
      qty: row.qty,
    })),
  }
}

export type LotTrace = NonNullable<Awaited<ReturnType<typeof getLotTrace>>>
