import "server-only"

import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm"

import type { StockCountStatus } from "@/modules/inventory/lib/inventory"
import type { ListParams } from "@/lib/list-params"
import { db } from "@/server/db"
import {
  locationPaths,
  locations,
  lots,
  products,
  stockCountLines,
  stockCountProducts,
  stockCounts,
  transfers,
  uoms,
  warehouses,
} from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"
import { listControls, listFields, type ListBindings } from "@/server/db/list-controls"
import { STOCK_COUNT_STATUSES, STOCK_COUNT_STATUS_LABELS } from "@/modules/inventory/lib/inventory"
const LIST_BINDINGS: ListBindings = {
  number: { label: "Nomor", type: "text", expression: stockCounts.number },
  warehouse: { label: "Gudang", type: "text", expression: warehouses.name, groupable: true },
  status: {
    label: "Status",
    type: "selection",
    expression: stockCounts.status,
    groupable: true,
    options: STOCK_COUNT_STATUSES.map((value) => ({
      value,
      label: STOCK_COUNT_STATUS_LABELS[value],
    })),
  },
  cutoff: {
    label: "Tanggal cut-off",
    type: "date",
    expression: sql`(${stockCounts.cutOffAt} at time zone 'Asia/Jakarta')::date`,
    groupable: true,
  },
}
export const STOCK_COUNT_LIST_FIELDS = listFields(LIST_BINDINGS)

// Stock opname (backlog M2-09): daftar dan detail sesi untuk gudang yang boleh diakses user.

const accessibleBy = (userId: string) =>
  sql`can_access_warehouse(${userId}, ${stockCounts.warehouseId})`

const locationPathOf = sql<
  string | null
>`(select lp.path from location_paths lp where lp.id = ${stockCounts.locationId})`

export type StockCountRow = {
  id: string
  number: string
  status: StockCountStatus
  warehouseCode: string
  warehouseName: string
  locationPath: string | null
  cutOffAt: Date
  lineCount: number
  countedCount: number
}

export async function listStockCounts({
  userId,
  status,
  search,
  pageSize,
  offset,
  customFilter,
  groupBy,
}: ListParams & { userId: string; status?: StockCountStatus }) {
  const conditions: SQL[] = [accessibleBy(userId)]
  if (status) conditions.push(eq(stockCounts.status, status))
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(
      or(
        ilike(stockCounts.number, pattern),
        ilike(warehouses.code, pattern),
        ilike(warehouses.name, pattern),
      )!,
    )
  }
  const controls = listControls({ customFilter, groupBy }, LIST_BINDINGS)
  const where = and(...conditions, controls.where)
  const totals = db
    .select({
      countId: stockCountLines.stockCountId,
      total: count().as("line_total"),
      counted: count(stockCountLines.countedQty).as("counted_total"),
    })
    .from(stockCountLines)
    .groupBy(stockCountLines.stockCountId)
    .as("line_totals")

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockCounts.id,
        ...controls.selection,
        number: stockCounts.number,
        status: stockCounts.status,
        warehouseCode: warehouses.code,
        warehouseName: warehouses.name,
        locationPath: locationPathOf,
        cutOffAt: stockCounts.cutOffAt,
        lineCount: sql<number>`coalesce(${totals.total}, 0)::int`,
        countedCount: sql<number>`coalesce(${totals.counted}, 0)::int`,
      })
      .from(stockCounts)
      .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
      .leftJoin(totals, eq(totals.countId, stockCounts.id))
      .where(where)
      .orderBy(
        ...controls.order,
        sql`case ${stockCounts.status} when 'approved' then 1 when 'cancelled' then 1 else 0 end`,
        desc(stockCounts.createdAt),
        asc(stockCounts.id),
      )
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(stockCounts)
      .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
      .where(where),
  ])
  return { rows: rows as StockCountRow[], total }
}

export type StockCountLine = {
  id: string
  sku: string
  productName: string
  uomCode: string
  locationPath: string
  lotName: string | null
  systemQty: string | null
  countedQty: string | null
}

