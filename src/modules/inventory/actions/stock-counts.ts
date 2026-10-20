"use server"

import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { optionalText } from "@/lib/form-fields"
import { STOCK_COUNT_INITIAL_COUNTED } from "@/modules/inventory/lib/inventory"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { importFileSchema, readImportFile } from "@/server/master-io/common"
import { COUNT_COLUMNS, importStockCountRows } from "@/modules/inventory/server/stock-count-io"
import {
  locationPaths,
  lots,
  products,
  stockCountLines,
  stockCountProducts,
  stockCounts,
  warehouses,
} from "@/server/db/schema"

// Stock opname (backlog M2-09 dan R-13, PRD bagian 6.5). Manajer membuat, memulai (gudang
// dibekukan), menyetujui, menolak, dan membatalkan sesi (izin inventory:approve); admin gudang
// mengisi qty fisik, menyelesaikan hitung, dan mengajukan (inventory:write). Aturan lingkup lokasi,
// status, qty sistem, dan pembuatan penyesuaian ada di database (migrasi stock_count_rules).

const optionalUuid = z
  .union([z.uuid("Lokasi tidak valid."), z.literal("")])
  .optional()
  .transform((value) => value || null)

async function assertWarehouseAccess(tx: Transaction, userId: string, warehouseId: string) {
  const [row] = await tx
    .select({ allowed: sql<boolean>`can_access_warehouse(${userId}, ${warehouses.id})` })
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId))
  if (!row) throw new AppError("Gudang tidak ditemukan.")
  if (!row.allowed) throw new AppError("Anda tidak punya akses ke gudang ini.")
}

const optionalCategory = z
  .union([z.uuid("Kategori produk tidak valid."), z.literal("")])
  .optional()
  .transform((value) => value || null)

// Produk tertentu (I-04): daftar id produk sebagai JSON di satu field form.
const productIdsField = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) return []
    try {
      const parsed = z.array(z.uuid()).safeParse(JSON.parse(value))
      if (parsed.success) return [...new Set(parsed.data)]
    } catch {
      // ditangani di bawah
    }
    ctx.addIssue({ code: "custom", message: "Daftar produk tidak terbaca. Muat ulang halaman." })
    return z.NEVER
  })

// Sesi baru berstatus Draft (R-13, I-04): lingkup gudang, opsional lokasi (beserta sub-lokasinya),
// kategori produk (beserta sub-kategorinya), dan produk tertentu; produk tanpa stok ikut dihitung
// bila dipilih; qty hitung awal kosong, 0, atau qty sistem. Daftar hitung diisi saat mulai hitung.
export const createStockCount = defineFormAction({
  name: "createStockCount",
  permission: "inventory:approve",
  schema: z.object({
    warehouseId: z.uuid("Pilih gudang."),
    locationId: optionalUuid,
    productCategoryId: optionalCategory,
    productIds: productIdsField,
    includeZeroStock: z
      .string()
      .optional()
      .transform((value) => value === "on" || value === "true"),
    initialCounted: z.enum(STOCK_COUNT_INITIAL_COUNTED, "Pilih qty hitung awal.").default("empty"),
    notes: optionalText("Catatan", 1000),
  }),
  successMessage: "Sesi opname dibuat sebagai Draft.",
  handler: async ({ input, user, tx }) => {
    await assertWarehouseAccess(tx, user.id, input.warehouseId)
    const [session] = await tx
      .insert(stockCounts)
      .values({
        status: "draft",
        warehouseId: input.warehouseId,
        locationId: input.locationId,
        productCategoryId: input.productCategoryId,
        includeZeroStock: input.includeZeroStock,
        initialCounted: input.initialCounted,
        notes: input.notes,
      })
      .returning({ id: stockCounts.id })
    if (input.productIds.length) {
      await tx
        .insert(stockCountProducts)
        .values(input.productIds.map((productId) => ({ stockCountId: session.id, productId })))
    }
    return session
  },
})

