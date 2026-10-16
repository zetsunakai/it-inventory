import "server-only"

import { sql, type SQL } from "drizzle-orm"

import type {
  InterwarehouseStatus,
  MovementCode,
  TransferStatus,
} from "@/modules/inventory/lib/inventory"
import type { ListParams } from "@/lib/list-params"
import { db } from "@/server/db"
import { containsPattern } from "@/server/db/sql-helpers"

// Permintaan transfer antar gudang (backlog R-10). Hanya yang kedua gudangnya boleh diakses user.

export type InterwarehouseRow = {
  id: string
  number: string
  status: InterwarehouseStatus
  sourcePath: string
  sourceWarehouse: string
  destinationPath: string
  destinationWarehouse: string
  scheduledDate: string | null
  reference: string | null
  lineCount: number
}

const header = sql`
  i.id, i.number, i.status, i.scheduled_date::text as scheduled_date, i.reference, i.notes,
  i.source_location_id, i.destination_location_id,
  sp.path as source_path, sw.code as source_warehouse,
  dp.path as destination_path, dw.code as destination_warehouse`

function from(userId: string, where?: SQL) {
  return sql`
    from interwarehouse_transfers i
    join locations s on s.id = i.source_location_id
    join location_paths sp on sp.id = s.id
    join warehouses sw on sw.id = s.warehouse_id
    join locations d on d.id = i.destination_location_id
    join location_paths dp on dp.id = d.id
    join warehouses dw on dw.id = d.warehouse_id
    where can_access_warehouse(${userId}, sw.id) and can_access_warehouse(${userId}, dw.id)
      ${where ? sql`and ${where}` : sql``}`
}

type RawHeader = {
  id: string
  number: string
  status: InterwarehouseStatus
  scheduled_date: string | null
  reference: string | null
  notes: string | null
  source_location_id: string
  destination_location_id: string
  source_path: string
  source_warehouse: string
  destination_path: string
  destination_warehouse: string
}

export async function listInterwarehouse({
  userId,
  status,
  search,
  pageSize,
  offset,
}: ListParams & { userId: string; status?: InterwarehouseStatus }) {
  const conditions: SQL[] = []
  if (status) conditions.push(sql`i.status = ${status}`)
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(sql`(i.number ilike ${pattern} or i.reference ilike ${pattern})`)
  }
  const where = conditions.length ? sql.join(conditions, sql` and `) : undefined
  const [rows, totals] = await Promise.all([
    db.execute<RawHeader & { line_count: number }>(sql`
      select ${header},
        (select count(*)::int from interwarehouse_transfer_lines l where l.interwarehouse_id = i.id)
          as line_count
      ${from(userId, where)}
      order by case when i.status in ('done', 'cancelled') then 1 else 0 end, i.created_at desc
      limit ${pageSize} offset ${offset}`),
    db.execute<{ total: number }>(sql`select count(*)::int as total ${from(userId, where)}`),
  ])
  return {
    rows: rows.rows.map((row): InterwarehouseRow => ({
      id: row.id,
      number: row.number,
      status: row.status,
      sourcePath: row.source_path,
      sourceWarehouse: row.source_warehouse,
      destinationPath: row.destination_path,
      destinationWarehouse: row.destination_warehouse,
      scheduledDate: row.scheduled_date,
      reference: row.reference,
      lineCount: row.line_count,
    })),
    total: totals.rows[0]?.total ?? 0,
  }
}

export async function getInterwarehouse(userId: string, id: string) {
  const [row] = (
    await db.execute<RawHeader>(sql`select ${header} ${from(userId, sql`i.id = ${id}`)}`)
  ).rows
  if (!row) return undefined
  const [lines, linked, inTransit] = await Promise.all([
    db.execute<{
      id: string
      product_id: string
      sku: string
      name: string
      input_qty: string
      uom_id: string
      uom_code: string
      stock_uom_id: string
      stock_uom_code: string
      uom_category_id: string
      tracking: "none" | "lot" | "serial"
      lot_auto: boolean
    }>(sql`
      select l.id, p.id as product_id, p.sku, p.name, l.input_qty, l.input_uom_id as uom_id,
        u.code as uom_code, su.id as stock_uom_id, su.code as stock_uom_code,
        su.category_id as uom_category_id, p.tracking, p.lot_auto
      from interwarehouse_transfer_lines l
      join products p on p.id = l.product_id
      join uoms u on u.id = l.input_uom_id
      join uoms su on su.id = p.uom_id
      where l.interwarehouse_id = ${id}
      order by l.position`),
    db.execute<{
      id: string
      number: string
      type: "internal" | "scrap"
      status: TransferStatus
      movement_code: MovementCode
      done_at: string | null
    }>(sql`
      select id, number, type, status, movement_code, done_at
      from transfers where interwarehouse_id = ${id}
      order by created_at, number`),
    db.execute<{ sku: string; name: string; lot: string | null; qty: string; uom: string }>(sql`
      select p.sku, p.name, l.name as lot, it.qty::numeric(18,4)::text as qty, u.code as uom
      from interwarehouse_in_transit(${id}) it
      join products p on p.id = it.product_id
      join uoms u on u.id = p.uom_id
      left join lots l on l.id = it.lot_id
      order by p.sku, l.name`),
  ])
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    scheduledDate: row.scheduled_date,
    reference: row.reference,
    notes: row.notes,
    sourceLocationId: row.source_location_id,
    destinationLocationId: row.destination_location_id,
    sourcePath: row.source_path,
    sourceWarehouse: row.source_warehouse,
    destinationPath: row.destination_path,
    destinationWarehouse: row.destination_warehouse,
    lines: lines.rows.map((line) => ({
      id: line.id,
      product: {
        id: line.product_id,
        sku: line.sku,
        name: line.name,
        uomId: line.stock_uom_id,
        uomCode: line.stock_uom_code,
        uomCategoryId: line.uom_category_id,
        tracking: line.tracking,
        lotAuto: line.lot_auto,
      },
      inputQty: line.input_qty,
      uomId: line.uom_id,
      uomCode: line.uom_code,
    })),
    transfers: linked.rows.map((transfer) => ({
      id: transfer.id,
      number: transfer.number,
      type: transfer.type,
      status: transfer.status,
      movementCode: transfer.movement_code,
      doneAt: transfer.done_at ? new Date(transfer.done_at) : null,
    })),
    inTransit: inTransit.rows,
  }
}

export type InterwarehouseDetail = NonNullable<Awaited<ReturnType<typeof getInterwarehouse>>>
