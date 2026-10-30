import "server-only"

import { sql, type SQL } from "drizzle-orm"

import type {
  MovementCode,
  ReturnLineAction,
  ReturnRequestStatus,
  ReturnRequestType,
  TransferStatus,
  TransferType,
} from "@/modules/inventory/lib/inventory"
import type { ListParams } from "@/lib/list-params"
import { db } from "@/server/db"
import { containsPattern } from "@/server/db/sql-helpers"
import { listControls, listFields, type ListBindings } from "@/server/db/list-controls"
import { groupMetadata } from "@/lib/list-controls"
import {
  RETURN_REQUEST_STATUSES,
  RETURN_REQUEST_STATUS_LABELS,
  RETURN_REQUEST_TYPES,
  RETURN_REQUEST_TYPE_LABELS,
} from "@/modules/inventory/lib/inventory"
const LIST_BINDINGS: ListBindings = {
  number: { label: "Nomor", type: "text", expression: sql`r.number` },
  partner: { label: "Partner", type: "text", expression: sql`p.name`, groupable: true },
  warehouse: { label: "Gudang", type: "text", expression: sql`w.code`, groupable: true },
  status: {
    label: "Status",
    type: "selection",
    expression: sql`r.status`,
    groupable: true,
    options: RETURN_REQUEST_STATUSES.map((value) => ({
      value,
      label: RETURN_REQUEST_STATUS_LABELS[value],
    })),
  },
  type: {
    label: "Jenis",
    type: "selection",
    expression: sql`r.type`,
    groupable: true,
    options: RETURN_REQUEST_TYPES.map((value) => ({
      value,
      label: RETURN_REQUEST_TYPE_LABELS[value],
    })),
  },
  scheduled: {
    label: "Tanggal rencana",
    type: "date",
    expression: sql`r.scheduled_date`,
    groupable: true,
  },
}
export const RETURN_LIST_FIELDS = listFields(LIST_BINDINGS)

// Permintaan retur (backlog R-11). Hanya yang gudangnya boleh diakses user.

export type ReturnRequestRow = {
  id: string
  number: string
  type: ReturnRequestType
  status: ReturnRequestStatus
  originNumber: string
  partnerName: string
  warehouseCode: string
  scheduledDate: string | null
  lineCount: number
}

const header = sql`
  r.id, r.number, r.type, r.status, r.scheduled_date::text as scheduled_date, r.reason, r.notes, r.close_reason,
  r.origin_id, o.number as origin_number, o.type as origin_type, r.location_id,
  lp.path as location_path, w.id as warehouse_id, w.code as warehouse_code,
  p.name as partner_name`

function from(userId: string, where?: SQL) {
  return sql`
    from return_requests r
    join transfers o on o.id = r.origin_id
    join partners p on p.id = r.partner_id
    join locations l on l.id = r.location_id
    join location_paths lp on lp.id = l.id
    join warehouses w on w.id = l.warehouse_id
    where can_access_warehouse(${userId}, w.id)
      ${where ? sql`and ${where}` : sql``}`
}

type RawHeader = {
  id: string
  number: string
  type: ReturnRequestType
  status: ReturnRequestStatus
  scheduled_date: string | null
  reason: string | null
  notes: string | null
  close_reason: string | null
  origin_id: string
  origin_number: string
  origin_type: "receipt" | "delivery"
  location_id: string
  location_path: string
  warehouse_id: string
  warehouse_code: string
  partner_name: string
}