async function lineSession(tx: Transaction, lineId: string) {
  const [line] = await tx
    .select({ warehouseId: stockCounts.warehouseId, countId: stockCounts.id })
    .from(stockCountLines)
    .innerJoin(stockCounts, eq(stockCounts.id, stockCountLines.stockCountId))
    .where(eq(stockCountLines.id, lineId))
  if (!line) throw new AppError("Baris hitung tidak ditemukan.")
  return line
}

// Qty fisik satu baris; kosong = belum dihitung. Disimpan per baris supaya hitungan di HP tidak
// hilang bila koneksi putus.
export const recordCount = defineAction({
  name: "recordCount",
  permission: "inventory:write",
  refresh: false,
  schema: z.object({
    lineId: z.uuid("Baris hitung tidak valid."),
    qty: z
      .string()
      .transform((value) => value.trim().replace(",", "."))
      .refine(
        (value) => value === "" || /^\d+(\.\d{1,4})?$/.test(value),
        "Qty harus angka 0 atau lebih, maksimal 4 desimal.",
      ),
  }),
  handler: async ({ input, user, tx }) => {
    const line = await lineSession(tx, input.lineId)
    await assertWarehouseAccess(tx, user.id, line.warehouseId)
    const counted = input.qty === ""
    await tx
      .update(stockCountLines)
      .set({
        countedQty: counted ? null : input.qty,
        countedBy: counted ? null : user.id,
        countedAt: counted ? null : new Date(),
      })
      .where(eq(stockCountLines.id, input.lineId))
  },
})

// Barang yang ditemukan tapi tidak ada di daftar hitung (qty sistem 0). Lot baru boleh dibuat,
// sama seperti barang masuk.
export const addCountLine = defineAction({
  name: "addCountLine",
  permission: "inventory:write",
  schema: z.object({
    countId: z.uuid("Sesi opname tidak valid."),
    productId: z.uuid("Pilih produk."),
    locationId: z.uuid("Pilih lokasi."),
    lotName: optionalText("Nomor lot", 50),
  }),
  successMessage: "Barang ditambahkan ke daftar hitung.",
  handler: async ({ input, user, tx }) => {
    const [session] = await tx
      .select({ warehouseId: stockCounts.warehouseId })
      .from(stockCounts)
      .where(eq(stockCounts.id, input.countId))
    if (!session) throw new AppError("Sesi opname tidak ditemukan.")
    await assertWarehouseAccess(tx, user.id, session.warehouseId)

    let lotId: string | null = null
    if (input.lotName) {
      const [existing] = await tx
        .select({ id: lots.id })
        .from(lots)
        .where(and(eq(lots.productId, input.productId), eq(lots.name, input.lotName)))
      lotId =
        existing?.id ??
        (
          await tx
            .insert(lots)
            .values({ productId: input.productId, name: input.lotName })
            .returning({ id: lots.id })
        )[0].id
    }
    const inserted = await tx
      .insert(stockCountLines)
      .values({
        stockCountId: input.countId,
        productId: input.productId,
        locationId: input.locationId,
        lotId,
      })
      .onConflictDoNothing()
      .returning({ id: stockCountLines.id })
    if (!inserted.length) throw new AppError("Barang ini sudah ada di daftar hitung.")
    return inserted[0]
  },
})

const countInput = z.object({ id: z.uuid("Sesi opname tidak valid.") })

async function assertCountAccess(tx: Transaction, userId: string, id: string) {
  const [session] = await tx
    .select({ warehouseId: stockCounts.warehouseId })
    .from(stockCounts)
    .where(eq(stockCounts.id, id))
  if (!session) throw new AppError("Sesi opname tidak ditemukan.")
  await assertWarehouseAccess(tx, userId, session.warehouseId)
}

// Mulai hitung: daftar hitung dan qty sistem diambil dari saldo, gudang dibekukan.
export const startStockCount = defineAction({
  name: "startStockCount",
  permission: "inventory:approve",
  schema: countInput,
  successMessage:
    "Penghitungan dimulai. Gudang dibekukan: transfer di gudang ini tidak bisa divalidasi sampai opname disetujui atau dibatalkan.",
  handler: async ({ input, user, tx }) => {
    await assertCountAccess(tx, user.id, input.id)
    await tx.execute(sql`select start_stock_count(${input.id})`)
  },
})

