import "server-only"

import { and, asc, eq, sql } from "drizzle-orm"

import type { ImportColumn, ImportResult } from "@/lib/import"
import { AppError } from "@/server/actions/app-error"
import type { Transaction } from "@/server/db/audit"
import { db } from "@/server/db"
import {
  locationPaths,
  locations,
  lots,
  products,
  stockCountLines,
  stockCounts,
  uoms,
} from "@/server/db/schema"
import { DuplicateKeys, exportColumns, type ImportRow, RowErrors } from "@/server/master-io/common"
import { type SpreadsheetFormat, writeSpreadsheet } from "@/server/spreadsheet"

// Ekspor dan impor daftar hitung stock opname (backlog I-04): daftar hitung diunduh sebagai Excel,
// diisi di lapangan, lalu diimpor kembali. Baris dicocokkan lewat lokasi + product code + lot;
// kombinasi baru di lingkup sesi menjadi barang temuan. Qty sistem tidak ikut diekspor (hitung buta).
// Seperti import master data: semua baris diperiksa dulu, satu saja salah = tidak ada yang disimpan.

export type CountKey = "location" | "sku" | "name" | "lot" | "uom" | "counted"

export const COUNT_COLUMNS: readonly ImportColumn<CountKey>[] = [
  {
    key: "location",
    header: "Lokasi",
    width: 24,
    description: "Jalur atau kode lokasi di lingkup sesi, mis. GB1/RAK-A.",
    required: "always",
  },
  {
    key: "sku",
    header: "Product code",
    width: 18,
    description: "Product code produk.",
    required: "always",
  },
  {
    key: "name",
    header: "Nama produk",
    width: 32,
    description: "Hanya keterangan; tidak dibaca saat import.",
  },
  {
    key: "lot",
    header: "Lot/seri",
    width: 18,
    description: "Wajib untuk produk berpelacakan lot atau nomor seri; kosong untuk produk lain.",
  },
  {
    key: "uom",
    header: "Satuan",
    width: 10,
    description: "Hanya keterangan: qty selalu dalam satuan stok produk.",
  },
  {
    key: "counted",
    header: "Qty hitung",
    width: 14,
    description:
      "Qty fisik, angka 0 atau lebih (maksimal 4 desimal). Kosong = baris tidak diubah. Nomor seri: 0 atau 1.",
  },
]

export async function exportStockCount(format: SpreadsheetFormat, countId: string) {
  const rows = await db
    .select({
      location: locationPaths.path,
      sku: products.sku,
      name: products.name,
      lot: lots.name,
      uom: uoms.code,
      counted: stockCountLines.countedQty,
    })
    .from(stockCountLines)
    .innerJoin(products, eq(products.id, stockCountLines.productId))
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .innerJoin(locationPaths, eq(locationPaths.id, stockCountLines.locationId))
    .leftJoin(lots, eq(lots.id, stockCountLines.lotId))
    .where(eq(stockCountLines.stockCountId, countId))
    .orderBy(asc(locationPaths.path), asc(products.sku), asc(lots.name))
  return writeSpreadsheet(
    format,
    "Daftar hitung",
    exportColumns(COUNT_COLUMNS),
    rows.map((row) => [
      row.location,
      row.sku,
      row.name,
      row.lot ?? "",
      row.uom,
      row.counted === null ? "" : String(Number(row.counted)),
    ]),
  )
}

// Qty hitung boleh 0 (barang memang tidak ada), maksimal 4 desimal, koma atau titik.
function parseCountedQty(text: string) {
  const value = text.trim().replace(",", ".")
  return /^\d+(\.\d{1,4})?$/.test(value) ? value : null
}

type Planned =
  | { kind: "update"; lineId: string; qty: string }
  | { kind: "insert"; productId: string; locationId: string; lot: string | null; qty: string }

