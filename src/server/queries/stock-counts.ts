import "server-only"

import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm"

import type { StockCountStatus } from "@/lib/inventory"
import type { ListParams } from "@/lib/list-params"
import { db } from "@/server/db"
import {
  locationPaths,
  lots,
  products,
  stockCountLines,
  stockCounts,
  transfers,
  uoms,
  warehouses,
} from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"

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
  const where = and(...conditions)
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
        sql`case ${stockCounts.status} when 'approved' then 1 when 'cancelled' then 1 else 0 end`,
        desc(stockCounts.createdAt),
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
      approvedByName: sql<
        string | null
      >`(select u.name from users u where u.id = ${stockCounts.approvedBy})`,
    })
    .from(stockCounts)
    .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
    .where(and(eq(stockCounts.id, id), accessibleBy(userId)))
  if (!header) return undefined

  const [lines, adjustments] = await Promise.all([
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
  ])

  return {
    ...header.count,
    warehouseCode: header.warehouseCode,
    warehouseName: header.warehouseName,
    locationPath: header.locationPath,
    approvedByName: header.approvedByName,
    lines: lines as StockCountLine[],
    adjustments,
  }
}

export type StockCountDetail = NonNullable<Awaited<ReturnType<typeof getStockCount>>>
