"use server"

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { z } from "zod"

import { optionalText } from "@/lib/form-fields"
import { TRANSFER_TYPES, type TransferType } from "@/lib/inventory"
import { transferLinesField, type TransferLineInput } from "@/lib/transfer"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { locations, lots, products, stockMoves, transfers } from "@/server/db/schema"

// Transfer inventory (PRD bagian 6, backlog M2-03 dst.): simpan draft, tandai siap, validasi,
// batal. Aturan stok, lokasi, dan penguncian dipaksakan database (validate_transfer dan trigger
// di migrasi inventory_rules/validate_transfer); di sini hanya menyusun data dan meneruskan
// pesan kesalahannya.

// Lokasi virtual di sisi luar transfer, dibuat seed. Transfer internal tidak punya sisi luar:
// kedua lokasinya dipilih user.
const VIRTUAL_SIDE: Partial<Record<TransferType, "vendor" | "customer">> = {
  receipt: "vendor",
  delivery: "customer",
}

// Barang masuk ke gudang: lokasi yang dipilih user adalah tujuan.
const INBOUND: TransferType[] = ["receipt"]

// Lokasi gudang yang dipilih user harus ada dan gudangnya boleh diakses (PRD bagian 3).
async function warehouseLocationErrors(
  tx: Transaction,
  userId: string,
  locationId: string,
  messages: { missing: string; forbidden: string },
) {
  const [location] = await tx
    .select({
      warehouseId: locations.warehouseId,
      allowed: sql<boolean>`can_access_warehouse(${userId}, ${locations.warehouseId})`,
    })
    .from(locations)
    .where(eq(locations.id, locationId))
  if (!location?.warehouseId) return [messages.missing]
  if (!location.allowed) return [messages.forbidden]
  return []
}

const optionalDate = z
  .string()
  .optional()
  .transform((value) => value || null)
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Tanggal tidak valid.")

const optionalUuid = (label: string) =>
  z
    .union([z.uuid(`${label} tidak valid.`), z.literal("")])
    .optional()
    .transform((value) => value || null)

export const saveTransfer = defineFormAction({
  name: "saveTransfer",
  permission: "inventory:write",
  schema: z.object({
    id: optionalUuid("Transfer"),
    type: z.enum(TRANSFER_TYPES),
    partnerId: optionalUuid("Partner"),
    locationId: z.uuid("Pilih lokasi gudang."),
    // Lokasi tujuan transfer internal.
    otherLocationId: optionalUuid("Lokasi tujuan"),
    scheduledDate: optionalDate,
    reference: optionalText("Referensi", 100),
    notes: optionalText("Catatan", 2000),
    lines: transferLinesField,
  }),
  successMessage: "Transfer disimpan.",
  handler: async ({ input, user, tx }) => {
    const errors: string[] = []
    const virtualType = VIRTUAL_SIDE[input.type]
    if (!virtualType && input.type !== "internal") {
      throw new AppError("Jenis transfer ini belum didukung.")
    }
    if (virtualType && !input.partnerId) errors.push(`Pilih ${virtualType}.`)
    errors.push(
      ...(await warehouseLocationErrors(tx, user.id, input.locationId, {
        missing: "Lokasi gudang tidak ditemukan.",
        forbidden: "Anda tidak punya akses ke gudang lokasi ini.",
      })),
    )

    let otherId: string | undefined
    if (input.type === "internal") {
      if (!input.otherLocationId) errors.push("Pilih lokasi tujuan.")
      else if (input.otherLocationId === input.locationId) {
        errors.push("Lokasi asal dan tujuan harus berbeda.")
      } else {
        errors.push(
          ...(await warehouseLocationErrors(tx, user.id, input.otherLocationId, {
            missing: "Lokasi tujuan tidak ditemukan.",
            forbidden: "Anda tidak punya akses ke gudang lokasi tujuan.",
          })),
        )
      }
      otherId = input.otherLocationId ?? undefined
    } else {
      const [outside] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.type, virtualType!),
            isNull(locations.warehouseId),
            eq(locations.active, true),
          ),
        )
        .orderBy(asc(locations.code))
        .limit(1)
      if (!outside) errors.push(`Lokasi virtual ${virtualType} belum ada. Hubungi Administrator.`)
      otherId = outside?.id
    }
    if (errors.length) throw new AppError(errors)

    const inbound = INBOUND.includes(input.type)
    const header = {
      partnerId: virtualType ? input.partnerId : null,
      sourceLocationId: inbound ? otherId! : input.locationId,
      destinationLocationId: inbound ? input.locationId : otherId!,
      scheduledDate: input.scheduledDate,
      reference: input.reference,
      notes: input.notes,
    }

    let id = input.id
    if (id) {
      const [saved] = await tx
        .select({ status: transfers.status, type: transfers.type })
        .from(transfers)
        .where(eq(transfers.id, id))
      if (!saved || saved.type !== input.type) throw new AppError("Transfer tidak ditemukan.")
      if (saved.status !== "draft") {
        throw new AppError("Hanya transfer Draft yang bisa diubah. Kembalikan ke Draft dulu.")
      }
      await tx.update(transfers).set(header).where(eq(transfers.id, id))
      await tx.delete(stockMoves).where(eq(stockMoves.transferId, id))
    } else {
      const [row] = await tx
        .insert(transfers)
        .values({ type: input.type, ...header })
        .returning({ id: transfers.id })
      id = row.id
    }

    await insertLines(tx, id, header, input.lines, inbound)
    return { id }
  },
})