export async function listReturnRequests({
  userId,
  status,
  type,
  search,
  pageSize,
  offset,
  customFilter,
  groupBy,
}: ListParams & { userId: string; status?: ReturnRequestStatus; type?: ReturnRequestType }) {
  const conditions: SQL[] = []
  if (status) conditions.push(sql`r.status = ${status}`)
  if (type) conditions.push(sql`r.type = ${type}`)
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(
      sql`(r.number ilike ${pattern} or o.number ilike ${pattern} or p.name ilike ${pattern})`,
    )
  }
  const controls = listControls({ customFilter, groupBy }, LIST_BINDINGS)
  if (controls.where) conditions.push(controls.where)
  const where = conditions.length ? sql.join(conditions, sql` and `) : undefined
  const [rows, totals] = await Promise.all([
    db.execute<RawHeader & { line_count: number }>(sql`
      select ${controls.columns}, ${header},
        (select count(*)::int from return_request_lines x where x.return_request_id = r.id)
          as line_count
      ${from(userId, where)}
      order by ${controls.orderPrefix}case when r.status in ('done', 'cancelled') then 1 else 0 end, r.created_at desc, r.id
      limit ${pageSize} offset ${offset}`),
    db.execute<{ total: number }>(sql`select count(*)::int as total ${from(userId, where)}`),
  ])
  return {
    rows: rows.rows.map((row): ReturnRequestRow => ({
      ...groupMetadata(row),
      id: row.id,
      number: row.number,
      type: row.type,
      status: row.status,
      originNumber: row.origin_number,
      partnerName: row.partner_name,
      warehouseCode: row.warehouse_code,
      scheduledDate: row.scheduled_date,
      lineCount: row.line_count,
    })),
    total: totals.rows[0]?.total ?? 0,
  }
}

export async function getReturnRequest(userId: string, id: string) {
  const [row] = (
    await db.execute<RawHeader>(sql`select ${header} ${from(userId, sql`r.id = ${id}`)}`)
  ).rows
  if (!row) return undefined
  const [lines, linked] = await Promise.all([
    // Sisa yang bisa diretur hanya berarti selama Draft (batas qty di form).
    db.execute<{
      id: string
      sku: string
      name: string
      lot: string | null
      qty: string
      uom: string
      action: ReturnLineAction
      returned: string
      max: string
    }>(sql`
      select x.id, p.sku, p.name, lt.name as lot, x.qty::text, u.code as uom, x.action,
        coalesce((
          select sum(m.qty) from stock_moves m join transfers t on t.id = m.transfer_id
          where t.return_request_id = x.return_request_id and t.type = 'return'
            and m.status = 'done' and m.product_id = x.product_id
            and m.lot_id is not distinct from x.lot_id
        ), 0)::numeric(18,4)::text as returned,
        coalesce(rem.qty, 0)::numeric(18,4)::text as max
      from return_request_lines x
      join products p on p.id = x.product_id
      join uoms u on u.id = p.uom_id
      left join lots lt on lt.id = x.lot_id
      left join returnable_lines(${row.origin_id}, ${id}) rem
        on rem.product_id = x.product_id and rem.lot_id is not distinct from x.lot_id
      where x.return_request_id = ${id}
      order by x.position, p.sku`),
    db.execute<{
      id: string
      number: string
      type: TransferType
      status: TransferStatus
      movement_code: MovementCode
      done_at: string | null
    }>(sql`
      select id, number, type, status, movement_code, done_at
      from transfers where return_request_id = ${id}
      order by created_at, number`),
  ])
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    status: row.status,
    scheduledDate: row.scheduled_date,
    reason: row.reason,
    notes: row.notes,
    closeReason: row.close_reason,
    originId: row.origin_id,
    originNumber: row.origin_number,
    originType: row.origin_type,
    locationId: row.location_id,
    locationPath: row.location_path,
    warehouseId: row.warehouse_id,
    warehouseCode: row.warehouse_code,
    partnerName: row.partner_name,
    lines: lines.rows,
    transfers: linked.rows.map((transfer) => ({
      id: transfer.id,
      number: transfer.number,
      type: transfer.type,
      status: transfer.status,
      movementCode: transfer.movement_code,
      doneAt: transfer.done_at ? new Date(transfer.done_at) : null,
    })),
  }
}

export type ReturnRequestDetail = NonNullable<Awaited<ReturnType<typeof getReturnRequest>>>