export const completeStockCount = defineAction({
  name: "completeStockCount",
  permission: "inventory:write",
  schema: countInput,
  successMessage: "Penghitungan selesai. Periksa selisihnya, lalu ajukan persetujuan.",
  handler: async ({ input, user, tx }) => {
    await assertCountAccess(tx, user.id, input.id)
    await tx.execute(sql`select complete_stock_count(${input.id})`)
  },
})

export const reopenStockCount = defineAction({
  name: "reopenStockCount",
  permission: "inventory:write",
  schema: countInput,
  successMessage: "Sesi dikembalikan ke penghitungan.",
  handler: async ({ input, user, tx }) => {
    await assertCountAccess(tx, user.id, input.id)
    await tx.execute(sql`select reopen_stock_count(${input.id})`)
  },
})

export const submitStockCount = defineAction({
  name: "submitStockCount",
  permission: "inventory:write",
  schema: countInput,
  successMessage: "Hasil hitung diajukan. Menunggu persetujuan Manajer.",
  handler: async ({ input, user, tx }) => {
    await assertCountAccess(tx, user.id, input.id)
    await tx.execute(sql`select submit_stock_count(${input.id})`)
  },
})

export const rejectStockCount = defineAction({
  name: "rejectStockCount",
  permission: "inventory:approve",
  schema: countInput,
  successMessage: "Hasil opname ditolak dan kembali ke Selesai hitung.",
  handler: async ({ input, user, tx }) => {
    await assertCountAccess(tx, user.id, input.id)
    await tx.execute(sql`select reject_stock_count(${input.id})`)
  },
})

export const approveStockCount = defineAction({
  name: "approveStockCount",
  permission: "inventory:approve",
  schema: countInput,
  successMessage: "Sesi opname disetujui. Selisih tercatat sebagai penyesuaian dan gudang dibuka.",
  handler: async ({ input, user, tx }) => {
    await assertCountAccess(tx, user.id, input.id)
    await tx.execute(sql`select approve_stock_count(${input.id})`)
  },
})

export const cancelStockCount = defineAction({
  name: "cancelStockCount",
  permission: "inventory:approve",
  schema: countInput,
  successMessage: "Sesi opname dibatalkan. Gudang dibuka kembali.",
  handler: async ({ input, user, tx }) => {
    await assertCountAccess(tx, user.id, input.id)
    await tx.execute(sql`select cancel_stock_count(${input.id})`)
  },
})

// Impor hasil hitung dari Excel/CSV daftar hitung (I-04): semua baris diperiksa dulu, kesalahan
// dilaporkan per baris, dan tidak ada yang disimpan bila satu saja salah.
export const importStockCount = defineFormAction({
  name: "importStockCount",
  permission: "inventory:write",
  schema: importFileSchema.extend({ countId: z.uuid("Sesi opname tidak valid.") }),
  handler: async ({ input, user, tx }) => {
    await assertCountAccess(tx, user.id, input.countId)
    return importStockCountRows(
      tx,
      input.countId,
      user.id,
      await readImportFile(input.file, COUNT_COLUMNS, "sku"),
    )
  },
})

export type CountScanResult =
  | { status: "needs_lot"; sku: string; productName: string; tracking: "lot" | "serial" }
  | {
      status: "counted"
      lineId: string
      sku: string
      productName: string
      locationPath: string
      lot: string | null
      qty: string
      found: boolean
    }