// Baris barang: lot dicari atau dibuat per produk. Qty dalam satuan stok dihitung database.
async function insertLines(
  tx: Transaction,
  transferId: string,
  header: { sourceLocationId: string; destinationLocationId: string },
  lines: TransferLineInput[],
  // Barang masuk boleh membawa lot baru; barang keluar hanya lot yang sudah ada.
  createLots: boolean,
) {
  const lotIds = new Map<string, string>()
  const lotKey = (productId: string, name: string) => `${productId}|${name}`
  const wanted = lines.filter((line) => line.lotName)
  if (wanted.length) {
    const existing = await tx
      .select({ id: lots.id, productId: lots.productId, name: lots.name })
      .from(lots)
      .where(
        inArray(
          lots.productId,
          wanted.map((line) => line.productId),
        ),
      )
    for (const lot of existing) lotIds.set(lotKey(lot.productId, lot.name), lot.id)
    if (!createLots) {
      const missing = lines.flatMap((line, index) =>
        line.lotName && !lotIds.has(lotKey(line.productId, line.lotName))
          ? [`Baris ${index + 1}: lot ${line.lotName} tidak ada untuk produk ini.`]
          : [],
      )
      if (missing.length) throw new AppError(missing)
    }
    for (const line of wanted) {
      const key = lotKey(line.productId, line.lotName!)
      if (lotIds.has(key)) continue
      const [lot] = await tx
        .insert(lots)
        .values({ productId: line.productId, name: line.lotName! })
        .returning({ id: lots.id })
      lotIds.set(key, lot.id)
    }
  }

  await tx.insert(stockMoves).values(
    lines.map((line, index) => ({
      transferId,
      position: index + 1,
      productId: line.productId,
      lotId: line.lotName ? lotIds.get(lotKey(line.productId, line.lotName)) : null,
      inputQty: line.inputQty,
      inputUomId: line.uomId,
      sourceLocationId: header.sourceLocationId,
      destinationLocationId: header.destinationLocationId,
    })),
  )
}

const idInput = z.object({ id: z.uuid("Transfer tidak valid.") })

async function transferStatus(tx: Transaction, id: string) {
  const [row] = await tx
    .select({ status: transfers.status })
    .from(transfers)
    .where(eq(transfers.id, id))
  if (!row) throw new AppError("Transfer tidak ditemukan.")
  return row.status
}

// Siap: data lengkap (PRD bagian 6.3). Ketersediaan stok dan syarat lain dicek lagi saat validasi.
export const markTransferReady = defineAction({
  name: "markTransferReady",
  permission: "inventory:write",
  schema: idInput,
  successMessage: "Transfer ditandai Siap.",
  handler: async ({ input, tx }) => {
    if ((await transferStatus(tx, input.id)) !== "draft") {
      throw new AppError("Hanya transfer Draft yang bisa ditandai Siap.")
    }
    const missingLots = await tx
      .select({ sku: products.sku })
      .from(stockMoves)
      .innerJoin(products, eq(products.id, stockMoves.productId))
      .where(
        and(
          eq(stockMoves.transferId, input.id),
          eq(products.lotRequired, true),
          isNull(stockMoves.lotId),
        ),
      )
    const errors = missingLots.map((row) => `Produk ${row.sku} wajib diisi nomor lot.`)
    // Barang keluar: stok dicek saat Siap dengan aturan yang sama seperti validasi (PRD 6.3).
    const shortages = await tx.execute<{ errors: string[] }>(
      sql`select transfer_stock_errors(${input.id}) as errors`,
    )
    errors.push(...(shortages.rows[0]?.errors ?? []))
    errors.push(...(await returnErrors(tx, input.id)))
    if (errors.length) throw new AppError(errors)
    await tx.update(transfers).set({ status: "ready" }).where(eq(transfers.id, input.id))
  },
})

