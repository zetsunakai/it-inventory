import "server-only"

import { aliasedTable, and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm"

import type { TransferStatus, TransferType } from "@/lib/inventory"
import type { ListParams } from "@/lib/list-params"
import { db } from "@/server/db"
import {
  locationPaths,
  locations,
  lots,
  partners,
  products,
  stockBalances,
  stockMoves,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"

const source = aliasedTable(locations, "source")
const destination = aliasedTable(locations, "destination")
// Jalur lengkap lokasi (mis. GB1/RAK-A). View tidak bisa di-alias Drizzle, jadi lewat subquery.
const pathOf = (location: typeof source) =>
  sql<string>`(select lp.path from location_paths lp where lp.id = ${location.id})`

// Transfer yang boleh dilihat user: semua lokasi gudangnya bisa diakses (PRD bagian 3).
// Lokasi virtual (tanpa gudang) selalu boleh. Aturannya di can_access_warehouse().
function accessibleBy(userId: string) {
  return sql`(${source.warehouseId} is null or can_access_warehouse(${userId}, ${source.warehouseId}))
    and (${destination.warehouseId} is null or can_access_warehouse(${userId}, ${destination.warehouseId}))`
}

export type TransferRow = {
  id: string
  number: string
  type: TransferType
  status: TransferStatus
  partnerName: string | null
  sourcePath: string
  destinationPath: string
  reference: string | null
  scheduledDate: string | null
  doneAt: Date | null
  lineCount: number
}

// Halaman daftar per jenis transfer: cari nomor, referensi, atau partner; filter status.
export async function listTransfers({
  userId,
  type,
  status,
  search,
  pageSize,
  offset,
}: ListParams & { userId: string; type: TransferType; status?: TransferStatus }) {
  const conditions: SQL[] = [eq(transfers.type, type), accessibleBy(userId)]
  if (status) conditions.push(eq(transfers.status, status))
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(
      or(
        ilike(transfers.number, pattern),
        ilike(transfers.reference, pattern),
        ilike(partners.name, pattern),
        ilike(partners.code, pattern),
      )!,
    )
  }
  const where = and(...conditions)
  const lineCounts = db
    .select({ transferId: stockMoves.transferId, total: count().as("line_total") })
    .from(stockMoves)
    .groupBy(stockMoves.transferId)
    .as("line_counts")

  const base = () =>
    db
      .select({
        id: transfers.id,
        number: transfers.number,
        type: transfers.type,
        status: transfers.status,
        partnerName: partners.name,
        sourcePath: pathOf(source),
        destinationPath: pathOf(destination),
        reference: transfers.reference,
        scheduledDate: transfers.scheduledDate,
        doneAt: transfers.doneAt,
        lineCount: sql<number>`coalesce(${lineCounts.total}, 0)::int`,
      })
      .from(transfers)
      .innerJoin(source, eq(source.id, transfers.sourceLocationId))
      .innerJoin(destination, eq(destination.id, transfers.destinationLocationId))
      .leftJoin(partners, eq(partners.id, transfers.partnerId))
      .leftJoin(lineCounts, eq(lineCounts.transferId, transfers.id))

  const [rows, [{ total }]] = await Promise.all([
    base()
      .where(where)
      // Yang masih dikerjakan di atas, lalu yang terbaru.
      .orderBy(
        sql`case ${transfers.status} when 'draft' then 0 when 'ready' then 0 else 1 end`,
        desc(transfers.createdAt),
      )
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(transfers)
      .innerJoin(source, eq(source.id, transfers.sourceLocationId))
      .innerJoin(destination, eq(destination.id, transfers.destinationLocationId))
      .leftJoin(partners, eq(partners.id, transfers.partnerId))
      .where(where),
  ])
  return { rows: rows as TransferRow[], total }
}

export type TransferLine = {
  id: string
  productId: string
  sku: string
  productName: string
  lotRequired: boolean
  inputQty: string
  inputUomId: string
  inputUomCode: string
  qty: string
  stockUomId: string
  stockUomCode: string
  uomCategoryId: string
  lotName: string | null
}

const stockUom = aliasedTable(uoms, "stock_uom")

// Transfer beserta baris barangnya, bila boleh dilihat user.
export async function getTransfer(userId: string, id: string) {
  const [header] = await db
    .select({
      transfer: transfers,
      partner: { id: partners.id, code: partners.code, name: partners.name },
      sourcePath: pathOf(source),
      destinationPath: pathOf(destination),
      backorderOfNumber: sql<
        string | null
      >`(select t.number from transfers t where t.id = ${transfers.backorderOfId})`,
      sourceWarehouseId: source.warehouseId,
      destinationWarehouseId: destination.warehouseId,
    })
    .from(transfers)
    .innerJoin(source, eq(source.id, transfers.sourceLocationId))
    .innerJoin(destination, eq(destination.id, transfers.destinationLocationId))
    .leftJoin(partners, eq(partners.id, transfers.partnerId))
    .where(and(eq(transfers.id, id), accessibleBy(userId)))
  if (!header) return undefined

  const lines: TransferLine[] = await db
    .select({
      id: stockMoves.id,
      productId: products.id,
      sku: products.sku,
      productName: products.name,
      lotRequired: products.lotRequired,
      inputQty: stockMoves.inputQty,
      inputUomId: stockMoves.inputUomId,
      inputUomCode: uoms.code,
      qty: stockMoves.qty,
      stockUomId: stockUom.id,
      stockUomCode: stockUom.code,
      uomCategoryId: stockUom.categoryId,
      lotName: lots.name,
    })
    .from(stockMoves)
    .innerJoin(products, eq(products.id, stockMoves.productId))
    .innerJoin(uoms, eq(uoms.id, stockMoves.inputUomId))
    .innerJoin(stockUom, eq(stockUom.id, products.uomId))
    .leftJoin(lots, eq(lots.id, stockMoves.lotId))
    .where(eq(stockMoves.transferId, id))
    .orderBy(asc(stockMoves.position), asc(stockMoves.createdAt))

  return {
    ...header.transfer,
    partner: header.partner?.id ? header.partner : null,
    sourcePath: header.sourcePath,
    destinationPath: header.destinationPath,
    backorderOfNumber: header.backorderOfNumber,
    lines,
  }
}

export type TransferDetail = NonNullable<Awaited<ReturnType<typeof getTransfer>>>

export type LocationOption = {
  id: string
  path: string
  warehouseCode: string
  warehouseName: string
  isBonded: boolean
}

// Lokasi internal aktif di gudang aktif yang boleh diakses user, untuk sisi gudang transfer.
export async function listInternalLocations(userId: string): Promise<LocationOption[]> {
  return db
    .select({
      id: locations.id,
      path: locationPaths.path,
      warehouseCode: warehouses.code,
      warehouseName: warehouses.name,
      isBonded: warehouses.isBonded,
    })
    .from(locations)
    .innerJoin(locationPaths, eq(locationPaths.id, locations.id))
    .innerJoin(warehouses, eq(warehouses.id, locations.warehouseId))
    .where(
      and(
        eq(locations.type, "internal"),
        eq(locations.active, true),
        eq(warehouses.active, true),
        sql`can_access_warehouse(${userId}, ${warehouses.id})`,
      ),
    )
    .orderBy(asc(locationPaths.path))
}

export type UomChoice = { id: string; code: string; name: string; categoryId: string }

// Satuan aktif untuk pilihan satuan input; form menyaring ke kategori satuan stok produk.
export async function listUomChoices(): Promise<UomChoice[]> {
  return db
    .select({ id: uoms.id, code: uoms.code, name: uoms.name, categoryId: uoms.categoryId })
    .from(uoms)
    .innerJoin(uomCategories, eq(uomCategories.id, uoms.categoryId))
    .where(and(eq(uoms.active, true), eq(uomCategories.active, true)))
    .orderBy(asc(uoms.code))
}

export type ProductChoice = {
  id: string
  sku: string
  name: string
  uomId: string
  uomCode: string
  uomCategoryId: string
  lotRequired: boolean
}

export const PRODUCT_SEARCH_LIMIT = 20

// Pencarian produk aktif untuk baris transfer (/api/products).
export async function searchProducts(search: string): Promise<ProductChoice[]> {
  const pattern = containsPattern(search)
  return db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      uomId: products.uomId,
      uomCode: uoms.code,
      uomCategoryId: uoms.categoryId,
      lotRequired: products.lotRequired,
    })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(
      and(
        eq(products.active, true),
        search ? or(ilike(products.sku, pattern), ilike(products.name, pattern)) : undefined,
      ),
    )
    .orderBy(asc(products.sku))
    .limit(PRODUCT_SEARCH_LIMIT)
}

