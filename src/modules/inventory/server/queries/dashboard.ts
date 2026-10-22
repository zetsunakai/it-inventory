import "server-only"

import { sql } from "drizzle-orm"

import type { MovementCode, TransferStatus, TransferType } from "@/modules/inventory/lib/inventory"
import { db } from "@/server/db"

// Dashboard inventory mengikuti Inventory Dashboard hmx-002 (core_inventory/data/
// inventory_dashboard_data.xml): tile On Hand Qty, Available Qty, Out of Stock, Negative Stock,
// Active Documents, bar chart Stock Distribution by Warehouse (10 teratas), dan list Recent
// Document Transfer (10 transfer aktif). Tile Expired Lot/Serial dan Near Expiry hmx dilewati:
// lot di repo ini belum punya tanggal kedaluwarsa. Hanya gudang yang boleh dilihat user.

// Status "aktif" hmx (confirmed, partially_available, ready) = Menunggu, Sebagian tersedia, Siap.
const ACTIVE = sql`('waiting', 'partially_available', 'ready')`

export type WarehouseStock = { id: string; code: string; name: string; qty: string }

export type ActiveTransfer = {
  id: string
  number: string
  type: TransferType
  movementCode: MovementCode
  status: TransferStatus
  scheduledDate: string | null
}

export async function inventoryDashboard(userId: string) {
  const [stock, documents, warehouses, recent] = await Promise.all([
    // Jumlah qty seperti tile hmx (sum qty_on_hand / qty_available), lintas produk dan satuan.
    db.execute<{
      on_hand: string
      on_hand_products: number
      available: string
      available_products: number
      out_of_stock: number
      negative: number
    }>(sql`
      select
        coalesce(sum(qty) filter (where qty > 0), 0)::text as on_hand,
        count(distinct product_id) filter (where qty > 0)::int as on_hand_products,
        coalesce(sum(qty - reserved_qty) filter (where qty - reserved_qty > 0), 0)::text
          as available,
        count(distinct product_id) filter (where qty - reserved_qty > 0)::int
          as available_products,
        count(*) filter (where qty = 0)::int as out_of_stock,
        count(*) filter (where qty < 0)::int as negative
      from stock_balances
      where warehouse_id is not null and can_access_warehouse(${userId}, warehouse_id)`),
    db.execute<{ status: TransferStatus; total: number }>(sql`
      select t.status, count(*)::int as total
      from transfers t
      join locations s on s.id = t.source_location_id
      join locations d on d.id = t.destination_location_id
      where t.status in ${ACTIVE}
        and (s.warehouse_id is null or can_access_warehouse(${userId}, s.warehouse_id))
        and (d.warehouse_id is null or can_access_warehouse(${userId}, d.warehouse_id))
      group by t.status`),
    db.execute<{ id: string; code: string; name: string; qty: string }>(sql`
      select w.id, w.code, w.name, sum(b.qty)::text as qty
      from stock_balances b
      join warehouses w on w.id = b.warehouse_id
      where can_access_warehouse(${userId}, w.id)
      group by w.id, w.code, w.name
      having sum(b.qty) > 0
      order by sum(b.qty) desc, w.code
      limit 10`),
    db.execute<{
      id: string
      number: string
      type: TransferType
      movement_code: MovementCode
      status: TransferStatus
      scheduled_date: string | null
      total: number
    }>(sql`
      select t.id, t.number, t.type, t.movement_code, t.status, t.scheduled_date::text,
        count(*) over ()::int as total
      from transfers t
      join locations s on s.id = t.source_location_id
      join locations d on d.id = t.destination_location_id
      where t.status in ${ACTIVE}
        and (s.warehouse_id is null or can_access_warehouse(${userId}, s.warehouse_id))
        and (d.warehouse_id is null or can_access_warehouse(${userId}, d.warehouse_id))
      order by t.created_at desc, t.number desc
      limit 10`),
  ])

  const [totals] = stock.rows
  const byStatus = (status: TransferStatus) =>
    documents.rows.find((row) => row.status === status)?.total ?? 0
  return {
    onHand: { qty: totals.on_hand, products: totals.on_hand_products },
    available: { qty: totals.available, products: totals.available_products },
    outOfStock: totals.out_of_stock,
    negative: totals.negative,
    activeDocuments: {
      waiting: byStatus("waiting"),
      partial: byStatus("partially_available"),
      ready: byStatus("ready"),
    },
    warehouses: warehouses.rows satisfies WarehouseStock[],
    recent: {
      total: recent.rows[0]?.total ?? 0,
      rows: recent.rows.map((row): ActiveTransfer => ({
        id: row.id,
        number: row.number,
        type: row.type,
        movementCode: row.movement_code,
        status: row.status,
        scheduledDate: row.scheduled_date,
      })),
    },
  }
}

export type InventoryDashboard = Awaited<ReturnType<typeof inventoryDashboard>>