export async function importStockCountRows(
  tx: Transaction,
  countId: string,
  userId: string,
  rows: ImportRow<CountKey>[],
): Promise<ImportResult> {
  const [session] = await tx
    .select({ status: stockCounts.status, warehouseId: stockCounts.warehouseId })
    .from(stockCounts)
    .where(eq(stockCounts.id, countId))
  if (!session) throw new AppError("Sesi opname tidak ditemukan.")
  if (session.status !== "counting") {
    throw new AppError("Hasil hitung hanya bisa diimpor selama sesi opname Berjalan.")
  }

  // Lokasi di lingkup sesi (stock_count_covers), dicari lewat jalur atau kode.
  const scope = await tx
    .select({ id: locations.id, code: locations.code, path: locationPaths.path })
    .from(locations)
    .innerJoin(locationPaths, eq(locationPaths.id, locations.id))
    .where(
      and(
        eq(locations.warehouseId, session.warehouseId),
        sql`stock_count_covers(${countId}, ${locations.id})`,
      ),
    )
  const locationByKey = new Map<string, string>()
  for (const location of scope) {
    locationByKey.set(location.path.toLowerCase(), location.id)
    locationByKey.set(location.code.toLowerCase(), location.id)
  }

  const productRows = await tx
    .select({
      id: products.id,
      sku: products.sku,
      tracking: products.tracking,
      covered: sql<boolean>`stock_count_covers_product(${countId}, ${products.id})`,
    })
    .from(products)
  const productBySku = new Map(productRows.map((row) => [row.sku.toLowerCase(), row]))

  const existing = await tx
    .select({
      id: stockCountLines.id,
      productId: stockCountLines.productId,
      locationId: stockCountLines.locationId,
      lot: lots.name,
      counted: stockCountLines.countedQty,
    })
    .from(stockCountLines)
    .leftJoin(lots, eq(lots.id, stockCountLines.lotId))
    .where(eq(stockCountLines.stockCountId, countId))
  const keyOf = (productId: string, locationId: string, lot: string | null) =>
    `${productId}|${locationId}|${(lot ?? "").toLowerCase()}`
  const lineByKey = new Map(
    existing.map((line) => [keyOf(line.productId, line.locationId, line.lot), line]),
  )

  const errors = new RowErrors()
  const duplicates = new DuplicateKeys()
  const planned: Planned[] = []
  let unchanged = 0

  for (const row of rows) {
    const messages: string[] = []
    const sku = row.values.sku ?? ""
    const locationText = row.values.location ?? ""
    const lot = row.values.lot?.trim() || null
    const countedText = row.values.counted ?? ""

    const locationId = locationByKey.get(locationText.toLowerCase())
    if (!locationText) messages.push("Lokasi wajib diisi.")
    else if (!locationId) messages.push(`Lokasi ${locationText} di luar lingkup sesi opname.`)
    const product = productBySku.get(sku.toLowerCase())
    if (!sku) messages.push("Product code wajib diisi.")
    else if (!product) messages.push(`Product code ${sku} tidak dikenal.`)
    else if (!product.covered) messages.push(`Produk ${sku} di luar lingkup produk sesi opname.`)
    if (product && product.tracking !== "none" && !lot) {
      messages.push(
        `Produk ${sku} wajib diisi ${product.tracking === "serial" ? "nomor seri" : "lot"}.`,
      )
    }
    if (product && product.tracking === "none" && lot) {
      messages.push(`Produk ${sku} tanpa pelacakan; kosongkan kolom Lot/seri.`)
    }
    if (lot && lot.length > 50) messages.push("Lot/seri maksimal 50 karakter.")
    const qty = countedText ? parseCountedQty(countedText) : ""
    if (qty === null) {
      messages.push("Qty hitung harus angka 0 atau lebih, maksimal 4 desimal.")
    }
    if (product?.tracking === "serial" && qty && Number(qty) > 1) {
      messages.push("Qty nomor seri hanya 0 atau 1.")
    }
    if (product && locationId) {
      const duplicate = duplicates.check(
        keyOf(product.id, locationId, lot),
        row.line,
        "Lokasi + product code + lot",
      )
      if (duplicate) messages.push(duplicate.replace(keyOf(product.id, locationId, lot), "ini"))
    }
    if (messages.length) {
      errors.add(row.line, sku, messages)
      continue
    }
    // Qty kosong: baris tidak diubah.
    if (!qty) {
      unchanged++
      continue
    }
    const line = lineByKey.get(keyOf(product!.id, locationId!, lot))
    if (line) {
      if (line.counted !== null && Number(line.counted) === Number(qty)) unchanged++
      else planned.push({ kind: "update", lineId: line.id, qty })
    } else {
      planned.push({ kind: "insert", productId: product!.id, locationId: locationId!, lot, qty })
    }
  }
  if (errors.count) return errors.result(rows.length)

  const now = new Date()
  let created = 0
  let updated = 0
  for (const item of planned) {
    if (item.kind === "update") {
      await tx
        .update(stockCountLines)
        .set({ countedQty: item.qty, countedBy: userId, countedAt: now })
        .where(eq(stockCountLines.id, item.lineId))
      updated++
      continue
    }
    let lotId: string | null = null
    if (item.lot) {
      const [saved] = await tx
        .select({ id: lots.id })
        .from(lots)
        .where(and(eq(lots.productId, item.productId), eq(lots.name, item.lot)))
      lotId =
        saved?.id ??
        (
          await tx
            .insert(lots)
            .values({ productId: item.productId, name: item.lot })
            .returning({ id: lots.id })
        )[0].id
    }
    await tx.insert(stockCountLines).values({
      stockCountId: countId,
      productId: item.productId,
      locationId: item.locationId,
      lotId,
      countedQty: item.qty,
      countedBy: userId,
      countedAt: now,
    })
    created++
  }
  return { status: "imported", total: rows.length, created, updated, unchanged }
}