export const reopenTransfer = defineAction({
  name: "reopenTransfer",
  permission: "inventory:write",
  schema: idInput,
  successMessage: "Transfer dikembalikan ke Draft.",
  handler: async ({ input, tx }) => {
    if ((await transferStatus(tx, input.id)) !== "ready") {
      throw new AppError("Hanya transfer Siap yang bisa dikembalikan ke Draft.")
    }
    await tx.update(transfers).set({ status: "draft" }).where(eq(transfers.id, input.id))
  },
})

export const cancelTransfer = defineAction({
  name: "cancelTransfer",
  permission: "inventory:write",
  schema: idInput,
  successMessage: "Transfer dibatalkan.",
  handler: async ({ input, tx }) => {
    const status = await transferStatus(tx, input.id)
    if (status !== "draft" && status !== "ready") {
      throw new AppError("Hanya transfer Draft atau Siap yang bisa dibatalkan.")
    }
    await tx
      .update(transfers)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(transfers.id, input.id))
  },
})

// Qty selesai per baris untuk penerimaan/pengiriman parsial (M2-05): boleh 0, koma atau titik.
const doneQuantities = z
  .record(z.string(), z.string())
  .optional()
  .transform((values, ctx) => {
    if (!values) return null
    const result: Record<string, string> = {}
    for (const [moveId, raw] of Object.entries(values)) {
      const value = raw.trim().replace(",", ".")
      if (!z.uuid().safeParse(moveId).success || !/^\d+(\.\d{1,4})?$/.test(value)) {
        ctx.addIssue({
          code: "custom",
          message: "Qty harus angka 0 atau lebih, maksimal 4 desimal.",
        })
        return z.NEVER
      }
      result[moveId] = value
    }
    return result
  })

// Validasi transfer. Tanggal efektif mundur diisi sebagai tanggal (YYYY-MM-DD, WIB) dan disimpan
// pukul 12.00 WIB; kosong = sekarang. Bila qty selesai lebih kecil dari rencana, sisanya
// dipindah ke transfer lanjutan dulu (split_backorder), dalam transaksi yang sama.
export const validateTransfer = defineAction({
  name: "validateTransfer",
  permission: "inventory:write",
  schema: idInput.extend({ effectiveDate: optionalDate, quantities: doneQuantities }),
  successMessage: "Transfer divalidasi. Stok sudah diperbarui.",
  handler: async ({ input, tx }) => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
    const effectiveAt =
      input.effectiveDate && input.effectiveDate !== today
        ? `${input.effectiveDate}T12:00:00+07:00`
        : null
    let backorder: { id: string; number: string } | null = null
    if (input.quantities) {
      const split = await tx.execute<{ id: string | null }>(
        sql`select split_backorder(${input.id}, ${JSON.stringify(input.quantities)}::jsonb) as id`,
      )
      const backorderId = split.rows[0]?.id
      if (backorderId) {
        const [row] = await tx
          .select({ id: transfers.id, number: transfers.number })
          .from(transfers)
          .where(eq(transfers.id, backorderId))
        backorder = row
      }
    }
    await tx.execute(sql`select validate_transfer(${input.id}, ${effectiveAt}::timestamptz)`)
    return { backorder }
  },
})

// Retur (M2-07): batas qty dicek database (return_errors); kosong untuk jenis lain.
async function returnErrors(tx: Transaction, transferId: string) {
  const result = await tx.execute<{ errors: string[] }>(
    sql`select return_errors(${transferId}) as errors`,
  )
  return result.rows[0]?.errors ?? []
}