export type PartnerChoice = { id: string; code: string; name: string }

// Pencarian partner aktif per peran (/api/partners).
export async function searchPartners(
  role: "vendor" | "customer",
  search: string,
): Promise<PartnerChoice[]> {
  const pattern = containsPattern(search)
  return db
    .select({ id: partners.id, code: partners.code, name: partners.name })
    .from(partners)
    .where(
      and(
        eq(partners.active, true),
        eq(role === "vendor" ? partners.isVendor : partners.isCustomer, true),
        search ? or(ilike(partners.code, pattern), ilike(partners.name, pattern)) : undefined,
      ),
    )
    .orderBy(asc(partners.name))
    .limit(PRODUCT_SEARCH_LIMIT)
}

export type StockAvailability = {
  // Total saldo produk di lokasi, dalam satuan stok.
  qty: string
  uomCode: string
  lots: { name: string; qty: string }[]
}

// Saldo satu produk di satu lokasi beserta lot yang masih ada stoknya (/api/stock-availability),
// untuk pilihan lot dan petunjuk "tersedia" di form barang keluar.
export async function stockAvailability(
  productId: string,
  locationId: string,
): Promise<StockAvailability> {
  const rows = await db
    .select({ lotName: lots.name, qty: stockBalances.qty, uomCode: uoms.code })
    .from(stockBalances)
    .innerJoin(products, eq(products.id, stockBalances.productId))
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .leftJoin(lots, eq(lots.id, stockBalances.lotId))
    .where(and(eq(stockBalances.productId, productId), eq(stockBalances.locationId, locationId)))
    .orderBy(asc(lots.name))
  const [unit] = rows.length
    ? [rows[0].uomCode]
    : (
        await db
          .select({ code: uoms.code })
          .from(products)
          .innerJoin(uoms, eq(uoms.id, products.uomId))
          .where(eq(products.id, productId))
      ).map((row) => row.code)
  const total = rows.reduce((sum, row) => sum + Number(row.qty), 0)
  return {
    // Jumlah untuk tampilan saja; validasi stok tetap di database.
    qty: total.toFixed(4),
    uomCode: unit ?? "",
    lots: rows
      .filter((row) => row.lotName && Number(row.qty) > 0)
      .map((row) => ({ name: row.lotName!, qty: row.qty })),
  }
}
