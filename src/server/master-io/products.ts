import "server-only"

import { asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { z } from "zod"

import { sameDecimal, toDecimalInput } from "@/lib/decimal"
import { checkbox } from "@/lib/form-fields"
import {
  flagText,
  matchOption,
  optionList,
  parseFlag,
  type ImportColumn,
  type ImportResult,
} from "@/lib/import"
import { INVENTORY_CATEGORY_LABELS, PRODUCT_TRACKING_LABELS } from "@/lib/inventory"
import { ALWAYS, pairCeisaUnit, prefixNeedsTracking, productFields, skuField } from "@/lib/product"
import type { Transaction } from "@/server/db/audit"
import { db } from "@/server/db"
import { refCodeStates } from "@/server/db/ref-code-checks"
import { products, uomCategories, uoms } from "@/server/db/schema"
import { writeSpreadsheet, type SpreadsheetFormat } from "@/server/spreadsheet"

import {
  chunks,
  DuplicateKeys,
  exportColumns,
  INSERT_BATCH_SIZE,
  issueMessages,
  RowErrors,
  type ImportRow,
} from "./common"

// Import/export produk (backlog M1-07, PRD bagian 5.3). Aturan validasinya sama dengan form
// produk: schema dari src/lib/product.ts dan pemeriksaan referensi yang sama dengan actions.ts.

export const PRODUCT_COLUMNS = [
  {
    key: "sku",
    header: "SKU",
    width: 18,
    required: "always",
    description: "Kode unik produk. SKU yang sudah ada berarti produk itu diperbarui.",
  },
  { key: "name", header: "Nama", width: 40, required: "new", description: "Nama produk." },
  { key: "description", header: "Deskripsi", width: 40, description: "Boleh kosong." },
  {
    key: "productCategory",
    header: "Kategori produk",
    width: 28,
    description:
      "Jalur lengkap kategori produk, mis. Bahan baku / Logam. Boleh kosong; kategori harus aktif.",
  },
  {
    key: "category",
    header: "Kategori IT Inventory",
    aliases: ["Kategori"],
    width: 18,
    required: "new",
    description: `${optionList(INVENTORY_CATEGORY_LABELS)}.`,
  },
  {
    key: "uom",
    header: "Satuan stok",
    width: 12,
    required: "new",
    description: "Kode satuan, misalnya PCS atau KG. Tidak bisa diubah setelah produk dibuat.",
  },
  {
    key: "hsCode",
    header: "Kode HS",
    width: 12,
    description: "8 digit (titik boleh), harus ada di referensi kepabeanan.",
  },
  {
    key: "ceisaUnitCode",
    header: "Satuan CEISA",
    width: 14,
    description: "Kode satuan CEISA, misalnya PCE atau KGM. Diisi bersama faktornya.",
  },
  {
    key: "ceisaFactor",
    header: "Faktor CEISA",
    width: 14,
    description: "Jumlah satuan CEISA dalam 1 satuan stok, misalnya 1 atau 0,001.",
  },
  {
    key: "netWeight",
    header: "Berat netto (kg)",
    width: 16,
    description: "Kilogram per satuan stok.",
  },
  { key: "brand", header: "Merk", width: 16, description: "Boleh kosong." },
  { key: "model", header: "Tipe", width: 16, description: "Boleh kosong." },
  { key: "size", header: "Ukuran", width: 16, description: "Boleh kosong." },
  {
    key: "tracking",
    header: "Pelacakan",
    // File export sebelum R-02 berisi kolom Wajib lot (Ya = per lot, Tidak = tanpa pelacakan).
    aliases: ["Wajib lot"],
    width: 16,
    description: `${optionList(PRODUCT_TRACKING_LABELS)}. Kosong berarti Tanpa pelacakan. Tidak bisa diubah selama produk punya stok atau transaksi yang belum selesai.`,
  },
  {
    key: "lotPrefix",
    header: "Prefix nomor lot/seri",
    width: 18,
    description: "Prefix nomor lot/seri otomatis untuk barang masuk, mis. LOT-. Boleh kosong.",
  },
  {
    key: "lotDigits",
    header: "Digit nomor lot/seri",
    width: 12,
    description: "Jumlah digit nomor urut, 3 sampai 10. Kosong berarti 6.",
  },
  {
    key: "active",
    header: "Aktif",
    width: 8,
    description: "Ya, atau Tidak untuk mengarsipkan. Kosong berarti Ya.",
  },
] as const satisfies readonly ImportColumn[]

type ProductKey = (typeof PRODUCT_COLUMNS)[number]["key"]
type SheetValues = Partial<Record<ProductKey, string>>
type SavedProduct = typeof products.$inferSelect & { uomCode: string; categoryPath: string | null }

function sheetValues(product: SavedProduct): Record<ProductKey, string> {
  return {
    sku: product.sku,
    name: product.name,
    description: product.description ?? "",
    productCategory: product.categoryPath ?? "",
    category: INVENTORY_CATEGORY_LABELS[product.category],
    uom: product.uomCode,
    hsCode: product.hsCode ?? "",
    ceisaUnitCode: product.ceisaUnitCode ?? "",
    ceisaFactor: product.ceisaFactor ? toDecimalInput(product.ceisaFactor) : "",
    netWeight: product.netWeight ? toDecimalInput(product.netWeight) : "",
    brand: product.brand ?? "",
    model: product.model ?? "",
    size: product.size ?? "",
    tracking: PRODUCT_TRACKING_LABELS[product.tracking],
    lotPrefix: product.lotPrefix ?? "",
    lotDigits: String(product.lotDigits),
    active: flagText(product.active),
  }
}

const savedProductColumns = {
  product: products,
  uomCode: uoms.code,
  categoryPath: sql<
    string | null
  >`(select path from product_category_paths where id = ${products.categoryId})`,
}

export async function exportProducts(format: SpreadsheetFormat) {
  const rows = await db
    .select(savedProductColumns)
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .orderBy(asc(products.sku))
  const values = rows.map(({ product, uomCode, categoryPath }) => {
    const sheet = sheetValues({ ...product, uomCode, categoryPath })
    return PRODUCT_COLUMNS.map((column) => sheet[column.key])
  })
  return writeSpreadsheet(format, "Produk", exportColumns(PRODUCT_COLUMNS), values)
}

const rowSchema = z
  .object({ sku: skuField, ...productFields, active: checkbox })
  .superRefine(pairCeisaUnit, ALWAYS)
  .superRefine(prefixNeedsTracking, ALWAYS)

type ProductInput = z.output<typeof rowSchema>

// Kode HS boleh ditulis dengan titik ("8471.30.00"). Excel sering membuang angka 0 di depan
// kode HS bab 01–09 (dibaca sebagai angka), jadi 7 digit dilengkapi lagi jadi 8.
function hsCodeValue(value: string | undefined) {
  const digits = (value ?? "").replace(/[.\s]/g, "")
  return /^\d{7}$/.test(digits) ? `0${digits}` : digits
}

// Pelacakan: label, kode, atau nilai kolom lama Wajib lot (Ya/Tidak). Kosong = tanpa pelacakan.
function trackingValue(value: string) {
  if (!value.trim()) return "none" as const
  const flag = parseFlag(value, false)
  if (flag !== undefined) return flag ? ("lot" as const) : ("none" as const)
  return matchOption(value, PRODUCT_TRACKING_LABELS)
}

// Jalur kategori dibandingkan tanpa membedakan huruf besar/kecil dan spasi di sekitar "/".
function normalizePath(path: string) {
  return path
    .split("/")
    .map((part) => part.trim().toLowerCase())
    .join(" / ")
}

export async function importProductRows(
  tx: Transaction,
  rows: ImportRow<ProductKey>[],
): Promise<ImportResult> {
  const lookups = await loadLookups(tx, rows)
  const errors = new RowErrors()
  const duplicates = new DuplicateKeys()
  const creates: (ProductInput & { uomId: string })[] = []
  const updates: { id: string; values: ProductInput }[] = []
  let unchanged = 0

  for (const row of rows) {
    const sku = row.values.sku ?? ""
    const saved = lookups.products.get(sku)
    const sheet: SheetValues = { ...(saved && sheetValues(saved)), ...row.values }
    const messages: string[] = []
    // Kolom yang kesalahannya sudah dilaporkan dengan pesan yang lebih jelas dari schema.
    const reported = new Set<string>()

    const duplicate = duplicates.check(sku, row.line, "SKU")
    if (duplicate) messages.push(duplicate)

    const category = sheet.category ? matchOption(sheet.category, INVENTORY_CATEGORY_LABELS) : ""
    if (category === undefined) {
      reported.add("category")
      messages.push(
        `Kategori "${sheet.category}" tidak dikenal. Pilih ${optionList(INVENTORY_CATEGORY_LABELS)}.`,
      )
    }
    const categoryPath = (sheet.productCategory ?? "").trim()
    const productCategory = categoryPath
      ? lookups.categories.get(normalizePath(categoryPath))
      : undefined
    if (
      categoryPath &&
      (!productCategory || (!productCategory.active && productCategory.id !== saved?.categoryId))
    ) {
      messages.push(`Kategori produk "${categoryPath}" tidak ditemukan atau sudah diarsipkan.`)
    }
    const tracking = trackingValue(sheet.tracking ?? "")
    if (tracking === undefined) {
      reported.add("tracking")
      messages.push(
        `Pelacakan "${sheet.tracking}" tidak dikenal. Pilih ${optionList(PRODUCT_TRACKING_LABELS)}.`,
      )
    }
    const active = parseFlag(sheet.active ?? "", true)
    if (active === undefined) messages.push("Aktif harus Ya atau Tidak.")

    const parsed = rowSchema.safeParse({
      ...sheet,
      categoryId: productCategory?.id,
      category: category || undefined,
      hsCode: hsCodeValue(sheet.hsCode),
      ceisaUnitCode: sheet.ceisaUnitCode?.toUpperCase(),
      tracking,
      lotPrefix: sheet.lotPrefix?.toUpperCase(),
      lotDigits: sheet.lotDigits?.trim() || "6",
      active: active === false ? undefined : "on",
    })
    if (!parsed.success) {
      messages.push(...issueMessages(parsed.error, reported))
    }

    const uomCode = (sheet.uom ?? "").toUpperCase()
    const uom = lookups.uoms.get(uomCode)
    if (saved) {
      if (uomCode !== saved.uomCode.toUpperCase()) {
        messages.push(`Satuan stok tidak bisa diubah (tersimpan: ${saved.uomCode}).`)
      }
    } else if (!uomCode) {
      messages.push("Satuan stok wajib diisi.")
    } else if (!uom?.usable) {
      messages.push(`Satuan stok ${sheet.uom} tidak ditemukan atau sudah diarsipkan.`)
    }

    // Diperiksa walaupun field lain gagal, supaya semua kesalahan baris ini tampil sekaligus.
    const hsCode = hsCodeValue(sheet.hsCode)
    if (/^\d{8}$/.test(hsCode) && hsCode !== saved?.hsCode && !lookups.hsCodes.get(hsCode)) {
      messages.push(`Kode HS ${hsCode} tidak ada di referensi kepabeanan.`)
    }
    const ceisaUnitCode = sheet.ceisaUnitCode?.toUpperCase()
    if (
      ceisaUnitCode &&
      ceisaUnitCode !== saved?.ceisaUnitCode &&
      !lookups.ceisaUnits.get(ceisaUnitCode)
    ) {
      messages.push(`Satuan CEISA ${ceisaUnitCode} tidak ada di referensi kepabeanan.`)
    }

    if (messages.length || !parsed.success) {
      errors.add(row.line, sku, messages)
      continue
    }
    if (!saved) {
      creates.push({ ...parsed.data, uomId: uom!.id })
    } else {
      // SKU ikut di-set dengan nilai yang sama; trigger products_guard hanya menolak perubahan.
      if (changed(saved, parsed.data)) updates.push({ id: saved.id, values: parsed.data })
      else unchanged++
    }
  }

  if (errors.count) return errors.result(rows.length)

  for (const batch of chunks(creates, INSERT_BATCH_SIZE)) await tx.insert(products).values(batch)
  for (const { id, values } of updates) {
    await tx.update(products).set(values).where(eq(products.id, id))
  }
  return {
    status: "imported",
    total: rows.length,
    created: creates.length,
    updated: updates.length,
    unchanged,
  }
}

function changed(saved: SavedProduct, values: ProductInput) {
  return (
    saved.name !== values.name ||
    saved.description !== values.description ||
    saved.categoryId !== values.categoryId ||
    saved.category !== values.category ||
    saved.hsCode !== values.hsCode ||
    saved.ceisaUnitCode !== values.ceisaUnitCode ||
    !sameDecimal(saved.ceisaFactor, values.ceisaFactor) ||
    !sameDecimal(saved.netWeight, values.netWeight) ||
    saved.brand !== values.brand ||
    saved.model !== values.model ||
    saved.size !== values.size ||
    saved.tracking !== values.tracking ||
    saved.lotPrefix !== values.lotPrefix ||
    saved.lotDigits !== values.lotDigits ||
    saved.active !== values.active
  )
}

// Semua data pembanding diambil sekali di awal, bukan per baris, supaya 5.000 baris tetap cepat.
async function loadLookups(tx: Transaction, rows: ImportRow<ProductKey>[]) {
  const unique = (values: (string | undefined)[]) =>
    [...new Set(values.filter(Boolean))] as string[]
  const skus = unique(rows.map((row) => row.values.sku))

  // Berurutan: query di satu transaksi memakai satu koneksi, jadi tidak bisa paralel.
  const savedRows = skus.length
    ? await tx
        .select(savedProductColumns)
        .from(products)
        .innerJoin(uoms, eq(uoms.id, products.uomId))
        .where(inArray(products.sku, skus))
    : []
  const uomRows = await tx
    .select({
      id: uoms.id,
      code: uoms.code,
      usable: sql<boolean>`${uoms.active} and ${uomCategories.active}`,
    })
    .from(uoms)
    .innerJoin(uomCategories, eq(uomCategories.id, uoms.categoryId))
    // Satuan stok selalu satuan umum.
    .where(isNull(uoms.productId))
  const hsCodes = await refCodeStates(
    tx,
    "hs_code",
    unique(rows.map((row) => hsCodeValue(row.values.hsCode))),
  )
  const ceisaUnits = await refCodeStates(
    tx,
    "ceisa_unit",
    unique(rows.map((row) => row.values.ceisaUnitCode?.toUpperCase())),
  )

  const categoryRows = await tx.execute<{ id: string; path: string; active: boolean }>(sql`
    select c.id, p.path, c.active
    from product_categories c join product_category_paths p on p.id = c.id`)

  return {
    products: new Map(
      savedRows.map(({ product, uomCode, categoryPath }) => [
        product.sku,
        { ...product, uomCode, categoryPath },
      ]),
    ),
    categories: new Map(categoryRows.rows.map((row) => [normalizePath(row.path), row])),
    uoms: new Map(uomRows.map((uom) => [uom.code.toUpperCase(), uom])),
    hsCodes,
    ceisaUnits,
  }
}