export async function getStockCount(userId: string, id: string) {
  const [header] = await db
    .select({
      count: stockCounts,
      warehouseCode: warehouses.code,
      warehouseName: warehouses.name,
      locationPath: locationPathOf,
      productCategoryPath: sql<
        string | null
      >`(select pp.path from product_category_paths pp where pp.id = ${stockCounts.productCategoryId})`,
      approvedByName: sql<
        string | null
      >`(select u.name from users u where u.id = ${stockCounts.approvedBy})`,
    })
    .from(stockCounts)
    .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
    .where(and(eq(stockCounts.id, id), accessibleBy(userId)))
  if (!header) return undefined

  const [lines, adjustments, scopeProducts] = await Promise.all([
    db
      .select({
        id: stockCountLines.id,
        sku: products.sku,
        productName: products.name,
        uomCode: uoms.code,
        locationPath: locationPaths.path,
        lotName: lots.name,
        systemQty: stockCountLines.systemQty,
        countedQty: stockCountLines.countedQty,
      })
      .from(stockCountLines)
      .innerJoin(products, eq(products.id, stockCountLines.productId))
      .innerJoin(uoms, eq(uoms.id, products.uomId))
      .innerJoin(locationPaths, eq(locationPaths.id, stockCountLines.locationId))
      .leftJoin(lots, eq(lots.id, stockCountLines.lotId))
      .where(eq(stockCountLines.stockCountId, id))
      .orderBy(asc(locationPaths.path), asc(products.sku), asc(lots.name)),
    db
      .select({
        id: transfers.id,
        number: transfers.number,
        increase: sql<boolean>`(select l.warehouse_id is null from locations l where l.id = ${transfers.sourceLocationId})`,
      })
      .from(transfers)
      .where(eq(transfers.stockCountId, id))
      .orderBy(asc(transfers.number)),
    // Lingkup produk tertentu (I-04).
    db
      .select({ sku: products.sku, name: products.name })
      .from(stockCountProducts)
      .innerJoin(products, eq(products.id, stockCountProducts.productId))
      .where(eq(stockCountProducts.stockCountId, id))
      .orderBy(asc(products.sku)),
  ])

  return {
    ...header.count,
    warehouseCode: header.warehouseCode,
    warehouseName: header.warehouseName,
    locationPath: header.locationPath,
    productCategoryPath: header.productCategoryPath,
    approvedByName: header.approvedByName,
    lines: lines as StockCountLine[],
    adjustments,
    scopeProducts,
  }
}

export type StockCountDetail = NonNullable<Awaited<ReturnType<typeof getStockCount>>>

// Lokasi internal aktif di lingkup sesi (stock_count_covers), untuk layar scan (I-04).
export async function countScopeLocations(countId: string) {
  return db
    .select({ id: locations.id, code: locations.code, path: locationPaths.path })
    .from(locations)
    .innerJoin(locationPaths, eq(locationPaths.id, locations.id))
    .innerJoin(stockCounts, eq(stockCounts.id, countId))
    .where(
      and(
        eq(locations.warehouseId, stockCounts.warehouseId),
        eq(locations.type, "internal"),
        eq(locations.active, true),
        sql`stock_count_covers(${countId}, ${locations.id})`,
      ),
    )
    .orderBy(asc(locationPaths.path))
}

// Opname yang sedang membekukan gudang-gudang ini (R-13), untuk banner di layar gudang dan transfer
// (I-04). Status yang membekukan sama dengan stock_count_freeze_errors().
export async function freezingCounts(warehouseIds: (string | null)[]) {
  const ids = [...new Set(warehouseIds.filter((id): id is string => Boolean(id)))]
  if (!ids.length) return []
  return db
    .select({
      id: stockCounts.id,
      number: stockCounts.number,
      status: stockCounts.status,
      warehouseCode: warehouses.code,
    })
    .from(stockCounts)
    .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
    .where(
      and(
        inArray(stockCounts.warehouseId, ids),
        sql`${stockCounts.status}::text in ('counting', 'counted', 'review')`,
      ),
    )
    .orderBy(asc(warehouses.code))
}