// Layar scan opname (I-04): setiap pindaian product code (dan lot/nomor seri untuk produk
// berpelacakan) menambah qty hitung 1 dan langsung disimpan. Lokasi dipilih dengan memindai kode
// lokasi; tanpa lokasi, produk harus punya tepat satu baris di daftar hitung. Barang yang tidak
// ada di daftar ditambahkan sebagai barang temuan di lokasi yang dipilih.
export const scanCountItem = defineAction({
  name: "scanCountItem",
  permission: "inventory:write",
  refresh: false,
  schema: z.object({
    countId: z.uuid("Sesi opname tidak valid."),
    code: z.string().trim().min(1, "Pindai product code.").max(100),
    locationId: z.uuid().nullable(),
    lot: z.string().trim().max(50, "Lot/seri maksimal 50 karakter.").nullable(),
  }),
  handler: async ({ input, user, tx }): Promise<CountScanResult> => {
    await assertCountAccess(tx, user.id, input.countId)
    const [product] = await tx
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        tracking: products.tracking,
      })
      .from(products)
      .where(sql`lower(${products.sku}) = lower(${input.code})`)
    if (!product) throw new AppError(`Kode ${input.code} bukan product code yang dikenal.`)
    const lot = input.lot || null
    if (product.tracking !== "none" && !lot) {
      return {
        status: "needs_lot",
        sku: product.sku,
        productName: product.name,
        tracking: product.tracking,
      }
    }

    const candidates = await tx
      .select({
        id: stockCountLines.id,
        locationId: stockCountLines.locationId,
        locationPath: locationPaths.path,
        counted: stockCountLines.countedQty,
      })
      .from(stockCountLines)
      .innerJoin(locationPaths, eq(locationPaths.id, stockCountLines.locationId))
      .leftJoin(lots, eq(lots.id, stockCountLines.lotId))
      .where(
        and(
          eq(stockCountLines.stockCountId, input.countId),
          eq(stockCountLines.productId, product.id),
          lot ? sql`lower(${lots.name}) = lower(${lot})` : sql`${stockCountLines.lotId} is null`,
          input.locationId ? eq(stockCountLines.locationId, input.locationId) : undefined,
        ),
      )
      .for("update", { of: stockCountLines })
    if (candidates.length > 1) {
      throw new AppError(
        `${product.sku} ada di beberapa lokasi (${candidates.map((line) => line.locationPath).join(", ")}). Pindai kode lokasi dulu.`,
      )
    }

    let line = candidates[0]
    let found = false
    if (!line) {
      if (!input.locationId) {
        throw new AppError(
          `${product.sku}${lot ? ` ${lot}` : ""} tidak ada di daftar hitung. Pindai kode lokasinya dulu untuk mencatatnya sebagai barang temuan.`,
        )
      }
      let lotId: string | null = null
      if (lot) {
        const [saved] = await tx
          .select({ id: lots.id })
          .from(lots)
          .where(and(eq(lots.productId, product.id), eq(lots.name, lot)))
        lotId =
          saved?.id ??
          (
            await tx
              .insert(lots)
              .values({ productId: product.id, name: lot })
              .returning({ id: lots.id })
          )[0].id
      }
      const [inserted] = await tx
        .insert(stockCountLines)
        .values({
          stockCountId: input.countId,
          productId: product.id,
          locationId: input.locationId,
          lotId,
        })
        .returning({ id: stockCountLines.id, locationId: stockCountLines.locationId })
      const [path] = await tx
        .select({ path: locationPaths.path })
        .from(locationPaths)
        .where(eq(locationPaths.id, inserted.locationId))
      line = { ...inserted, locationPath: path.path, counted: null }
      found = true
    }

    if (product.tracking === "serial" && Number(line.counted ?? 0) >= 1) {
      throw new AppError(`Nomor seri ${lot} sudah dihitung.`)
    }
    const [saved] = await tx
      .update(stockCountLines)
      .set({
        countedQty: sql`coalesce(${stockCountLines.countedQty}, 0) + 1`,
        countedBy: user.id,
        countedAt: new Date(),
      })
      .where(eq(stockCountLines.id, line.id))
      .returning({ qty: stockCountLines.countedQty })
    return {
      status: "counted",
      lineId: line.id,
      sku: product.sku,
      productName: product.name,
      locationPath: line.locationPath,
      lot,
      qty: saved.qty ?? "1",
      found,
    }
  },
})
