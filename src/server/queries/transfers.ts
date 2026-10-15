import "server-only"

import { aliasedTable, and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm"

import type { ProductTracking, TransferStatus, TransferType } from "@/lib/inventory"
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
  transferLines,
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
    .select({ transferId: transferLines.transferId, total: count().as("line_total") })
    .from(transferLines)
    .groupBy(transferLines.transferId)
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
        sql`case when ${transfers.status} in ('done', 'cancelled') then 1 else 0 end`,
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

// Rincian pergerakan satu baris permintaan (per lot/lokasi).
export type TransferMove = {
  id: string
  lotId: string | null
  lotName: string | null
  // Satuan stok.
  qty: string
  // Qty yang dipesan dari saldo lokasi asal (R-07), satuan stok.
  reservedQty: string
}

// Baris permintaan transfer (R-05) beserta pergerakannya.
export type TransferLine = {
  id: string
  productId: string
  sku: string
  productName: string
  tracking: ProductTracking
  // Lot/seri boleh dikosongkan untuk barang masuk: diisi otomatis saat validasi.
  lotAuto: boolean
  // Qty diminta.
  inputQty: string
  inputUomId: string
  inputUomCode: string
  qty: string
  // Qty selesai (satuan stok), diisi saat validasi.
  doneQty: string | null
  stockUomId: string
  stockUomCode: string
  uomCategoryId: string
  moves: TransferMove[]
  // Lot pergerakan pertama, untuk form Draft (satu pergerakan per baris).
  lotId: string | null
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
      returnOfNumber: sql<
        string | null
      >`(select t.number from transfers t where t.id = ${transfers.returnOfId})`,
      approvedByName: sql<
        string | null
      >`(select u.name from users u where u.id = ${transfers.approvedBy})`,
      sourceWarehouseId: source.warehouseId,
      destinationWarehouseId: destination.warehouseId,
    })
    .from(transfers)
    .innerJoin(source, eq(source.id, transfers.sourceLocationId))
    .innerJoin(destination, eq(destination.id, transfers.destinationLocationId))
    .leftJoin(partners, eq(partners.id, transfers.partnerId))
    .where(and(eq(transfers.id, id), accessibleBy(userId)))
  if (!header) return undefined

  const lineRows = await db
    .select({
      id: transferLines.id,
      productId: products.id,
      sku: products.sku,
      productName: products.name,
      tracking: products.tracking,
      lotAuto: sql<boolean>`${products.lotPrefix} is not null`,
      inputQty: transferLines.inputQty,
      inputUomId: transferLines.inputUomId,
      inputUomCode: uoms.code,
      qty: transferLines.qty,
      doneQty: transferLines.doneQty,
      stockUomId: stockUom.id,
      stockUomCode: stockUom.code,
      uomCategoryId: stockUom.categoryId,
    })
    .from(transferLines)
    .innerJoin(products, eq(products.id, transferLines.productId))
    .innerJoin(uoms, eq(uoms.id, transferLines.inputUomId))
    .innerJoin(stockUom, eq(stockUom.id, products.uomId))
    .where(eq(transferLines.transferId, id))
    .orderBy(asc(transferLines.position), asc(transferLines.createdAt))
  const moveRows = await db
    .select({
      id: stockMoves.id,
      lineId: stockMoves.lineId,
      lotId: stockMoves.lotId,
      lotName: lots.name,
      qty: stockMoves.qty,
      reservedQty: stockMoves.reservedQty,
    })
    .from(stockMoves)
    .leftJoin(lots, eq(lots.id, stockMoves.lotId))
    .where(eq(stockMoves.transferId, id))
    .orderBy(asc(stockMoves.createdAt), asc(lots.name))
  const lines: TransferLine[] = lineRows.map((line) => {
    const moves = moveRows
      .filter((move) => move.lineId === line.id)
      .map(({ id: moveId, lotId, lotName, qty, reservedQty }) => ({
        id: moveId,
        lotId,
        lotName,
        qty,
        reservedQty,
      }))
    return {
      ...line,
      moves,
      lotId: moves[0]?.lotId ?? null,
      lotName: moves[0]?.lotName ?? null,
    }
  })

  return {
    ...header.transfer,
    partner: header.partner?.id ? header.partner : null,
    sourcePath: header.sourcePath,
    destinationPath: header.destinationPath,
    backorderOfNumber: header.backorderOfNumber,
    returnOfNumber: header.returnOfNumber,
    approvedByName: header.approvedByName,
    sourceWarehouseId: header.sourceWarehouseId,
    destinationWarehouseId: header.destinationWarehouseId,
    returns: await db
      .select({ id: transfers.id, number: transfers.number, status: transfers.status })
      .from(transfers)
      .where(and(eq(transfers.returnOfId, id), eq(transfers.type, "return")))
      .orderBy(asc(transfers.createdAt)),
    lines,
  }
}

export type TransferDetail = NonNullable<Awaited<ReturnType<typeof getTransfer>>>

export type LocationOption = {
  id: string
  path: string
  warehouseId: string
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
      warehouseId: warehouses.id,
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

export type UomChoice = {
  id: string
  code: string
  name: string
  categoryId: string
  // Satuan khusus produk (R-03); kosong = untuk semua produk.
  productId: string | null
}

// Satuan aktif untuk pilihan satuan input; form menyaring ke kategori satuan stok produk dan ke
// satuan umum atau satuan khusus produk itu.
export async function listUomChoices(): Promise<UomChoice[]> {
  return db
    .select({
      id: uoms.id,
      code: uoms.code,
      name: uoms.name,
      categoryId: uoms.categoryId,
      productId: uoms.productId,
    })
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
  tracking: ProductTracking
  lotAuto: boolean
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
      tracking: products.tracking,
      lotAuto: sql<boolean>`${products.lotPrefix} is not null`,
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
    // Tersedia = saldo − qty yang dipesan transfer lain (R-07).
    .select({
      lotName: lots.name,
      qty: sql<string>`${stockBalances.qty} - ${stockBalances.reservedQty}`,
      uomCode: uoms.code,
    })
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

// Sisa qty yang masih bisa diretur dari transfer asal, per produk × lot (satuan stok).
// Kunci: "<produk>|<lot atau kosong>".
export async function returnableQuantities(originId: string) {
  const result = await db.execute<{ product_id: string; lot_id: string | null; qty: string }>(
    sql`select product_id, lot_id, qty::text from returnable_lines(${originId})`,
  )
  return Object.fromEntries(
    result.rows.map((row) => [`${row.product_id}|${row.lot_id ?? ""}`, row.qty]),
  )
}