// Buat retur Draft dari penerimaan/pengiriman Selesai: arah terbalik, partner sama, baris berisi
// sisa qty yang masih bisa diretur (dalam satuan stok).
export const createReturn = defineAction({
  name: "createReturn",
  permission: "inventory:write",
  schema: z.object({ originId: z.uuid("Transfer asal tidak valid.") }),
  successMessage: "Retur dibuat sebagai Draft.",
  handler: async ({ input, user, tx }) => {
    const [origin] = await tx
      .select({
        type: transfers.type,
        status: transfers.status,
        number: transfers.number,
        partnerId: transfers.partnerId,
        sourceLocationId: transfers.sourceLocationId,
        destinationLocationId: transfers.destinationLocationId,
      })
      .from(transfers)
      .where(eq(transfers.id, input.originId))
    if (!origin) throw new AppError("Transfer asal tidak ditemukan.")
    if (origin.status !== "done" || (origin.type !== "receipt" && origin.type !== "delivery")) {
      throw new AppError(
        "Retur hanya bisa dibuat dari penerimaan atau pengiriman yang sudah Selesai.",
      )
    }
    const warehouseSide =
      origin.type === "receipt" ? origin.destinationLocationId : origin.sourceLocationId
    const accessErrors = await warehouseLocationErrors(tx, user.id, warehouseSide, {
      missing: "Lokasi gudang transfer asal tidak ditemukan.",
      forbidden: "Anda tidak punya akses ke gudang transfer asal.",
    })
    if (accessErrors.length) throw new AppError(accessErrors)

    const remaining = await tx.execute<{ product_id: string; lot_id: string | null; qty: string }>(
      sql`select product_id, lot_id, qty::text from returnable_lines(${input.originId})`,
    )
    if (!remaining.rows.length) throw new AppError("Semua barang transfer ini sudah diretur.")

    const header = {
      sourceLocationId: origin.destinationLocationId,
      destinationLocationId: origin.sourceLocationId,
    }
    const [row] = await tx
      .insert(transfers)
      .values({
        type: "return",
        returnOfId: input.originId,
        partnerId: origin.partnerId,
        reference: origin.number,
        ...header,
      })
      .returning({ id: transfers.id })
    const stockUoms = await tx
      .select({ id: products.id, uomId: products.uomId })
      .from(products)
      .where(
        inArray(
          products.id,
          remaining.rows.map((line) => line.product_id),
        ),
      )
    const uomOf = new Map(stockUoms.map((product) => [product.id, product.uomId]))
    await tx.insert(stockMoves).values(
      remaining.rows.map((line, index) => ({
        transferId: row.id,
        position: index + 1,
        productId: line.product_id,
        lotId: line.lot_id,
        inputQty: line.qty,
        inputUomId: uomOf.get(line.product_id)!,
        ...header,
      })),
    )
    return { id: row.id }
  },
})

// Qty retur per baris (dalam satuan stok). 0 = baris dihapus dari retur.
export const saveReturnQuantities = defineAction({
  name: "saveReturnQuantities",
  permission: "inventory:write",
  schema: idInput.extend({
    quantities: z.record(z.uuid(), z.string()).transform((values, ctx) => {
      const result: Record<string, string> = {}
      for (const [moveId, raw] of Object.entries(values)) {
        const value = raw.trim().replace(",", ".")
        if (!/^\d+(\.\d{1,4})?$/.test(value)) {
          ctx.addIssue({
            code: "custom",
            message: "Qty harus angka 0 atau lebih, maksimal 4 desimal.",
          })
          return z.NEVER
        }
        result[moveId] = value
      }
      return result
    }),
  }),
  successMessage: "Qty retur disimpan.",
  handler: async ({ input, tx }) => {
    const [saved] = await tx
      .select({ status: transfers.status, type: transfers.type })
      .from(transfers)
      .where(eq(transfers.id, input.id))
    if (!saved || saved.type !== "return") throw new AppError("Retur tidak ditemukan.")
    if (saved.status !== "draft") {
      throw new AppError("Hanya retur Draft yang bisa diubah. Kembalikan ke Draft dulu.")
    }
    if (Object.values(input.quantities).every((qty) => Number(qty) === 0)) {
      throw new AppError("Isi qty retur minimal satu baris. Untuk membatalkan, batalkan retur.")
    }
    for (const [moveId, qty] of Object.entries(input.quantities)) {
      const where = and(eq(stockMoves.id, moveId), eq(stockMoves.transferId, input.id))
      if (Number(qty) === 0) await tx.delete(stockMoves).where(where)
      else await tx.update(stockMoves).set({ inputQty: qty }).where(where)
    }
    const errors = await returnErrors(tx, input.id)
    if (errors.length) throw new AppError(errors)
  },
})
